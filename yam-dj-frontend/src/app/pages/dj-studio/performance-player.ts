/**
 * ============================================================================
 *  YAM DJ — PERFORMANCE PLAYER (le DJ qui JOUE la performance)
 * ============================================================================
 *
 *  Exécute une DjPerformance (moteur de décision) sur les deux decks du
 *  moteur Web Audio existant — comme un DJ humain derrière ses platines :
 *
 *    DECK A (morceau joué)  ←→  DECK B (morceau préparé)
 *
 *  Chaque geste de la performance est positionné en TEMPS MUSICAL (beats
 *  depuis le « 1 » de coupe) puis converti en horodatage réel sur la grille
 *  du deck A. Le scheduler exécute les actions en séquence :
 *
 *    TRACK A → vocal loop 4 temps → HPF sweep → echo → cut → TRACK B drop
 *
 *  Arsenal exécutable : echo (synchro 1/4, 1/2, 1, 2 temps), reverb, filtre
 *  HP/LP avec sweep automatisé, EQ/bass swap, flanger, gate/stutter, loop,
 *  loop roll (4→2→1→½→¼), beat repeat, cut, hard cut, drop switch, vocal
 *  loop, vocal tease, spinback, vinyl brake, tape stop, pitch ramp, riser,
 *  noise sweep, impact, siren, reverse hit, beat jump, silence master.
 *
 *  Hérite du séquenceur existant (chargement, préchargement, arrière-plan,
 *  MediaSession, enregistrement) : la couche performance ne le remplace pas,
 *  elle l'orchestre.
 */

import { DjDeck, DjEngine } from './dj-engine';
import { AutoMixPlayer, AutoMixDeps, AutoMixRunOptions, AutoMixSnapshot, PerformanceGesture } from './auto-mix-player';
import { MixPlan, MixSegment, MixTransition } from './auto-mix-planner';
import { DjPerformance, PlannedMove } from './performance-engine';

interface PendingStep {
  atBeats: number;
  action: string;
  target: 'out' | 'in' | 'master';
  params: Record<string, number>;
  label: string;
  /** Échéance en ms (performance.now()). */
  atWall: number;
  timer: any | null;
  executed: boolean;
}

/** Convertit une fréquence HPF (20..4000 Hz) en position de filtre 0.5..1. */
function hzToFilterPos(hz: number): number {
  const h = Math.max(20, Math.min(4000, hz));
  return 0.5 + 0.5 * Math.log(h / 20) / Math.log(4000 / 20);
}

export class PerformancePlayer extends AutoMixPlayer {

  private perf: DjPerformance;
  private currentMove: PlannedMove | null = null;
  private pending: PendingStep[] = [];
  private oneShots: { stop: () => void }[] = [];
  private rampIntervals: any[] = [];
  private pauseAt = 0;
  private beatLenOut = 0.571;
  private cutTime = 0;
  private inStarted = false;
  private rollEnd: number | null = null;
  private silenceTimer: any = null;

  constructor(
    engine: DjEngine,
    plan: MixPlan,
    deps: AutoMixDeps,
    opts: AutoMixRunOptions,
    performance: DjPerformance
  ) {
    super(engine, plan, deps, opts);
    this.perf = performance;
  }

  // ============================ SNAPSHOT (UI) ============================

  override get snapshot(): AutoMixSnapshot {
    const s = super.snapshot;
    if (this.currentMove) {
      s.moveName = this.currentMove.name;
      s.moveReason = this.currentMove.reason;
      s.transitionLabel = `${this.currentMove.name} · ${this.currentMove.bars} mesures`;
      const last = this.lastGesture;
      if (last && this.phase === 'transition') {
        s.currentAction = last.label;
      }
    }
    return s;
  }

  private lastGesture: PerformanceGesture | null = null;

  // ============================ CYCLE DE VIE ============================

  override pause(): void {
    if (this.phase !== 'playing' && this.phase !== 'transition') return;
    this.pauseAt = performance.now();
    this.pauseScheduler();
    super.pause();
  }

