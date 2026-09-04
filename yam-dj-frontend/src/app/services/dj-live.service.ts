import { Injectable, NgZone, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TrackService } from './track.service';
import { PlayerService } from './player.service';
import { DjService } from './dj.service';
import { Mixtape, Track } from '../models/models';
import { DjDeck, DjEngine } from '../pages/dj-studio/dj-engine';
import { AutoMixPlayer, AutoMixSnapshot } from '../pages/dj-studio/auto-mix-player';
import { MixPlan } from '../pages/dj-studio/auto-mix-planner';

/**
 * ============================================================================
 *  DJ LIVE — le studio qui joue EN ARRIÈRE-PLAN
 * ============================================================================
 *  Problème V2 : le moteur Web Audio du Studio DJ vivait dans le composant
 *  de la page /dj-studio → quitter la page détruisait la musique. Ce service
 *  racine devient le propriétaire du moteur :
 *
 *  - le mix auto (comme les decks en manuel) CONTINUE pendant qu'on
 *    explore le reste de la plateforme (navbar, charts, radio...) ;
 *  - indicateur "STUDIO · LIVE" dans la navbar pour y revenir d'un clic ;
 *  - MediaSession : contrôle depuis l'écran verrouillé / les notifications ;
 *  - coordination avec le player principal : quand le mix auto démarre,
 *    la piste en cours est mise en pause ; quand une lecture normale
 *    démarre, le mix auto s'arrête proprement (jamais deux musiques) ;
 *  - mixtapes : leur lecture passe aussi par ce service (arrière-plan) ;
 *  - quand tout est inactif, les buffers sont libérés (RAM) sans casser
 *    l'identité du moteur (les decks restent valides pour l'UI).
 */
@Injectable({ providedIn: 'root' })
export class DjLiveService {

  private trackService = inject(TrackService);
  private playerService = inject(PlayerService);
  private djService = inject(DjService);
  private zone = inject(NgZone);

  private engineRef: DjEngine | null = null;
  private autoPlayer: AutoMixPlayer | null = null;
  private watcher: any = null;
  private localFiles = new Map<string, File>();

  // ================== SIGNAUX (UI navbar + studio) ==================

  /** Mix auto en cours (préparation, lecture ou transition). */
  autoActive = signal(false);
  autoPhase = signal<string>('idle');
  autoPlan = signal<MixPlan | null>(null);
  autoIndex = signal(0);
  autoMixPosition = signal(0);
  autoMixDuration = signal(0);
  autoCountdown = signal<number | null>(null);
  autoTransitionLabel = signal<string | null>(null);
  autoLoading = signal<string | null>(null);
  autoError = signal<string | null>(null);
  /** Enregistrement du mix auto en cours. */
  autoRecording = signal(false);
  /** Résultat du dernier mix auto terminé (blob prêt à publier). */
  autoResult = signal<{ blob: Blob | null; completed: boolean; reason: string; at: number } | null>(null);

  /** Decks en lecture manuelle (indicateur navbar). */
  decksLive = signal(false);

  /** Mixtape en lecture (arrière-plan). */
  mixPlayingId = signal<string | null>(null);
  private mixAudio: HTMLAudioElement | null = null;

  private lastEmit = 0;

  constructor() {
    // Coordination inverse : une lecture normale coupe le mix auto.
    this.playerService.onBeforePlay = () => {
      if (this.autoActive()) this.stopAutoMix(1.2);
    };
  }

  // ================== MOTEUR ==================

  get engine(): DjEngine | null { return this.engineRef; }

  /** Crée (une seule fois) le moteur DJ et le garde vivant. */
  ensureEngine(): DjEngine {
    if (!this.engineRef) {
      this.engineRef = new DjEngine();
    }
    this.engineRef.ctx.resume().catch(() => { });
    return this.engineRef;
  }

