import { DjDeck, DjEngine } from './dj-engine';
import { MixPlan, MixTransition } from './auto-mix-planner';
import { TrackAnalysis, analyzeTrack } from './mix-analyzer';
import { Track } from '../../models/models';

/**
 * ============================================================================
 *  YAM DJ — SÉQUENCEUR DE MIX AUTO (le DJ qui mixe, en direct)
 * ============================================================================
 *  Exécute un MixPlan sur le moteur Web Audio à 2 decks, en ping-pong :
 *
 *   deck A : piste 1 ──────transition──────┐ (libre) piste 3 ──…
 *   deck B :          piste 2 ──────transition──────┐ (libre) piste 4 ─…
 *
 *  Pour chaque transition, à 10 Hz :
 *  - crossfader equal-power animé (côté sortant → entrant) ;
 *  - automatisation propre au type A..H (relay EQ, filtre, echo out,
 *    break master, relai percussif, sweep flanger) ;
 *  - pitch d'asservissement posé au démarrage de l'entrant ;
 *  - la piste suivante est PRÉCHARGÉE pendant que la courante joue.
 *
 *  Chaque piste est réellement analysée au chargement (mix-analyzer) :
 *  points d'entrée/sortie recalés sur les vraies fins de phrase, énergie
 *  mesurée, normalisation loudness (trim par deck).
 *
 *  Lecture en ARRIÈRE-PLAN : le séquenceur vit dans un service singleton,
 *  pas dans le composant — la musique continue quand on quitte le studio.
 *  MediaSession : contrôle depuis l'écran verrouillé / notifications.
 */

export type AutoPhase = 'idle' | 'preparing' | 'playing' | 'transition' | 'paused' | 'finishing' | 'done' | 'error';

export interface AutoMixSnapshot {
  phase: AutoPhase;
  currentIndex: number;
  nextIndex: number | null;
  /** Position dans le mix (s, temps réel). */
  mixPosition: number;
  mixDuration: number;
  /** Secondes avant la prochaine transition (null si inconnu). */
  countdown: number | null;
  /** Progression de la transition en cours 0..1. */
  transitionProgress: number | null;
  transitionLabel: string | null;
  loadingText: string | null;
  error: string | null;
  /** Analyse réelle de la piste courante (dès qu'elle est mesurée). */
  currentMeasured: TrackAnalysis | null;
  announced: string | null;
  /** Performance DJ V2 : move en cours et geste courant. */
  moveName?: string | null;
  currentAction?: string | null;
  moveReason?: string | null;
}

/** Geste exécuté (journal de performance — l'UI affiche les gestes du DJ). */
export interface PerformanceGesture {
  t: number;          // position dans le mix (s)
  deck: 'A' | 'B' | 'master';
  action: string;
  label: string;
  move: string;
}

export interface AutoMixDeps {
  /** Charge une piste dans un deck (téléchargement + décodage). */
  loadTrack: (track: Track, deck: DjDeck, onProgress: (pct: number, detail: string) => void) => Promise<void>;
  /** Notifie l'UI (signaux du service) — appelé ~10 Hz. */
  onSnapshot: (s: AutoMixSnapshot) => void;
  /** Fin du mix (naturelle ou stop) : blob enregistré éventuel. */
  onFinish: (blob: Blob | null, completed: boolean, reason: string) => void;
  /** Performance V2 : chaque geste exécuté est notifié (timeline live). */
  onAction?: (g: PerformanceGesture) => void;
}

export interface AutoMixRunOptions {
  record: boolean;
  djVoice: boolean;
}

const TICK_MS = 100;

export class AutoMixPlayer {

  protected phase: AutoPhase = 'idle';
  protected idx = 0;
  protected timer: any = null;
  protected mixStartedAt = 0;          // performance.now()
  protected pausedAt = 0;
  protected transStartedAt = 0;        // performance.now()
  protected transDurMs = 0;
  protected currentTrans: MixTransition | null = null;
  protected analyses = new Map<number, TrackAnalysis>();
  protected announcedIdx = -1;
  protected loading: { segIndex: number; started: boolean } | null = null;
  protected errorMsg: string | null = null;
  protected baseMaster = 0.9;
  protected finishing = false;
  protected ended = false;
  protected lastVoiceAt = 0;

  constructor(
    protected engine: DjEngine,
    public plan: MixPlan,
    protected deps: AutoMixDeps,
    protected opts: AutoMixRunOptions
  ) { }