  override resume(): void {
    if (this.phase !== 'paused') return;
    const shift = performance.now() - this.pauseAt;
    this.resumeScheduler(shift);
    super.resume();
  }

  override stop(fadeSec = 1.5): Promise<void> {
    this.clearPerformance();
    return super.stop(fadeSec);
  }

  override destroy(): void {
    this.clearPerformance();
    super.destroy();
  }

  // ============================ TRANSITION → PERFORMANCE ============================

  protected override beginTransition(out: DjDeck, inn: DjDeck, trans: MixTransition, nextSeg: MixSegment): void {
    const move = this.perf.moves.find(m => m.fromIndex === this.idx) || null;
    this.currentMove = move;
    this.inStarted = false;

    if (!move) {
      // pas de move pour cette transition (plan sans performance) → comportement standard
      super.beginTransition(out, inn, trans, nextSeg);
      return;
    }

    const outSeg = this.plan.segments[this.idx];
    this.cutTime = outSeg.playTo;
    const bpmOut = outSeg.effectiveBpm || 105;
    this.beatLenOut = 60 / bpmOut;
    this.rollEnd = null;

    // fenêtre de transition : durée du move + gestes post-coupe (fade de
    // l'ancien deck, relâchement des basses...)
    const postBeats = Math.max(0, ...move.steps.map(s => s.atBeats));
    this.currentTrans = trans;
    this.transDurMs = Math.max(1200, (move.durationSec + postBeats * this.beatLenOut) * 1000);
    this.transStartedAt = performance.now();
    this.phase = 'transition';

    // pitch d'asservissement de l'entrant (beatmatch du planner)
    inn.setPitch(nextSeg.pitchPct || 0);

    // recalage fin du point de coupe sur la grille réelle (le meilleur point
    // mesuré a pu être recalé au chargement du deck A)
    const a = this.analyses.get(this.idx);
    if (a?.structure.bestOut != null) {
      const measured = outSeg.playFrom + a.structure.bestOut;
      if (Math.abs(measured - this.cutTime) < 3) this.cutTime = measured;
    }

    // beats restants avant la coupe, mesurés sur la position RÉELLE du deck
    const nowTrack = out.position;
    const beatsAtStart = Math.max(1, (this.cutTime - nowTrack) / this.beatLenOut);
    const startWall = performance.now();

    // ---- programmation des gestes ----
    this.pending = move.steps
      .map(st => ({
        atBeats: st.atBeats,
        action: st.action,
        target: st.target,
        params: st.params,
        label: st.label,
        atWall: startWall + Math.max(0, beatsAtStart + st.atBeats) * this.beatLenOut * 1000,
        timer: null as any,
        executed: false
      }))
      .sort((x, y) => x.atWall - y.atWall);

    this.schedulePending();

    // garde-fou anti-collision de basses (QC) : si un blend long n'a pas de
    // kill programmé, on en pose un 2 temps avant la coupe
    if (move.bars >= 16 && !move.steps.some(s => s.action === 'eqLow' && s.target === 'out' && (s.params?.['db'] ?? 0) <= -14)) {
      this.pending.push({
        atBeats: -2, action: 'eqLow', target: 'out', params: { db: -22 },
        label: 'Kill basses du sortant (garde-fou)',
        atWall: startWall + Math.max(0, beatsAtStart - 2) * this.beatLenOut * 1000,
        timer: null, executed: false
      });
      this.pending.sort((x, y) => x.atWall - y.atWall);
      this.schedulePending();
    }

    this.emit();
  }

  /** Sans move (fallback), l'automatisation classique du parent s'applique ;
   *  avec un move, tous les gestes sont pilotés par le scheduler. */
  protected override applyTransition(p: number, out: DjDeck, inn: DjDeck): void {
    if (!this.currentMove) {
      super.applyTransition(p, out, inn);
      return;
    }
  }

  protected override completeTransition(out: DjDeck, inn: DjDeck): void {
    this.clearPerformance();
    super.completeTransition(out, inn);
  }

  // ============================ SCHEDULER ============================