  /** Libère la RAM (buffers) quand plus rien ne joue — le moteur reste valide. */
  releaseEngineIfIdle(): void {
    const eng = this.engineRef;
    if (!eng) return;
    const busy = this.autoActive() || eng.recording || eng.deckA.playing || eng.deckB.playing
      || !!this.mixAudio;
    if (busy) {
      // quelqu'un joue : on surveille pour libérer plus tard
      this.startWatcher();
      return;
    }
    this.stopWatcher();
    this.clearDeckMemory(eng.deckA);
    this.clearDeckMemory(eng.deckB);
    eng.setCrossfade(0.5);
    eng.setMasterVolume(0.9);
  }

  private clearDeckMemory(deck: DjDeck): void {
    try {
      deck.pause();
      deck.track = null;
      deck.buffer = null;
      deck.peaks = new Float32Array(0);
      deck.loop = null;
      deck.cues = [null, null, null, null];
      deck.mainCue = null;
      deck.setPitch(0);
    } catch { /* deck déjà propre */ }
  }

  /** Surveille les decks manuels pour maintenir l'indicateur navbar + libérer la RAM. */
  private startWatcher(): void {
    if (this.watcher) return;
    this.watcher = setInterval(() => {
      const eng = this.engineRef;
      if (!eng) { this.stopWatcher(); this.decksLive.set(false); return; }
      const playing = eng.deckA.playing || eng.deckB.playing;
      if (playing !== this.decksLive()) {
        this.zone.run(() => this.decksLive.set(playing));
      }
      if (!playing && !this.autoActive() && !eng.recording && !this.mixAudio) {
        this.stopWatcher();
        this.clearDeckMemory(eng.deckA);
        this.clearDeckMemory(eng.deckB);
        this.zone.run(() => this.decksLive.set(false));
      }
    }, 1000);
  }

  private stopWatcher(): void {
    if (this.watcher) { clearInterval(this.watcher); this.watcher = null; }
  }

  // ================== CHARGEMENT D'UNE PISTE DANS UN DECK ==================

  /** Enregistre un fichier local (id 'local-N') pour le mix auto. */
  registerLocalFile(id: string, file: File): void {
    this.localFiles.set(id, file);
  }

  /**
   * Charge une piste (catalogue ou fichier local) dans un deck :
   * URL signée via l'API (fallback URL directe) puis décodage complet.
   */
  async loadTrackIntoDeck(
    track: Track, deck: DjDeck, quality: 'lite' | 'hq',
    onProgress: (pct: number, detail: string) => void
  ): Promise<void> {
    if (track.id.startsWith('local-')) {
      const file = this.localFiles.get(track.id);
      if (!file) throw new Error('Fichier local introuvable (rajoute-le dans « Ma musique locale »).');
      const bpm = await deck.loadLocalFile(file, track, (p, phase, detail) => onProgress(p, detail));
      void bpm;
      return;
    }
    const fallbackUrl = quality === 'hq'
      ? (track.audioUrlHq || track.audioUrlLq)
      : (track.audioUrlLq || track.audioUrlHq);
    let url: string | null = null;
    try {
      const res = await firstValueFrom(this.trackService.streamUrl(track.id, quality));
      url = res?.url || null;
    } catch { /* fallback direct */ }
    const chosen = url || fallbackUrl;
    if (!chosen) throw new Error('Flux audio indisponible pour cette piste.');
    await deck.load(chosen, track, (p, phase, detail) => onProgress(p, detail));
  }

  // ================== MIX AUTO ==================

  get activeAutoPlayer(): AutoMixPlayer | null { return this.autoPlayer; }

  /** Indicateur navbar : le studio joue en arrière-plan. */
  backgroundActive(): boolean {
    return this.autoActive() || this.decksLive() || this.engineRef?.recording === true;
  }