  // ============================ CYCLE DE VIE ============================

  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'preparing';
    this.engine.ctx.resume().catch(() => { });
    this.baseMaster = this.engine.masterVolume;
    if (this.opts.record && this.engine.canRecord) {
      this.engine.startRecording();
    }
    this.emit();
    this.loadSegment(0).then(() => {
      if (this.ended || this.phase !== 'preparing') return;
      const seg = this.plan.segments[0];
      const deck = this.deckOf(0);
      this.startDeck(seg.index, deck);
      this.engine.setCrossfade(deck === this.engine.deckA ? 0 : 1);
      this.mixStartedAt = performance.now();
      this.idx = 0;
      this.phase = 'playing';
      this.announce(0);
      this.kickPreload(1);
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.setMediaSession();
      this.emit();
    }).catch(err => {
      this.fail('Impossible de charger la première piste : ' + (err?.message || 'erreur réseau'));
    });
  }

  pause(): void {
    if (this.phase !== 'playing' && this.phase !== 'transition') return;
    this.engine.deckA.pause();
    this.engine.deckB.pause();
    this.pausedAt = performance.now();
    this.phase = 'paused';
    this.updateMediaPlaybackState(false);
    this.emit();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    const pausedFor = performance.now() - this.pausedAt;
    this.mixStartedAt += pausedFor;
    if (this.phase === 'paused' && this.transStartedAt) this.transStartedAt += pausedFor;
    this.engine.ctx.resume().catch(() => { });
    this.engine.deckA.play();
    this.engine.deckB.play();
    this.phase = this.currentTrans ? 'transition' : 'playing';
    this.updateMediaPlaybackState(true);
    this.emit();
  }

  togglePause(): void {
    this.phase === 'paused' ? this.resume() : this.pause();
  }

  /** Arrêt avec fondu. `completed` = true si le mix était arrivé au bout. */
  stop(fadeSec = 1.5): Promise<void> {
    if (this.ended) return Promise.resolve();
    const wasComplete = this.phase === 'done';
    this.ended = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.clearMediaSession();

    const finish = () => {
      this.engine.deckA.pause();
      this.engine.deckB.pause();
      // fondu de sortie master propre (pas de coupure brutale)
      this.engine.setMasterVolume(0.0001);
      setTimeout(() => {
        this.engine.setMasterVolume(this.baseMaster);
        this.resetDeckFx(this.engine.deckA);
        this.resetDeckFx(this.engine.deckB);
        this.engine.setCrossfade(0.5);
        this.stopRecordingAndFinish(wasComplete, 'arrêté par le DJ');
      }, Math.max(200, fadeSec * 1000));
    };

    if (fadeSec > 0 && (this.engine.deckA.playing || this.engine.deckB.playing)) {
      const from = this.baseMaster;
      const steps = 10;
      let i = 0;
      const fade = setInterval(() => {
        i++;
        this.engine.setMasterVolume(from * (1 - i / steps));
        if (i >= steps) { clearInterval(fade); finish(); }
      }, (fadeSec * 1000) / steps);
    } else {
      finish();
    }
    this.phase = wasComplete ? 'done' : 'idle';
    this.emit();
    return Promise.resolve();
  }

  destroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.ended = true;
    this.clearMediaSession();
  }

  get isRunning(): boolean {
    return !this.ended && this.phase !== 'idle' && this.phase !== 'done' && this.phase !== 'error';
  }

  get currentIndex(): number { return this.idx; }

  get snapshot(): AutoMixSnapshot {
    const seg = this.plan.segments[this.idx];
    const pos = this.mixPositionOf();
    const trans = this.currentTrans;
    const nextIdx = this.idx + 1 < this.plan.segments.length ? this.idx + 1 : null;
    let countdown: number | null = null;
    if (trans && this.phase === 'playing' && seg) {
      const deck = this.deckOf(seg.index);
      const rate = 1 + (deck.pitchPct || 0) / 100;
      const outStartTrack = seg.playTo - (trans.durationSec || 16) * rate;
      countdown = Math.max(0, (outStartTrack - deck.position) / (rate || 1));
    } else if (this.phase === 'transition') {
      countdown = 0;
    } else if (nextIdx == null && this.phase === 'playing' && seg) {
      const deck = this.deckOf(seg.index);
      countdown = Math.max(0, seg.playTo - deck.position);
    }
    return {
      phase: this.phase,
      currentIndex: this.idx,
      nextIndex: nextIdx,
      mixPosition: pos,
      mixDuration: this.plan.totalDurationSec,
      countdown: this.phase === 'paused' ? null : countdown,
      transitionProgress: this.phase === 'transition' && trans
        ? Math.min(1, (performance.now() - this.transStartedAt) / this.transDurMs) : null,
      transitionLabel: trans ? labelOf(trans) : null,
      loadingText: this.loading && this.loading.started ? 'Préchargement de la suite…' : null,
      error: this.errorMsg,
      currentMeasured: this.analyses.get(this.idx) || null,
      announced: null
    };
  }

  // ============================ BOUCLE (10 Hz) ============================

  protected tick(): void {
    if (this.ended) return;
    if (this.phase === 'paused' || this.phase === 'done' || this.phase === 'error' || this.phase === 'preparing') {
      this.emit();
      return;
    }

    const seg = this.plan.segments[this.idx];
    if (!seg) { this.fail('Segment inconnu'); return; }
    const deck = this.deckOf(seg.index);
    const other = this.otherDeck(deck);

    if (this.phase === 'transition') {
      const p = Math.min(1, (performance.now() - this.transStartedAt) / this.transDurMs);
      if (this.currentTrans) {
        this.applyTransition(p, deck, other);
        if (p >= 1) this.completeTransition(deck, other);
      } else if (p >= 1) {
        // slot de reprise après un saut de piste (chargement en cours)
        this.phase = 'playing';
      }
      this.emit();
      return;
    }

    // ---- phase 'playing' : guetter le moment de la transition ----
    if (!deck.buffer) {
      if (this.loading) { this.emit(); return; }   // chargement en cours : on patiente
      this.fail('Le deck actif a été éjecté (arrêt du mix auto).');
      return;
    }

    const trans = this.plan.transitions[this.idx] || null;

    if (trans) {
      // précharger la suite dès maintenant si pas encore fait
      this.kickPreload(this.idx + 1);
      const nextSeg = this.plan.segments[this.idx + 1];
      const nextReady = !!nextSeg && (other.buffer && other.track && other.track.id === nextSeg.track.id);
      const rate = 1 + (deck.pitchPct || 0) / 100;
      const outStart = seg.playTo - trans.durationSec * rate;
      const nowTrack = deck.position;

      // annonce vocale juste avant la transition
      if (nextSeg && this.opts.djVoice && nowTrack >= outStart - 6 && this.announcedIdx < this.idx + 1) {
        this.announce(this.idx + 1);
      }

      if (nowTrack >= outStart && nextReady) {
        this.beginTransition(deck, other, trans, nextSeg);
      } else if (nowTrack >= outStart && !nextReady) {
        // le suivant n'est pas prêt : on laisse tourner le sortant (max 10 s de grâce)
        if (nowTrack < seg.playTo + 10) {
          if (this.loading && !this.loading.started) this.kickPreload(this.idx + 1);
        } else if (!this.waitedLate) {
          this.waitedLate = true;
          // trop tard : transition d'urgence quand prêt, sinon on saute
          if (!nextReady) this.skipToNext(deck, other, nextSeg);
        }
      }
    } else {
      // ---- dernier segment : fin naturelle ----
      if (deck.position >= seg.playTo && this.phase === 'playing') {
        this.beginFinish(deck);
      }
    }

    this.emit();
  }

  protected waitedLate = false;

  // ============================ TRANSITIONS ============================

  protected beginTransition(out: DjDeck, inn: DjDeck, trans: MixTransition, nextSeg: MixSegment): void {
    this.currentTrans = trans;
    this.transDurMs = Math.max(1500, trans.durationSec * 1000);
    this.transStartedAt = performance.now();
    this.phase = 'transition';

    // pitch d'asservissement (beatmatch)
    if (nextSeg.pitchPct) inn.setPitch(nextSeg.pitchPct);
    else inn.setPitch(0);

    // point d'entrée : meilleur point mesuré si dispo, sinon 0
    const analysis = this.analyses.get(nextSeg.index);
    const from = analysis?.structure.bestIn != null && analysis.structure.bestIn < nextSeg.playTo - 20
      ? nextSeg.playFrom + analysis.structure.bestIn
      : nextSeg.playFrom;

    // types avec entrée retardée (break) : l'entrant part au milieu
    const delayedStart = trans.type === 'F';
    if (!delayedStart) {
      inn.play(Math.max(0, Math.min(from, inn.duration - 1)));
    }
    this.startDeckVolume(inn, nextSeg.index);

    if (trans.type === 'H' || trans.type === 'G') {
      // entrée filtrée : les basses arrivent en cours de route
      inn.setEq('low', -16);
    }
  }

  protected applyTransition(p: number, out: DjDeck, inn: DjDeck): void {
    const eng = this.engine;
    const trans = this.currentTrans!;
    const pe = p * p * (3 - 2 * p); // easing doux (smoothstep)

    // crossfader : du côté du sortant vers celui de l'entrant
    const x = out === eng.deckA ? pe : 1 - pe;
    eng.setCrossfade(x);

    switch (trans.type) {
      case 'C': // EQ : relay des basses
        out.setEq('low', -26 * Math.min(1, pe * 1.5));
        inn.setEq('low', pe < 0.45 ? -14 : -14 + 14 * (pe - 0.45) / 0.55);
        break;
      case 'D': // filtre : HPF montant sur le sortant, l'entrant s'ouvre
        out.setFilter(0.5 + 0.32 * pe);
        inn.setFilter(0.5 + 0.16 * (1 - Math.min(1, pe * 1.6)));
        break;
      case 'E': // echo out sur la fin de phrase du sortant
        if (pe > 0.5) {
          const bpm = out.effectiveBpm || 105;
          out.setEcho(true, Math.min(0.6, 0.15 + (pe - 0.5) * 0.9), 60 / bpm);
        }
        break;
      case 'F': // break : silence rythmique bref puis entrée franche
        if (pe > 0.45 && pe < 0.58) {
          eng.setMasterVolume(this.baseMaster * 0.06);
          if (!inn.playing && inn.buffer) {
            const nextSeg = this.plan.segments[this.idx + 1];
            const a = this.analyses.get(nextSeg.index);
            const from = a?.structure.bestIn != null ? nextSeg.playFrom + a.structure.bestIn : nextSeg.playFrom;
            inn.play(Math.max(0, Math.min(from, inn.duration - 1)));
            this.startDeckVolume(inn, nextSeg.index);
          }
        } else {
          eng.setMasterVolume(this.baseMaster);
        }
        break;
      case 'G': // percussif : basses de l'entrant tenues en retrait puis relâchées
        if (pe < 0.5) inn.setEq('low', -16 - 8 * pe);
        else inn.setEq('low', -24 + 24 * (pe - 0.5) * 2);
        out.setEq('high', 2 * pe);
        break;
      case 'H': // energy drop : sweep flanger sur le sortant, fondu rapide
        if (pe > 0.35) out.setFlanger(true, 0.35 + 0.35 * pe);
        break;
      case 'A':
      case 'B':
      default:
        // crossfade pur (equal-power déjà appliqué)
        break;
    }
  }

  protected completeTransition(out: DjDeck, inn: DjDeck): void {
    const eng = this.engine;
    eng.setCrossfade(inn === eng.deckA ? 0 : 1);
    eng.setMasterVolume(this.baseMaster);

    // l'entrant devient la piste courante ; ses réglages reviennent au neutre
    inn.setEq('low', 0);
    inn.setEq('mid', 0);
    inn.setEq('high', 0);
    inn.setFilter(0.5);
    inn.setEcho(false);
    inn.setFlanger(false);
    inn.setReverb(false);

    // le sortant est libéré et remis à neuf pour la suite
    out.pause();
    this.resetDeckFx(out);

    this.idx += 1;
    this.currentTrans = null;
    this.phase = 'playing';
    this.kickPreload(this.idx + 1);
    this.emit();
  }

  protected skipToNext(deck: DjDeck, other: DjDeck, nextSeg: MixSegment | undefined): void {
    if (!nextSeg) { this.beginFinish(deck); return; }
    // le suivant n'a pas chargé à temps : on tente de le jouer dès prêt (max 6 s de silence)
    this.phase = 'transition';
    this.currentTrans = null;
    this.transDurMs = 2000;
    this.transStartedAt = performance.now();
    this.waitedLate = false;
    // mini fondu de sortie, puis attente du chargement
    const x = deck === this.engine.deckA ? 0.85 : 0.15;
    this.engine.setCrossfade(x);
    deck.pause();
    this.resetDeckFx(deck);
    this.idx += 1;
    this.errorMsg = null;
    this.loadSegment(this.idx).then(() => {
      if (this.ended) return;
      const seg = this.plan.segments[this.idx];
      const d = this.deckOf(seg.index);
      this.startDeck(seg.index, d);
      this.engine.setCrossfade(d === this.engine.deckA ? 0 : 1);
      this.phase = 'playing';
      this.kickPreload(this.idx + 1);
    }).catch(() => {
      if (this.idx + 1 < this.plan.segments.length) {
        this.idx += 1;
        this.skipToNext(deck, other, this.plan.segments[this.idx + 1]);
      } else {
        this.fail('Chargement impossible des pistes suivantes (réseau).');
      }
    });
  }

  // ============================ FIN DU MIX ============================

  protected beginFinish(deck: DjDeck): void {
    this.phase = 'finishing';
    this.finishing = true;
    // fondu de fin naturel : 4 s de master
    const from = this.baseMaster;
    let i = 0;
    const fade = setInterval(() => {
      i++;
      this.engine.setMasterVolume(from * (1 - i / 16));
      if (i >= 16) {
        clearInterval(fade);
        deck.pause();
        this.resetDeckFx(deck);
        this.engine.setMasterVolume(this.baseMaster);
        this.phase = 'done';
        this.ended = true;
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.clearMediaSession();
        this.stopRecordingAndFinish(true, 'mix terminé');
        this.emit();
      }
    }, 250);
  }

  protected stopRecordingAndFinish(completed: boolean, reason: string): void {
    if (this.engine.recording) {
      this.engine.stopRecording().then(blob => {
        this.deps.onFinish(blob || null, completed, reason);
      }).catch(() => this.deps.onFinish(null, completed, reason));
    } else {
      this.deps.onFinish(null, completed, reason);
    }
  }

  // ============================ CHARGEMENT ============================

  protected loadSegment(index: number): Promise<void> {
    const seg = this.plan.segments[index];
    if (!seg) return Promise.reject(new Error('segment absent'));
    const deck = this.deckOf(index);
    this.loading = { segIndex: index, started: true };
    this.emit();
    const p = this.deps.loadTrack(seg.track, deck, (pct, detail) => {
      // progression affichée par le service via snapshot/loading
      void pct; void detail;
    });
    return p.then(() => {
      this.loading = null;
      // ---- analyse réelle du signal dès le buffer dispo ----
      if (deck.buffer) {
        try {
          const analysis = analyzeTrack(seg.track, deck.buffer);
          this.analyses.set(index, analysis);
          seg.measuredEnergy = analysis.energy;
          // recalage fin : sortie sur la vraie fin de phrase, entrée sur l'intro réelle
          if (analysis.structure.bestOut != null) {
            const planned = seg.playTo;
            const measured = seg.playFrom + analysis.structure.bestOut;
            if (Math.abs(measured - planned) < 25 && measured > seg.playFrom + 25) {
              seg.playTo = measured;
            }
          }
          // entrées intermédiaires : l'intro réelle est conservée si elle installe
          // l'ambiance (paramètre introOutro), sinon l'analyse la raccourcira
          // au point d'entrée mesuré lors du démarrage du deck.
        } catch { /* analyse non bloquante */ }
      }
    }).catch(err => {
      this.loading = null;
      throw err;
    });
  }

  protected kickPreload(index: number): void {
    if (this.ended) return;
    if (index >= this.plan.segments.length) return;
    if (this.loading) return;
    const seg = this.plan.segments[index];
    const deck = this.deckOf(index);
    if (deck.track && deck.track.id === seg.track.id && deck.buffer) return;
    if (deck.playing) return; // jamais interrompre un deck qui joue
    this.loading = { segIndex: index, started: true };
    this.loadSegment(index).catch(() => {
      // échec silencieux : re-tenté au prochain tick (avec grâce puis skip)
      this.loading = null;
    });
  }

  protected startDeck(segIndex: number, deck: DjDeck): void {
    const seg = this.plan.segments[segIndex];
    deck.setPitch(seg.pitchPct || 0);
    this.startDeckVolume(deck, segIndex);
    const analysis = this.analyses.get(segIndex);
    const from = analysis?.structure.bestIn != null && segIndex > 0 && analysis.structure.bestIn > 4 && analysis.structure.bestIn < 20
      ? seg.playFrom + analysis.structure.bestIn
      : seg.playFrom;
    deck.play(Math.max(0, Math.min(from, Math.max(0, deck.duration - 1))));
  }

  /** Volume de voie = trim de normalisation loudness (mix homogène). */
  protected startDeckVolume(deck: DjDeck, segIndex: number): void {
    const analysis = this.analyses.get(segIndex);
    const trim = analysis ? analysis.trim : 1;
    deck.setVolume(Math.max(0.5, Math.min(1, trim)));
  }

  protected resetDeckFx(deck: DjDeck): void {
    deck.setEcho(false);
    deck.setReverb(false);
    deck.setFlanger(false);
    deck.setFilter(0.5);
    deck.setEq('low', 0);
    deck.setEq('mid', 0);
    deck.setEq('high', 0);
    deck.setPitch(0);
    deck.setVolume(1);
  }

  // ============================ VOIX DJ ============================

  protected announce(index: number): void {
    if (!this.opts.djVoice) return;
    const seg = this.plan.segments[index];
    if (!seg) return;
    const now = performance.now();
    if (now - this.lastVoiceAt < 4000) return;
    this.lastVoiceAt = now;
    this.announcedIdx = index;
    try {
      if (typeof speechSynthesis === 'undefined') return;
      const u = new SpeechSynthesisUtterance(`${seg.track.artistName}. ${seg.track.title}`);
      u.lang = 'fr-FR';
      u.rate = 1.02;
      u.volume = 0.85;
      speechSynthesis.speak(u);
    } catch { /* voix indisponible : non bloquant */ }
  }

  // ============================ MEDIA SESSION ============================

  protected setMediaSession(): void {
    try {
      const ms = (navigator as any).mediaSession;
      if (!ms) return;
      const first = this.plan.segments[0]?.track;
      const last = this.plan.segments[this.plan.segments.length - 1]?.track;
      ms.metadata = new (window as any).MediaMetadata({
        title: 'Mix Auto · ' + (first?.title || '') + ' → ' + (last?.title || ''),
        artist: 'YAM DJ Studio',
        album: 'Mix automatique'
      });
      ms.setActionHandler('play', () => this.resume());
      ms.setActionHandler('pause', () => this.pause());
      ms.setActionHandler('stop', () => this.stop());
      this.updateMediaPlaybackState(true);
    } catch { /* non supporté */ }
  }

  protected updateMediaPlaybackState(playing: boolean): void {
    try {
      const ms = (navigator as any).mediaSession;
      if (ms?.setPositionState) {
        const dur = this.plan.totalDurationSec || 0;
        if (dur > 0) {
          ms.setPositionState({ duration: dur, position: Math.min(dur, this.mixPositionOf()), playbackRate: 1, });
        }
      }
      if (ms) ms.playbackState = playing ? 'playing' : 'paused';
    } catch { /* non supporté */ }
  }

  protected clearMediaSession(): void {
    try {
      const ms = (navigator as any).mediaSession;
      if (!ms) return;
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('stop', null);
      ms.playbackState = 'none';
    } catch { /* non supporté */ }
  }

  // ============================ DIVERS ============================

  protected deckOf(segIndex: number): DjDeck {
    // ping-pong : segments pairs sur A, impairs sur B
    return segIndex % 2 === 0 ? this.engine.deckA : this.engine.deckB;
  }

  protected otherDeck(deck: DjDeck): DjDeck {
    return deck === this.engine.deckA ? this.engine.deckB : this.engine.deckA;
  }

  protected mixPositionOf(): number {
    if (!this.mixStartedAt) return 0;
    return Math.max(0, (performance.now() - this.mixStartedAt) / 1000);
  }

  protected fail(msg: string): void {
    this.phase = 'error';
    this.errorMsg = msg;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.clearMediaSession();
    this.stopRecordingAndFinish(false, msg);
    this.emit();
  }

  protected emit(): void {
    try { this.deps.onSnapshot(this.snapshot); } catch { /* service parti */ }
  }
}

function labelOf(t: MixTransition): string {
  const names: Record<string, string> = {
    A: 'Beatmatch + crossfade', B: 'Crossfade étendu', C: 'Relay des basses (EQ)',
    D: 'Filtre sweep', E: 'Echo out', F: 'Break', G: 'Relai percussif', H: 'Energy drop'
  };
  return `${names[t.type] || t.type} · ${t.bars} mesures`;
}

/** Segment du plan (ré-export pratique). */
import type { MixSegment } from './auto-mix-planner';