  private schedulePending(): void {
    const now = performance.now();
    for (const p of this.pending) {
      if (p.executed || p.timer != null) continue;
      const delay = p.atWall - now;
      if (delay <= 8) {
        this.fireStep(p);
      } else {
        p.timer = setTimeout(() => {
          p.timer = null;
          this.fireStep(p);
        }, delay);
      }
    }
  }

  private pauseScheduler(): void {
    for (const p of this.pending) {
      if (p.timer != null) { clearTimeout(p.timer); p.timer = null; }
    }
    for (const iv of this.rampIntervals) clearInterval(iv);
    this.rampIntervals = [];
  }

  private resumeScheduler(shiftMs: number): void {
    for (const p of this.pending) {
      if (!p.executed) p.atWall += shiftMs;
    }
    this.schedulePending();
  }

  private fireStep(p: PendingStep): void {
    if (p.executed || this.ended) return;
    p.executed = true;
    const out = this.deckOf(this.idx);
    const inn = this.otherDeck(out);
    const seg = this.plan.segments[this.idx];
    const nextSeg = this.plan.segments[this.idx + 1];

    try {
      this.executeStep(p, out, inn, seg, nextSeg);
    } catch { /* un geste ne doit jamais casser le mix */ }

    const g: PerformanceGesture = {
      t: this.mixPositionOf(),
      deck: p.target === 'master' ? 'master' : (p.target === 'out' ? out.id : inn.id),
      action: p.action,
      label: p.label,
      move: this.currentMove?.name || ''
    };
    this.lastGesture = g;
    try { this.deps.onAction?.(g); } catch { }
  }

  // ============================ EXÉCUTION DES GESTES ============================