  startAutoMix(
    plan: MixPlan,
    opts: { record: boolean; djVoice: boolean }
  ): void {
    if (!plan.segments.length) return;
    this.stopAutoMixNow(0);
    const engine = this.ensureEngine();

    // une seule musique à la fois : pause du player principal
    this.playerService.pausePlayback();

    this.autoPlayer = new AutoMixPlayer(engine, plan, {
      loadTrack: (track, deck, onProgress) =>
        this.loadTrackIntoDeck(track, deck, 'lite', onProgress),
      onSnapshot: s => this.consumeSnapshot(s),
      onFinish: (blob, completed, reason) => {
        this.zone.run(() => {
          this.autoActive.set(false);
          this.autoRecording.set(false);
          this.autoResult.set({ blob, completed, reason, at: Date.now() });
          this.releaseEngineIfIdle();
        });
      }
    }, { record: opts.record, djVoice: opts.djVoice });

    this.autoPlan.set(plan);
    this.autoActive.set(true);
    this.autoRecording.set(!!opts.record && engine.canRecord);
    this.autoResult.set(null);
    this.autoError.set(null);
    this.autoPlayer.start();
  }

  pauseAutoMix(): void { this.autoPlayer?.pause(); }
  resumeAutoMix(): void { this.autoPlayer?.resume(); }
  togglePauseAutoMix(): void { this.autoPlayer?.togglePause(); }

  stopAutoMix(fadeSec = 1.5): void {
    this.stopAutoMixNow(fadeSec);
  }

  private stopAutoMixNow(fadeSec: number): void {
    const p = this.autoPlayer;
    if (!p) return;
    this.autoPlayer = null;
    p.stop(fadeSec).then(() => {
      this.zone.run(() => {
        this.autoActive.set(false);
        this.autoRecording.set(false);
        this.releaseEngineIfIdle();
      });
    });
  }

  /** Snapshot → signaux (throttle 250 ms hors changements de phase). */
  private consumeSnapshot(s: AutoMixSnapshot): void {
    const now = performance.now();
    const phaseChanged = s.phase !== this.autoPhase();
    if (!phaseChanged && now - this.lastEmit < 250) return;
    this.lastEmit = now;
    this.zone.run(() => {
      this.autoPhase.set(s.phase);
      this.autoIndex.set(s.currentIndex);
      this.autoMixPosition.set(s.mixPosition);
      this.autoMixDuration.set(s.mixDuration);
      this.autoCountdown.set(s.countdown);
      this.autoTransitionLabel.set(s.transitionLabel);
      this.autoLoading.set(s.loadingText);
      this.autoError.set(s.error);
    });
  }

  // ================== MIXTAPES (arrière-plan) ==================

  playMixtape(mix: Mixtape, onMessage: (ok: boolean, msg: string) => void): void {
    if (this.mixPlayingId() === mix.id) {
      this.stopMixtape();
      return;
    }
    this.stopMixtape();
    this.djService.mixtapeStreamUrl(mix.id).subscribe({
      next: res => {
        if (!res?.url) return;
        this.mixAudio = new Audio();
        this.mixAudio.src = res.url;
        this.mixAudio.play().catch(() => { });
        this.mixAudio.onended = () => this.mixPlayingId.set(null);
        this.mixPlayingId.set(mix.id);
        try {
          const ms = (navigator as any).mediaSession;
          if (ms) {
            ms.metadata = new (window as any).MediaMetadata({
              title: mix.title, artist: mix.djName || 'YAM DJ', album: 'Mixtape'
            });
            ms.setActionHandler('pause', () => this.stopMixtape());
            ms.setActionHandler('stop', () => this.stopMixtape());
            ms.playbackState = 'playing';
          }
        } catch { /* non supporté */ }
        this.djService.registerMixtapePlay(mix.id).subscribe({ error: () => { } });
      },
      error: () => onMessage(false, 'Lecture du mix impossible.')
    });
  }

  stopMixtape(): void {
    if (this.mixAudio) {
      this.mixAudio.pause();
      this.mixAudio = null;
    }
    this.mixPlayingId.set(null);
    try {
      const ms = (navigator as any).mediaSession;
      if (ms) ms.playbackState = 'none';
    } catch { /* non supporté */ }
  }
}
