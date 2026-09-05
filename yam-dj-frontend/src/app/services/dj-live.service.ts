import { Injectable, NgZone, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TrackService } from './track.service';
import { PlayerService } from './player.service';
import { DjService } from './dj.service';
import { Mixtape, Track } from '../models/models';
import { DjDeck, DjEngine, loadTrackAudio } from '../pages/dj-studio/dj-engine';
import { AutoMixPlayer, AutoMixSnapshot, PerformanceGesture } from '../pages/dj-studio/auto-mix-player';
import { MixPlan } from '../pages/dj-studio/auto-mix-planner';
import { PerformancePlayer } from '../pages/dj-studio/performance-player';
import { TrackAnalysis, analyzeTrack } from '../pages/dj-studio/mix-analyzer';

/** Fichier audio local ajouté par le DJ (vit dans le service → survit à la navigation). */
export interface LocalFileEntry {
  id: string;
  file: File;
  loading: boolean;
  track: Track;
}

/** Mix enregistré sauvegardé pour l'écoute HORS LIGNE (IndexedDB). */
export interface OfflineMix {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number;
  sizeBytes: number;
  signature: string;
}

/** Session DJ sauvegardée (le plan + les fichiers locaux : tout revient). */
export interface DjSessionMeta {
  id: string;
  name: string;
  createdAt: string;
  trackCount: number;
  durationSec: number;
  signature: string;
  summary: string;
}