  private executeStep(
    p: PendingStep, out: DjDeck, inn: DjDeck,
    seg: MixSegment, nextSeg: MixSegment | undefined
  ): void {
    const eng = this.engine;
    const beat = this.beatLenOut;
    const target = p.target === 'out' ? out : p.target === 'in' ? inn : null;

    switch (p.action) {

      // ---- EQ / MIX ----
      case 'eqLow': target?.setEq('low', p.params['db'] ?? 0); break;
      case 'eqMid': target?.setEq('mid', p.params['db'] ?? 0); break;
      case 'eqHigh': target?.setEq('high', p.params['db'] ?? 0); break;
      case 'eqNeutral':
        target?.setEq('low', 0); target?.setEq('mid', 0); target?.setEq('high', 0);
        break;

      case 'volume':
        target?.setVolumeRamp(p.params['to'] ?? 0.5, 0.35);
        break;

      case 'crossfade': {
        const to = Math.max(0, Math.min(1, p.params['to'] ?? 1));
        // to = part de l'ENTRANT (0 → sortant seul, 1 → entrant seul)
        const x = out === eng.deckA ? to : 1 - to;
        eng.setCrossfade(x);
        break;
      }

      case 'mute': {
        const beats = p.params['beats'] ?? 1;
        const deck = target;
        if (deck) {
          const prev = deck.volume > 0.05 ? deck.volume : 0.8;
          deck.setVolumeRamp(0, 0.02);
          const t = setTimeout(() => {
            if (!this.ended) deck.setVolumeRamp(prev, 0.05);
          }, Math.max(120, beats * beat * 1000));
          this.rampIntervals.push(t);
        }
        break;
      }
      case 'unmute': target?.setVolumeRamp(p.params['to'] ?? 0.8, 0.1); break;

      // ---- ECHO / REVERB / MODULATION ----
      case 'echoOn': {
        const div = Math.max(1, p.params['div'] ?? 2);
        const beatSync = beat / div;
        target?.setEchoFeedback(p.params['feedback'] ?? 0.6);
        target?.setEcho(true, p.params['wet'] ?? 0.5, beatSync);
        break;
      }
      case 'echoOff': target?.setEcho(false); break;
      case 'reverbOn': target?.setReverb(true, p.params['wet'] ?? 0.4); break;
      case 'reverbOff': target?.setReverb(false); break;
      case 'flangerOn': target?.setFlanger(true, p.params['wet'] ?? 0.4); break;

      // ---- FILTRES ----
      case 'filterHp': {
        const hz = p.params['to'] ?? p.params['from'] ?? 800;
        const dur = p.params['over'] ?? 0;
        const pos = hzToFilterPos(hz);
        if (dur > 0) target?.setFilterRamp(pos, dur);
        else target?.setFilter(pos);
        break;
      }
      case 'filterLp': {
        const hz = p.params['to'] ?? p.params['from'] ?? 300;
        // position LP : 0.5 → 0 quand la fréquence descend de 22050 à 200
        const pos = 0.5 * (1 - Math.log(Math.max(200, Math.min(22050, hz)) / 200) / Math.log(22050 / 200));
        if (p.params['over']) target?.setFilterRamp(pos, p.params['over']);
        else target?.setFilter(pos);
        break;
      }
      case 'filterNeutral': target?.setFilter(0.5); break;

      // ---- BOUCLES / ROLLS ----
      case 'loop': {
        if (target?.playing) {
          const beats = p.params['beats'] ?? 4;
          const q = this.quantizeToBeat(target.position);
          target.setLoopRegion(q, q + beats * beat, beats / 4);
        }
        break;
      }
      case 'loopClear': target?.clearLoop(); break;

      case 'loopRoll': {
        // roll sur le sortant : la FIN de la boucle reste fixée (l'ancre du
        // premier roll) et la longueur rétrécit → accélération du cycle.
        if (!out.playing || !out.buffer) break;
        const seqBeats = Math.max(0.25, p.params['seq'] ?? 1);
        if (this.rollEnd == null || !out.loop) {
          const q = this.quantizeToBeat(out.position);
          this.rollEnd = q + seqBeats * beat;
          out.setLoopRegion(q, this.rollEnd, seqBeats / 4);
        } else {
          const start = Math.max(0, this.rollEnd - seqBeats * beat);
          if (this.rollEnd - start >= 0.05) out.setLoopRegion(start, this.rollEnd, seqBeats / 4);
        }
        break;
      }

      case 'gate': target?.gateStutter(p.params['beats'] ?? 2, p.params['duty'] ?? 0.5); break;

      // ---- CUTS / SWITCH ----
      case 'cut': {
        // couper l'entrant (fin de tease) autorise un redémarrage propre au playIn
        if (p.target === 'in') this.inStarted = false;
        target?.clearLoop();
        target?.pause();
        break;
      }
      case 'hardCut': {
        if (p.target === 'in') this.inStarted = false;
        if (target) {
          target.clearLoop();
          target.pause();
          target.setVolumeRamp(0.85, 0.02);
        }
        break;
      }
      case 'dropSwitch': {
        // l'entrant prend TOUT : filtre ouvert, basses en place, crossfader
        inn.setFilter(0.5);
        inn.setEq('low', 0);
        out.setVolumeRamp(0, 0.03);
        const x = out === eng.deckA ? 1 : 0;
        eng.setCrossfade(x);
        eng.setMasterVolume(this.baseMaster);
        break;
      }
      case 'silence': {
        const beats = p.params['beats'] ?? 1;
        eng.setMasterVolume(this.baseMaster * 0.04);
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          this.silenceTimer = null;
          if (!this.ended) eng.setMasterVolume(this.baseMaster);
        }, Math.max(120, beats * beat * 1000));
        break;
      }

      // ---- GESTES PHYSIQUES ----
      case 'spinback': {
        const beats = p.params['beats'] ?? 1;
        out.spinback(Math.max(180, beats * beat * 1000 * 0.85));
        break;
      }
      case 'brake': out.brake(p.params['ms'] ?? 420); break;
      case 'tapeStop': out.brake(p.params['ms'] ?? 520); break;
      case 'pitchRamp': {
        const toPct = p.params['toPct'] ?? 5;
        const beats = p.params['beats'] ?? 6;
        const fromRate = out.rawRate;
        const toRate = 1 + toPct / 100;
        const durMs = beats * beat * 1000;
        const t0 = performance.now();
        const iv = setInterval(() => {
          const k = Math.min(1, (performance.now() - t0) / durMs);
          if (out.playing) out.applyRawRate(fromRate + (toRate - fromRate) * k);
          if (k >= 1) clearInterval(iv);
        }, 60);
        this.rampIntervals.push(iv);
        break;
      }
      case 'beatJump': {
        const beats = p.params['beats'] ?? 4;
        if (target?.playing) target.seek(target.position + beats * beat);
        break;
      }

      // ---- VOCAL ----
      case 'vocalTease':
      case 'vocalLoop': {
        if (!nextSeg || !inn.buffer) break;
        const beats = p.params['beats'] ?? 2;
        const beatIn = 60 / (nextSeg.effectiveBpm || 105);
        // zone la plus « vocale » au début de l'entrant
        const a = this.analyses.get(nextSeg.index);
        let from = nextSeg.playFrom;
        if (a?.vocalCurve?.length) {
          const dur = a.duration;
          const winBars = 4;
          let best = -1, bestT = from;
          for (let t = nextSeg.playFrom; t < Math.min(nextSeg.playFrom + 16 * a.barLen, dur - 1); t += a.barLen) {
            const i = Math.round((t / dur) * a.vocalCurve.length);
            let s = 0, c = 0;
            for (let k = i; k < Math.min(a.vocalCurve.length, i + Math.round(winBars * 4 * (a.barLen / dur) * a.vocalCurve.length)); k++) { s += a.vocalCurve[k]; c++; }
            const v = c ? s / c : 0;
            if (v > best) { best = v; bestT = t; }
          }
          if (best > 0.35) from = bestT;
        }
        inn.setVolumeRamp(0.4, 0.05);
        inn.setReverb(true, 0.4);
        inn.play(Math.max(0, from));
        this.inStarted = true;
        const q = from;
        inn.setLoopRegion(q, q + beats * beatIn, beats / 4);
        // volume master inchangé : le tease passe par le crossfader
        const x0 = out === eng.deckA ? 0.42 : 0.58;
        eng.setCrossfade(x0);
        break;
      }

      // ---- ONE-SHOTS SYNTHÉTISÉS (bus FX) ----
      case 'riser': {
        const beats = p.params['beats'] ?? 8;
        this.oneShots.push(this.synthRiser(beats * beat));
        break;
      }
      case 'noiseSweep': this.oneShots.push(this.synthRiser((p.params['beats'] ?? 2) * beat, true)); break;
      case 'impact': this.oneShots.push(this.synthImpact()); break;
      case 'siren': this.oneShots.push(this.synthSiren()); break;
      case 'reverseHit': this.oneShots.push(this.synthReverseImpact()); break;