/** Session complète telle que stockée en IndexedDB (auto-suffisante). */
export interface DjSessionRecord {
  meta: DjSessionMeta;
  plan: MixPlan;
  /** Fichiers locaux embarqués (auto-suffisance de la session). */
  files: { id: string; name: string; blob: Blob }[];
}

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
  private localFileMap = new Map<string, File>();
  private localSeq = 0;

  // ================== FICHIERS LOCAUX DU DJ ==================

  /** Fichiers locaux du DJ — vit dans le service : la liste survit à la
   *  navigation (le DJ revient au studio, ses morceaux sont toujours là). */
  readonly localFiles = signal<LocalFileEntry[]>([]);

  /** Ajoute des fichiers (sélection multiple) — retourne les entrées créées. */
  addLocalFiles(files: File[] | FileList): LocalFileEntry[] {
    const created: LocalFileEntry[] = [];
    for (const file of Array.from(files)) {
      const seq = ++this.localSeq;
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[ _-]+/g, ' ').trim() || file.name;
      const entry: LocalFileEntry = {
        id: 'local-' + seq,
        file,
        loading: false,
        track: {
          id: 'local-' + seq,
          title,
          artistId: '',
          artistName: 'Fichier local',
          artistPseudo: '',
          durationSec: 0,
          playCount: 0,
          likeCount: 0,
          status: 'APPROVED' as const,
          dataLiteReady: false,
          createdAt: new Date().toISOString()
        }
      };
      this.localFileMap.set(entry.id, file);
      created.push(entry);
    }
    this.localFiles.set([...this.localFiles(), ...created]);
    return created;
  }

  /** Retire un fichier local. */
  removeLocalFile(id: string): void {
    this.localFileMap.delete(id);
    this.localFiles.set(this.localFiles().filter(f => f.id !== id));
  }

  /** Remplace/rafraîchit une entrée (après analyse : BPM, tonalité, durée). */
  updateLocalEntry(entry: LocalFileEntry): void {
    this.localFileMap.set(entry.id, entry.file);
    this.localFiles.set([...this.localFiles()]);
  }

  /** Diffuse la liste (rafraîchissement d'affichage après mutation). */
  touchLocalFiles(): void {
    this.localFiles.set([...this.localFiles()]);
  }

  /** Map interne id → File (utilisée par loadTrackIntoDeck). */
  getLocalFile(id: string): File | undefined {
    return this.localFileMap.get(id);
  }

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
  /** Performance V2 : move courant + geste courant + journal des gestes. */
  autoMoveName = signal<string | null>(null);
  autoCurrentAction = signal<string | null>(null);
  autoGestures = signal<PerformanceGesture[]>([]);

  /** Mixes enregistrés sauvegardés hors ligne (IndexedDB). */
  readonly offlineMixes = signal<OfflineMix[]>([]);
  private mixDb: IDBDatabase | null = null;
  private offlineAudio: HTMLAudioElement | null = null;
  offlinePlayingId = signal<string | null>(null);

  // ================== SESSIONS DJ (sauvegarde du plan) ==================

  /** Sessions sauvegardées (plan + fichiers locaux embarqués). */
  readonly sessions = signal<DjSessionMeta[]>([]);

  // ================== TAMpons POUR LE RENDU (cache) ==================

  /** Cache id piste → AudioBuffer (rendu déterministe + re-rendu rapide). */
  private bufferCache = new Map<string, AudioBuffer>();

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
    this.openMixDb().then(() => this.loadOfflineMixes());
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
    this.bufferCache.clear();
    eng.setCrossfade(0.5);
    eng.setMasterVolume(0.9);
    this.zone.run(() => this.decksLive.set(false));
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
    this.localFileMap.set(id, file);
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
      const file = this.localFileMap.get(track.id);
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

  // ================== TAMpons & ANALYSES (rendu déterministe) ==================

  /** Charge le tampon audio d'une piste (local ou catalogue), avec cache. */
  async loadTrackBuffer(
    track: Track,
    onProgress?: (pct: number, detail: string) => void
  ): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(track.id);
    if (cached) return cached;
    const engine = this.ensureEngine();
    let buffer: AudioBuffer;
    if (track.id.startsWith('local-')) {
      const file = this.localFileMap.get(track.id);
      if (!file) throw new Error('Fichier local introuvable : « ' + track.title + ' » (re-ajoute-le).');
      onProgress?.(0.3, 'Lecture du fichier…');
      const data = await file.arrayBuffer();
      onProgress?.(0.6, 'Décodage…');
      buffer = await engine.ctx.decodeAudioData(data);
    } else {
      const fallbackUrl = track.audioUrlLq || track.audioUrlHq;
      let url: string | null = null;
      try {
        const res = await firstValueFrom(this.trackService.streamUrl(track.id, 'lite'));
        url = res?.url || null;
      } catch { /* fallback direct */ }
      const chosen = url || fallbackUrl;
      if (!chosen) throw new Error('Flux audio indisponible pour « ' + track.title + ' ».');
      buffer = await loadTrackAudio(engine.ctx, chosen, (p, _ph, d) => onProgress?.(p, d));
    }
    if (this.bufferCache.size > 10) this.bufferCache.clear(); // garde-fou RAM
    this.bufferCache.set(track.id, buffer);
    return buffer;
  }

  /** Collecte les tampons + analyses réelles de TOUTES les pistes du plan
   *  (le rendu déterministe planifie sur les vrais points d'entrée/sortie,
   *  la vraie courbe vocale, le vrai trim loudness). */
  async collectPlanBuffers(
    plan: MixPlan,
    onProgress?: (done: number, total: number, title: string) => void
  ): Promise<{ buffers: Map<string, AudioBuffer>; analyses: Map<number, TrackAnalysis> }> {
    const buffers = new Map<string, AudioBuffer>();
    const analyses = new Map<number, TrackAnalysis>();
    const unique: Track[] = [];
    for (const seg of plan.segments) {
      if (!unique.some(t => t.id === seg.track.id)) unique.push(seg.track);
    }
    let done = 0;
    for (const track of unique) {
      done++;
      onProgress?.(done, unique.length, track.title);
      const buffer = await this.loadTrackBuffer(track, (pct, d) =>
        onProgress?.(done - 1 + Math.max(0.05, pct * 0.7), unique.length, d ? d + ' — ' + track.title : track.title));
      buffers.set(track.id, buffer);
    }
    // analyses par index de segment (miroir du player live)
    for (let i = 0; i < plan.segments.length; i++) {
      const seg = plan.segments[i];
      const buffer = buffers.get(seg.track.id);
      if (!buffer) continue;
      try {
        const track = { ...seg.track };
        if (!track.bpm || Math.abs((track.durationSec || 0) - buffer.duration) > 2) {
          track.durationSec = Math.round(buffer.duration);
        }
        const a = analyzeTrack(track, buffer);
        analyses.set(i, a);
        if (!seg.track.bpm && a.bpm) {
          seg.track = { ...seg.track, bpm: a.bpm, camelot: a.camelot || seg.track.camelot };
        }
        seg.measuredEnergy = a.energy;
      } catch { /* analyse non bloquante */ }
    }
    return { buffers, analyses };
  }

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

    const deps = {
      loadTrack: (track: Track, deck: DjDeck, onProgress: (pct: number, d: string) => void) =>
        this.loadTrackIntoDeck(track, deck, 'lite', onProgress),
      onSnapshot: (s: AutoMixSnapshot) => this.consumeSnapshot(s),
      onFinish: (blob: Blob | null, completed: boolean, reason: string) => {
        this.zone.run(() => {
          this.autoActive.set(false);
          this.autoRecording.set(false);
          this.decksLive.set(false);
          this.autoResult.set({ blob, completed, reason, at: Date.now() });
          // ENREGISTREMENT AUTOMATIQUE pour l'écoute hors ligne (IndexedDB)
          if (blob && blob.size > 4096) {
            const plan2 = this.autoPlan();
            this.saveOfflineMix(blob, plan2).catch(() => { });
          }
          this.releaseEngineIfIdle();
        });
      },
      onAction: (g: PerformanceGesture) => {
        this.zone.run(() => {
          const list = this.autoGestures();
          this.autoGestures.set([...list.slice(-40), g]);
        });
      }
    };

    // PERFORMANCE DJ V2 : si le plan porte une performance, on joue les gestes ;
    // sinon, séquenceur classique (rétro-compatible).
    this.autoPlayer = plan.performance
      ? new PerformancePlayer(engine, plan, deps, { record: opts.record, djVoice: opts.djVoice }, plan.performance)
      : new AutoMixPlayer(engine, plan, deps, { record: opts.record, djVoice: opts.djVoice });

    this.autoPlan.set(plan);
    this.autoActive.set(true);
    this.autoRecording.set(!!opts.record && engine.canRecord);
    this.autoResult.set(null);
    this.autoGestures.set([]);
    this.autoMoveName.set(null);
    this.autoCurrentAction.set(null);
    this.autoError.set(null);
    this.autoPlayer.start();
  }

  pauseAutoMix(): void { this.autoPlayer?.pause(); }
  resumeAutoMix(): void { this.autoPlayer?.resume(); }
  togglePauseAutoMix(): void { this.autoPlayer?.togglePause(); }

  stopAutoMix(fadeSec = 1.5): void {
    this.stopAutoMixNow(fadeSec);
    this.autoMoveName.set(null);
    this.autoCurrentAction.set(null);
  }

  private stopAutoMixNow(fadeSec: number): void {
    const p = this.autoPlayer;
    if (!p) return;
    this.autoPlayer = null;
    p.stop(fadeSec).then(() => {
      this.zone.run(() => {
        this.autoActive.set(false);
        this.autoRecording.set(false);
        this.decksLive.set(false);
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
      this.autoMoveName.set(s.moveName ?? null);
      this.autoCurrentAction.set(s.currentAction ?? null);
      this.autoLoading.set(s.loadingText);
      this.autoError.set(s.error);
    });
  }

  // ================== MIXES HORS LIGNE (IndexedDB) ==================

  private openMixDb(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open('yam-mixes', 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('mixes')) {
            db.createObjectStore('mixes', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'meta.id' });
          }
        };
        req.onsuccess = () => {
          this.mixDb = req.result;
          resolve(req.result);
          this.loadSessions();
        };
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  /** Sauvegarde automatique du mix enregistré → écoute hors ligne. */
  async saveOfflineMix(blob: Blob, plan: MixPlan | null): Promise<OfflineMix | null> {
    const db = this.mixDb || await this.openMixDb();
    if (!db) return null;
    const mix: OfflineMix & { blob: Blob } = {
      id: 'mix-' + Date.now() + '-' + Math.floor(Math.random() * 999),
      title: 'Mix YAM ' + new Date().toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString(),
      durationSec: Math.round(plan?.totalDurationSec || 0),
      sizeBytes: blob.size,
      signature: plan?.performance?.signature || '',
      blob
    };
    return new Promise(resolve => {
      try {
        const tx = db.transaction('mixes', 'readwrite');
        tx.objectStore('mixes').put(mix);
        tx.oncomplete = () => { this.loadOfflineMixes().then(() => resolve(mix)); };
        tx.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  private async loadOfflineMixes(): Promise<void> {
    const db = this.mixDb || await this.openMixDb();
    if (!db) return;
    new Promise<void>(resolve => {
      try {
        const req = db.transaction('mixes', 'readonly').objectStore('mixes').getAll();
        req.onsuccess = () => {
          const list = (req.result || []).map((m: any) => ({
            id: m.id, title: m.title, createdAt: m.createdAt,
            durationSec: m.durationSec, sizeBytes: m.sizeBytes, signature: m.signature || ''
          }));
          list.sort((a: OfflineMix, b: OfflineMix) => b.createdAt.localeCompare(a.createdAt));
          this.zone.run(() => this.offlineMixes.set(list));
          resolve();
        };
        req.onerror = () => resolve();
      } catch { resolve(); }
    });
  }

  private getMixBlob(id: string): Promise<Blob | null> {
    const db = this.mixDb;
    if (!db) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const req = db.transaction('mixes', 'readonly').objectStore('mixes').get(id);
        req.onsuccess = () => resolve(req.result?.blob || null);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  /** Télécharge un mix hors ligne (fichier audio). */
  async downloadOfflineMix(id: string): Promise<void> {
    const blob = await this.getMixBlob(id);
    if (!blob) return;
    const mix = this.offlineMixes().find(m => m.id === id);
    const ext = (blob.type || '').includes('wav') ? 'wav' : (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (mix?.title || 'mix-yam').replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').trim() + '.' + ext;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  /** Lecture d'un mix hors ligne (arrière-plan, simple). */
  async playOfflineMix(id: string): Promise<void> {
    if (this.offlinePlayingId() === id) { this.stopOfflineMix(); return; }
    this.stopOfflineMix();
    const blob = await this.getMixBlob(id);
    if (!blob) return;
    const mix = this.offlineMixes().find(m => m.id === id);
    this.playerService.pausePlayback();
    this.offlineAudio = new Audio();
    this.offlineAudio.src = URL.createObjectURL(blob);
    this.offlineAudio.play().catch(() => { });
    this.offlineAudio.onended = () => this.offlinePlayingId.set(null);
    this.offlinePlayingId.set(id);
    try {
      const ms = (navigator as any).mediaSession;
      if (ms) {
        ms.metadata = new (window as any).MediaMetadata({
          title: mix?.title || 'Mon mix', artist: 'Moi', album: 'YAM DJ · hors ligne'
        });
        ms.setActionHandler('pause', () => this.stopOfflineMix());
        ms.setActionHandler('stop', () => this.stopOfflineMix());
        ms.playbackState = 'playing';
      }
    } catch { }
  }

  stopOfflineMix(): void {
    if (this.offlineAudio) {
      this.offlineAudio.pause();
      this.offlineAudio = null;
    }
    this.offlinePlayingId.set(null);
  }

  async deleteOfflineMix(id: string): Promise<void> {
    const db = this.mixDb;
    if (!db) return;
    if (this.offlinePlayingId() === id) this.stopOfflineMix();
    new Promise<void>(resolve => {
      try {
        const tx = db.transaction('mixes', 'readwrite');
        tx.objectStore('mixes').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch { resolve(); }
    });
    await this.loadOfflineMixes();
  }

  // ================== SESSIONS DJ (sauvegarde du plan + fichiers) ==================

  /** Sauvegarde la session courante (plan + performance + fichiers locaux
   *  embarqués en Blob) : la session est AUTO-SUFFISANTE, elle se recharge
   *  même après un rechargement complet de l'application. */
  async saveSession(name: string): Promise<DjSessionMeta | null> {
    const plan = this.autoPlan();
    if (!plan || !plan.segments.length) return null;
    const db = this.mixDb || await this.openMixDb();
    if (!db) return null;
    const files: { id: string; name: string; blob: Blob }[] = [];
    for (const seg of plan.segments) {
      if (!seg.track.id.startsWith('local-')) continue;
      const file = this.localFileMap.get(seg.track.id);
      if (file && !files.some(f => f.id === seg.track.id)) {
        files.push({ id: seg.track.id, name: file.name, blob: file });
      }
    }
    const meta: DjSessionMeta = {
      id: 'session-' + Date.now() + '-' + Math.floor(Math.random() * 999),
      name: name.trim() || ('Session du ' + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })),
      createdAt: new Date().toISOString(),
      trackCount: plan.segments.length,
      durationSec: Math.round(plan.totalDurationSec || 0),
      signature: plan.performance?.signature || '',
      summary: plan.summary || ''
    };
    const record: DjSessionRecord = { meta, plan, files };
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch { resolve(); }
    });
    await this.loadSessions();
    return meta;
  }

  /** Charge la session : restaure les fichiers locaux (mêmes ids) puis le plan. */
  async loadSession(id: string): Promise<{ plan: MixPlan | null; missingFiles: string[] }> {
    const db = this.mixDb || await this.openMixDb();
    if (!db) return { plan: null, missingFiles: [] };
    const record = await new Promise<DjSessionRecord | null>(resolve => {
      try {
        const req = db.transaction('sessions', 'readonly').objectStore('sessions').get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
    if (!record) return { plan: null, missingFiles: [] };
    // restaure les fichiers locaux avec leurs ids d'origine
    for (const f of record.files) {
      if (!this.localFileMap.has(f.id)) {
        const file = new File([f.blob], f.name, { type: f.blob.type || 'audio/mpeg' });
        this.localFileMap.set(f.id, file);
        const entry: LocalFileEntry = {
          id: f.id,
          file,
          loading: false,
          track: { ... (record.plan.segments.find(s => s.track.id === f.id)?.track || {
            id: f.id, title: f.name.replace(/\.[^.]+$/, ''), artistId: '', artistName: 'Fichier local',
            artistPseudo: '', durationSec: 0, playCount: 0, likeCount: 0, status: 'APPROVED' as const,
            dataLiteReady: false, createdAt: new Date().toISOString()
          }) }
        };
        this.localFiles.set([...this.localFiles(), entry]);
      }
    }
    this.autoPlan.set(record.plan);
    return { plan: record.plan, missingFiles: [] };
  }

  async deleteSession(id: string): Promise<void> {
    const db = this.mixDb;
    if (!db) return;
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch { resolve(); }
    });
    await this.loadSessions();
  }

  private loadSessions(): Promise<void> {
    const db = this.mixDb;
    if (!db) return Promise.resolve();
    return new Promise<void>(resolve => {
      try {
        const req = db.transaction('sessions', 'readonly').objectStore('sessions').getAll();
        req.onsuccess = () => {
          const metas = (req.result || [])
            .map((r: DjSessionRecord) => r.meta)
            .sort((a: DjSessionMeta, b: DjSessionMeta) => b.createdAt.localeCompare(a.createdAt));
          this.zone.run(() => this.sessions.set(metas));
          resolve();
        };
        req.onerror = () => resolve();
      } catch { resolve(); }
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