      // ---- TRANSPORT ----
      case 'playIn': {
        if (!nextSeg || !inn.buffer || this.inStarted) break;
        this.inStarted = true;
        const a = this.analyses.get(nextSeg.index);
        const onDownbeat = !!p.params['onDownbeat'];
        let from = nextSeg.playFrom;
        if (!onDownbeat && a?.structure.bestIn != null && a.structure.bestIn > 4 && a.structure.bestIn < 20) {
          from = nextSeg.playFrom + a.structure.bestIn;
        }
        if (onDownbeat) {
          // B démarre exactement maintenant (le geste est calé sur le 1)
          inn.play(Math.max(0, Math.min(from, inn.duration - 1)));
          const x = out === eng.deckA ? 1 : 0;
          eng.setCrossfade(x);
        } else {
          inn.play(Math.max(0, Math.min(from, inn.duration - 1)));
          if (p.params['filtered']) {
            inn.setFilter(hzToFilterPos(p.params['hzFrom'] ?? 600));
            inn.setEq('low', p.params['filteredLow'] ?? -12);
          }
        }
        this.startDeckVolume(inn, this.idx + 1);
        break;
      }
      case 'playOut': target?.pause(); break;
    }
  }

  /** Quantifie une position piste au temps le plus proche de la grille. */
  private quantizeToBeat(pos: number): number {
    if (!this.beatLenOut) return pos;
    const k = Math.round((pos - this.cutTime) / this.beatLenOut);
    return Math.max(0, this.cutTime + k * this.beatLenOut);
  }

  // ============================ NETTOYAGE ============================

  private clearPerformance(): void {
    for (const p of this.pending) {
      if (p.timer != null) { clearTimeout(p.timer); p.timer = null; }
    }
    this.pending = [];
    for (const iv of this.rampIntervals) clearInterval(iv);
    this.rampIntervals = [];
    for (const os of this.oneShots) { try { os.stop(); } catch { } }
    this.oneShots = [];
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    this.rollEnd = null;
    const eng = this.engine;
    try {
      eng.deckA.clearLoop();
      eng.deckB.clearLoop();
      eng.deckA.setEcho(false);
      eng.deckB.setEcho(false);
      eng.deckA.setReverb(false);
      eng.deckB.setReverb(false);
      eng.deckA.setFilter(0.5);
      eng.deckB.setFilter(0.5);
      eng.setMasterVolume(this.baseMaster);
    } catch { /* decks déjà libérés */ }
    this.currentMove = null;
    this.lastGesture = null;
  }

  // ============================ ONE-SHOTS (synthèse procédurale) ============================

  /** Riser : bruit filtré dont la bande et le volume montent (tension). */
  private synthRiser(durSec: number, short = false): { stop: () => void } {
    const ctx = this.engine.ctx;
    const dur = Math.max(0.6, Math.min(6, durSec));
    const noise = ctx.createBufferSource();
    const len = Math.ceil(dur * ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    const t0 = ctx.currentTime;
    bp.frequency.setValueAtTime(short ? 500 : 260, t0);
    bp.frequency.exponentialRampToValueAtTime(short ? 3000 : 5200, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
    noise.connect(bp); bp.connect(g); g.connect(this.engine.fxBus);
    noise.start(t0);
    noise.stop(t0 + dur + 0.15);
    return {
      stop: () => {
        try { g.gain.cancelScheduledValues(0); g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); noise.stop(ctx.currentTime + 0.1); } catch { }
      }
    };
  }

  /** Impact : coup de bruit bref + thump grave. */
  private synthImpact(): { stop: () => void } {
    const ctx = this.engine.ctx;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(this.engine.fxBus);
    // bruit bref
    const n = ctx.createBufferSource();
    const nb = ctx.createBuffer(1, Math.ceil(0.22 * ctx.sampleRate), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 2);
    n.buffer = nb;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    n.connect(ng); ng.connect(out);
    n.start(t0);
    // thump grave
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(38, t0 + 0.28);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.55, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
    o.connect(og); og.connect(out);
    o.start(t0); o.stop(t0 + 0.35);
    return { stop: () => { try { out.gain.setTargetAtTime(0, ctx.currentTime, 0.02); } catch { } } };
  }

  /** Sirene : deux oscillateurs désaccordés qui balayent. */
  private synthSiren(): { stop: () => void } {
    const ctx = this.engine.ctx;
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.15);
    g.connect(this.engine.fxBus);
    const oscs: OscillatorNode[] = [];
    for (const det of [0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(620 + det, t0);
      o.frequency.linearRampToValueAtTime(980 + det, t0 + 0.8);
      o.frequency.linearRampToValueAtTime(640 + det, t0 + 1.6);
      o.connect(g);
      o.start(t0); o.stop(t0 + 1.8);
      oscs.push(o);
    }
    const stopAt = t0 + 1.8;
    return {
      stop: () => {
        const now = ctx.currentTime;
        if (now < stopAt) {
          try { g.gain.setTargetAtTime(0, now, 0.05); for (const o of oscs) o.stop(now + 0.2); } catch { }
        }
      }
    };
  }

  /** Impact inversé : le bruit GONFLÉ puis coupé net (le « reverse hit »). */
  private synthReverseImpact(): { stop: () => void } {
    const ctx = this.engine.ctx;
    const t0 = ctx.currentTime;
    const n = ctx.createBufferSource();
    const nb = ctx.createBuffer(1, Math.ceil(0.9 * ctx.sampleRate), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(i / nd.length, 2.2);
    n.buffer = nb;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    n.connect(bp); bp.connect(g); g.connect(this.engine.fxBus);
    n.start(t0);
    n.stop(t0 + 0.95);
    return { stop: () => { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.02); } catch { } } };
  }
}
