import { Injectable, signal, computed, inject } from '@angular/core';
import { TrackService } from './track.service';
import { AuthService } from './auth.service';
import { OfflineService } from './offline.service';
import { Track, AdConfig, LocalFileTrack, OfflinePlay } from '../models/models';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import Hls from 'hls.js';

/**
 * PLAYER GLOBAL — Streaming HLS + YouTube (API officielle) + fichiers locaux.
 *
 * CORRECTIFS MAJEURS (V2) :
 *  - YouTube : plus AUCUNE iframe [src] Angular (elle se rechargeait a chaque
 *    cycle de detection = la musique redemarrait en boucle). On utilise
 *    l'API IFrame JavaScript officielle dans un div hote persistant :
 *    duree, position, ended, volume et seek reels.
 *  - comptabiliserPlay ne remplace PLUS l'objet currentTrack (2e cause de
 *    rechargement). Comptage au VRAI demarrage de lecture, idempotent
 *    (clientEventId), file d'attente hors ligne synchronisee au retour reseau.
 *  - MediaSession : lecture en arriere-plan + commandes ecran verrouille
 *    pour le streaming, YouTube ET les fichiers locaux.
 *
 * NOUVEAUTES (V2) :
 *  1. File d'attente + shuffle + repetition (off / one / all)
 *  2. YAM Radio : suite infinie auto-remplie par genre / pays
 *  3. Equalisateur 5 bandes + presets (Voiture, Casque, Basses, Voix, Nuit)
 *  4. Vitesse de lecture 0.5x - 2x (style VLC)
 *  5. Minuterie sommeil « Dodo musique » avec fondu
 *  6. Compteur data (« Ta data, ta maniere »)
 *  7. Reprise de lecture (reprends ou tu t'etais arrete, sync backend)
 *  8. Mode audio YouTube (video repliee = economie batterie/data)
 *  9. Lecture des fichiers locaux via le player global (arriere-plan)
 * 10. Bouton fermer le player (arrete tout proprement)
 */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private trackService = inject(TrackService);
  private auth = inject(AuthService);
  private offline = inject(OfflineService);
  private http = inject(HttpClient);

  private audio: HTMLAudioElement;
  private hls: Hls | null = null;

  // Jingle sponsorise : element audio dedie
  private adAudio: HTMLAudioElement | null = null;

  // Contexte Web Audio (EQ + effets nightclub)
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private eqBands: BiquadFilterNode[] = [];        // 5 bandes peaking
  private bassFilter: BiquadFilterNode | null = null; // lowshelf nightclub
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  // Etat reactif
  currentTrack = signal<Track | null>(null);
  isPlaying = signal<boolean>(false);

  /** V2 : player plein ecran ouvert (partage home "A l'ecoute" <-> player). */
  fullOpen = signal<boolean>(false);
  position = signal<number>(0);
  duration = signal<number>(0);
  volume = signal<number>(0.9);
  queue = signal<Track[]>([]);
  dataLite = signal<boolean>(this.detectSlowConnection());
  nightMode = signal<boolean>(false);
  loading = signal<boolean>(false);

  /** Vitesse de lecture (0.5 - 2). */
  speed = signal<number>(1);

  /** Repetition : off | one | all. */
  repeat = signal<'off' | 'one' | 'all'>('off');
  shuffle = signal<boolean>(false);

  /** File d'attente visible (panneau). */
  queueOpen = signal<boolean>(false);

  /** Mode radio : suite infinie par genre/pays. */
  radioMode = signal<{ genre?: string; country?: string } | null>(null);

  /** Mode audio YouTube : la video reste masquee (son uniquement). */
  youtubeAudioOnly = signal<boolean>(true);

  /** Minuterie sommeil : minutes restantes (null = desactivee). */
  sleepRemaining = signal<number | null>(null);
  sleepTotalMin = 0;

  /** Compteur data du jour (Mo, estimation). */
  dataUsedMo = signal<number>(0);

  /** Fichiers locaux en cours (Ma Musique) : id -> objectUrl. */
  private localUrls = new Map<string, string>();

  /** YouTube : player API officiel + div hote persistant. */
  isYouTube = computed<boolean>(() => !!this.currentTrack()?.youtubeId);
  isLocal = computed<boolean>(() => !!this.currentTrack() && this.currentTrack()!.id.startsWith('local:'));
  private ytPlayer: any = null;
  private ytHost: HTMLElement | null = null;
  private ytCurrentVideoId: string | null = null;
  private ytReady = false;
  private ytPositionTimer: any = null;

  // Publicite non intrusive (Phase 3.5)
  adPlaying = signal<boolean>(false);
  adText = signal<string>('');

  quality = computed<'hq' | 'lite'>(() => (this.dataLite() ? 'lite' : 'hq'));

  private playCounted = false;
  private currentPlayEventId: string | null = null;
  private playStartedAt = 0;

  /**
   * Hook « une autre source va prendre la main » — le Studio DJ s'y branche
   * pour arrêter son mix auto avant qu'une lecture normale ne démarre
   * (jamais deux musiques en même temps).
   */
  onBeforePlay: (() => void) | null = null;

  private adConfig: AdConfig | null = null;
  private adChecked = false;
  private adStateLoaded = false;
  private isPremiumUser = false;
  private tracksSinceAd = 0;
  private pendingTrackAfterAd: Track | null = null;
  private adHardStop: any = null;

  // Progression (reprise de lecture)
  private progressMap = new Map<string, { pos: number; dur: number }>();
  private lastProgressSave = 0;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = 0.9;
    // CORS : necessaire pour le graphe Web Audio (EQ/Nightclub) sur les
    // medias distants. Supabase Storage et l'API envoient ACAO. Les blob:
    // locaux et les flux MSE de hls.js ne sont pas concernes.
    this.audio.crossOrigin = 'anonymous';

    this.audio.addEventListener('timeupdate', () => {
      this.position.set(this.audio.currentTime);
      this.maybeSaveProgress();
      this.estimateData();
    });
    this.audio.addEventListener('durationchange', () => {
      if (isFinite(this.audio.duration)) this.duration.set(this.audio.duration);
    });
    this.audio.addEventListener('playing', () => {
      this.isPlaying.set(true);
      this.loading.set(false);
      this.comptabiliserPlay();
    });
    this.audio.addEventListener('pause', () => this.isPlaying.set(false));
    this.audio.addEventListener('ended', () => this.handleEnded());
    this.audio.addEventListener('waiting', () => this.loading.set(true));
    this.audio.addEventListener('error', () => {
      // Fallback : si le stream echoue en lite, retenter en hq
      if (this.dataLite()) {
        this.dataLite.set(false);
        if (this.currentTrack()) this.load(this.currentTrack()!);
      }
    });

    // Compteur data du jour + reprise de lecture locales
    this.loadDataCounter();
    this.loadLocalProgress();

    // Sync des ecoutes hors ligne des la reconnexion
    window.addEventListener('online', () => this.flushOfflinePlays());
    this.flushOfflinePlays();
    this.loadProgressFromBackend();
  }

  // =====================================================================
  // LECTURE D'UNE PISTE (streaming, YouTube ou locale)
  // =====================================================================

  /** Lecture d'une piste. newQueue remplace la file (ex : playlist, radio). */
  play(track: Track, newQueue: Track[] = []): void {
    this.onBeforePlay?.();
    if (newQueue.length) {
      const rest = newQueue.filter(t => t.id !== track.id);
      this.queue.set([track, ...rest]);
    } else if (!this.queue().find(t => t.id === track.id)) {
      this.queue.set([track, ...this.queue()]);
    }
    this.playCounted = false;

    if (this.shouldPlayAd()) {
      this.playAdJingle(track);
      return;
    }
    this.load(track);
  }

  /** Lecture d'un fichier local (Ma Musique) — passe par le player global. */
  playLocal(local: LocalFileTrack, playlist: LocalFileTrack[] = []): void {
    this.onBeforePlay?.();
    const url = local.objectUrl
      || (local.file ? URL.createObjectURL(local.file) : (local.handle ? null : null));
    if (!url && local.handle) {
      // Handle persistant : re-resolution du fichier puis creation d'URL
      local.handle.getFile().then((f: File) => {
        const u = URL.createObjectURL(f);
        this.localUrls.set(local.id, u);
        this.launchLocal(local, u, playlist);
      }).catch(() => {});
      return;
    }
    if (!url) return;
    this.localUrls.set(local.id, url);
    this.launchLocal(local, url, playlist);
  }

  private launchLocal(local: LocalFileTrack, url: string, playlist: LocalFileTrack[]): void {
    const pseudo: Track = {
      id: 'local:' + local.id,
      title: local.title,
      artistId: '',
      artistName: local.artist || 'Fichier local',
      artistPseudo: local.artist || '',
      coverUrl: local.coverUrl,
      durationSec: local.duration || 0,
      playCount: 0,
      likeCount: 0,
      status: 'APPROVED',
      dataLiteReady: true,
      createdAt: new Date().toISOString(),
      // marquage : la factory construit le reste
    } as Track;
    (pseudo as any).__local = local;

    if (playlist.length) {
      const tracks = playlist.map(l => {
        const t: any = { ...pseudo, id: 'local:' + l.id, title: l.title, artistName: l.artist || 'Fichier local', coverUrl: l.coverUrl, durationSec: l.duration || 0 };
        t.__local = l;
        return t as Track;
      });
      const first = tracks.find(t => t.id === pseudo.id) || tracks[0];
      this.queue.set(tracks);
      this.load(first);
    } else {
      if (!this.queue().find(t => t.id === pseudo.id)) {
        this.queue.set([pseudo, ...this.queue()]);
      }
      this.load(pseudo);
    }
  }

  private load(track: Track): void {
    this.currentTrack.set(track);
    this.loading.set(true);
    this.playStartedAt = 0;
    this.duration.set(track.durationSec || 0);
    this.position.set(0);

    // ---------- FICHIER LOCAL ----------
    if (track.id.startsWith('local:')) {
      this.destroyHls();
      this.stopYoutubePlayback();
      const url = this.localUrls.get(track.id.slice(6));
      if (url) {
        this.audio.src = url;
        this.tryResume(track);
        this.audio.play().then(() => this.updateMediaSession(track))
          .catch(() => { this.isPlaying.set(false); this.loading.set(false); });
      } else {
        const local = (track as any).__local as LocalFileTrack | undefined;
        if (local) {
          this.playLocal(local, []);
        } else {
          this.loading.set(false);
        }
      }
      this.updateMediaSession(track);
      return;
    }

    // ---------- PISTE YOUTUBE (API IFrame officielle) ----------
    if (track.youtubeId) {
      this.destroyHls();
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.position.set(0);
      this.isPlaying.set(true);
      this.loading.set(false);
      this.startYoutubeTrack(track);
      this.updateMediaSession(track);
      return;
    }

    // ---------- MODE HORS LIGNE (cache Service Worker) ----------
    if (!this.offline.online() && this.offline.isDownloaded(track.id) && track.audioUrlLq) {
      this.attachSource(track.audioUrlLq);
      this.updateMediaSession(track);
      return;
    }

    this.trackService.streamUrl(track.id, this.quality()).subscribe({
      next: (res: { url: string }) => {
        this.attachSource(res.url);
        this.updateMediaSession(track);
      },
      error: () => {
        const fallback = this.quality() === 'lite' || !this.offline.online()
          ? (track.audioUrlLq || track.audioUrlHq)
          : (track.audioUrlHq || track.audioUrlLq);
        if (fallback) this.attachSource(fallback);
      }
    });
  }

  private attachSource(url: string): void {
    this.destroyHls();
    this.setupAudioGraph(); // au premier appel (contexte cree pendant le geste)

    if (url.endsWith('.m3u8') && Hls.isSupported()) {
      this.hls = new Hls({
        maxBufferLength: this.dataLite() ? 10 : 30,
        maxMaxBufferLength: this.dataLite() ? 20 : 60,
        abrEwmaDefaultEstimate: this.dataLite() ? 48000 : 128000
      });
      this.hls.loadSource(url);
      this.hls.attachMedia(this.audio);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.tryResume(this.currentTrack()!);
        this.audio.play().catch(() => { this.isPlaying.set(false); this.loading.set(false); });
      });
      this.hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
        if (data?.fatal) {
          // Erreur fatale : fallback URL directe si disponible
          const t = this.currentTrack();
          const direct = this.quality() === 'lite'
            ? (t?.audioUrlLq || t?.audioUrlHq)
            : (t?.audioUrlHq || t?.audioUrlLq);
          if (direct && !direct.endsWith('.m3u8')) {
            this.attachSource(direct);
          } else {
            this.loading.set(false);
            this.isPlaying.set(false);
          }
        }
      });
    } else {
      this.audio.src = url;
      this.tryResume(this.currentTrack()!);
      this.audio.play().catch(() => { this.isPlaying.set(false); this.loading.set(false); });
    }
  }

  /** Reprise : saute a la derniere position enregistree si pertinente. */
  private tryResume(track: Track): void {
    if (!track || track.id.startsWith('local:')) return;
    const p = this.progressMap.get(track.id);
    if (!p || !p.dur) return;
    if (p.pos > 20 && p.pos < p.dur - 30) {
      this.audio.currentTime = p.pos;
    }
  }

  // =====================================================================
  // YOUTUBE — API IFRAME OFFICIELLE (fix boucle de rechargement)
  // =====================================================================

  /** Charge dynamiquement l'API IFrame YouTube (une seule fois). */
  private loadYoutubeApi(): Promise<any> {
    if ((window as any).YT?.Player) return Promise.resolve((window as any).YT);
    return new Promise(resolve => {
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve((window as any).YT);
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
      // Securite : si l'API met trop longtemps (reseau 2G), on rend la main.
      setTimeout(() => {
        if ((window as any).YT?.Player) resolve((window as any).YT);
      }, 15000);
    });
  }

  /** Le composant player enregistre son div hote (persistant dans le DOM). */
  attachYoutubeHost(el: HTMLElement | null): void {
    this.ytHost = el;
    if (el && this.isYouTube() && this.currentTrack()?.youtubeId && !this.ytPlayer) {
      this.startYoutubeTrack(this.currentTrack()!);
    }
  }

  private async startYoutubeTrack(track: Track): Promise<void> {
    const videoId = track.youtubeId!;
    await this.loadYoutubeApi();
    const YT = (window as any).YT;
    if (!YT?.Player) return;

    // Player existant : simple changement de video (PAS de rechargement d'iframe)
    if (this.ytPlayer && this.ytReady) {
      if (this.ytCurrentVideoId !== videoId) {
        this.ytCurrentVideoId = videoId;
        this.ytPlayer.loadVideoById(videoId);
        this.ytPlayer.setVolume(Math.round(this.volume() * 100));
        if (this.speed() !== 1) this.ytPlayer.setPlaybackRate(this.speed());
      }
      this.comptabiliserPlay();
      return;
    }

    if (!this.ytHost) return; // le composant n'a pas encore rendu le hote

    this.ytCurrentVideoId = videoId;
    this.ytPlayer = new YT.Player(this.ytHost, {
      videoId,
      playerVars: {
        autoplay: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (e: any) => {
          this.ytReady = true;
          e.target.setVolume(Math.round(this.volume() * 100));
          // Reprise de position YouTube
          const p = this.progressMap.get(this.currentTrack()?.id || '');
          if (p && p.pos > 20 && p.dur && p.pos < p.dur - 30) {
            e.target.seekTo(Math.floor(p.pos), true);
          }
        },
        onStateChange: (e: any) => {
          const S = (window as any).YT.PlayerState;
          if (e.data === S.PLAYING) {
            this.isPlaying.set(true);
            this.loading.set(false);
            this.comptabiliserPlay();
            this.estimateData();
          } else if (e.data === S.PAUSED) {
            this.isPlaying.set(false);
            this.maybeSaveProgress();
          } else if (e.data === S.ENDED) {
            this.maybeSaveProgress(true);
            this.handleEnded();
          }
        }
      }
    });

    // Position + duree YouTube (polling 500 ms)
    if (this.ytPositionTimer) clearInterval(this.ytPositionTimer);
    this.ytPositionTimer = setInterval(() => {
      if (!this.ytPlayer?.getCurrentTime) return;
      try {
        const t = this.ytPlayer.getCurrentTime() || 0;
        const d = this.ytPlayer.getDuration() || 0;
        this.position.set(t);
        if (d && Math.abs(d - this.duration()) > 0.5) this.duration.set(d);
        this.estimateData();
      } catch { /* player detruit */ }
    }, 500);
  }

  /** Detruit le player YouTube proprement (retour a une piste audio). */
  private stopYoutubePlayback(): void {
    if (this.ytPositionTimer) {
      clearInterval(this.ytPositionTimer);
      this.ytPositionTimer = null;
    }
    if (this.ytPlayer) {
      try { this.ytPlayer.destroy(); } catch { /* ignore */ }
      this.ytPlayer = null;
    }
    this.ytReady = false;
    this.ytCurrentVideoId = null;
    // Le hote est reutilisable : le composant le garde dans le DOM.
  }

  // =====================================================================
  // CONTROLES
  // =====================================================================

  /** Pause simple sans rien vider — utilisée quand le Studio DJ prend la main. */
  pausePlayback(): void {
    if (this.isYouTube()) {
      if (this.isPlaying()) this.ytCommand('pauseVideo');
      return;
    }
    if (this.isPlaying()) this.audio.pause();
  }

  toggle(): void {
    this.audioCtx?.resume().catch(() => {});
    if (this.isYouTube()) {
      if (this.isPlaying()) this.ytCommand('pauseVideo');
      else this.ytCommand('playVideo');
      return;
    }
    if (this.isPlaying()) {
      this.audio.pause();
    } else {
      this.audio.play().catch(() => {});
    }
  }

  seek(seconds: number): void {
    if (this.isYouTube()) {
      this.ytCommand('seekTo', [Math.max(0, Math.floor(seconds)), true]);
      this.position.set(seconds);
      return;
    }
    if (isFinite(seconds)) this.audio.currentTime = seconds;
  }

  seekForward(delta = 10): void { this.seek(this.position() + delta); }
  seekBackward(delta = 10): void { this.seek(Math.max(0, this.position() - delta)); }

  setVolume(vol: number): void {
    this.volume.set(vol);
    if (this.isYouTube()) {
      this.ytCommand('setVolume', [Math.round(vol * 100)]);
      return;
    }
    this.audio.volume = vol;
  }

  /** Vitesse de lecture (0.5 - 2). */
  setSpeed(v: number): void {
    const speed = Math.max(0.5, Math.min(2, v));
    this.speed.set(speed);
    if (this.isYouTube()) {
      this.ytCommand('setPlaybackRate', [speed]);
      return;
    }
    this.audio.playbackRate = speed;
    this.audio.preservesPitch = true;
  }

  /** ARRET TOTAL + fermeture de la barre de lecture (bouton fermer). */
  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.destroyHls();
    this.stopYoutubePlayback();
    this.currentTrack.set(null);
    this.isPlaying.set(false);
    this.position.set(0);
    this.duration.set(0);
    this.queue.set([]);
    this.radioMode.set(null);
    this.queueOpen.set(false);
    this.clearSleepTimer();
    this.updateMediaSession(null);
  }

  next(): void {
    const q = this.queue();
    if (this.repeat() === 'one') {
      this.replayCurrent();
      return;
    }
    let idx = q.findIndex(t => t.id === this.currentTrack()?.id);

    // Shuffle : piste aleatoire differente de la courante
    if (this.shuffle() && q.length > 1) {
      let r = idx;
      while (r === idx) r = Math.floor(Math.random() * q.length);
      this.playCounted = false;
      this.load(q[r]);
      return;
    }

    if (idx >= 0 && idx < q.length - 1) {
      this.playCounted = false;
      this.load(q[idx + 1]);
    } else if (this.repeat() === 'all' && q.length) {
      this.playCounted = false;
      this.load(q[0]);
    } else if (this.radioMode()) {
      // Radio : la suite continue, on recharge un lot frais
      this.refillRadio(true);
    } else {
      this.isPlaying.set(false);
    }
  }

  previous(): void {
    // Dans les 3 premieres secondes -> piste precedente, sinon debut
    if (this.position() > 3) {
      this.seek(0);
      return;
    }
    const q = this.queue();
    const idx = q.findIndex(t => t.id === this.currentTrack()?.id);
    if (idx > 0) {
      this.playCounted = false;
      this.load(q[idx - 1]);
    } else {
      this.seek(0);
    }
  }

  private replayCurrent(): void {
    const t = this.currentTrack();
    if (!t) return;
    this.playCounted = false;
    if (t.youtubeId) {
      this.ytCommand('seekTo', [0, true]);
      this.ytCommand('playVideo');
    } else {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
    }
  }

  private handleEnded(): void {
    if (this.repeat() === 'one') {
      this.replayCurrent();
      return;
    }
    this.next();
  }

  // =====================================================================
  // FILE D'ATTENTE + RADIO INFINIE
  // =====================================================================

  addToQueue(track: Track): void {
    if (!this.queue().find(t => t.id === track.id)) {
      this.queue.set([...this.queue(), track]);
    }
  }

  playNext(track: Track): void {
    const q = this.queue();
    const cur = this.currentTrack();
    const idx = cur ? q.findIndex(t => t.id === cur.id) : -1;
    const rest = q.filter(t => t.id !== track.id);
    rest.splice(idx + 1, 0, track);
    this.queue.set(rest);
  }

  removeFromQueue(trackId: string): void {
    this.queue.set(this.queue().filter(t => t.id !== trackId));
  }

  /** Joue la piste a l'index donne de la file (clic dans le panneau). */
  playQueueIndex(index: number): void {
    const q = this.queue();
    if (q[index]) {
      this.playCounted = false;
      this.load(q[index]);
    }
  }

  /** Bascule lecture aleatoire. */
  toggleShuffle(): void {
    this.shuffle.set(!this.shuffle());
  }

  /** Repetition : off -> all -> one -> off. */
  cycleRepeat(): void {
    const order: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
    const cur = order.indexOf(this.repeat());
    this.repeat.set(order[(cur + 1) % 3]);
  }

  moveInQueue(from: number, to: number): void {
    const q = [...this.queue()];
    if (from < 0 || from >= q.length || to < 0 || to >= q.length) return;
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    this.queue.set(q);
  }

  /** YAM RADIO : lance une suite infinie par genre et/ou pays. */
  startRadio(genre?: string, country?: string): void {
    this.radioMode.set({ genre, country });
    this.trackService.radio(genre, country, 15).subscribe({
      next: (tracks: Track[]) => {
        if (!tracks?.length) {
          this.radioMode.set(null);
          return;
        }
        this.shuffle.set(false);
        this.play(tracks[0], tracks);
      },
      error: () => this.radioMode.set(null)
    });
  }

  stopRadio(): void {
    this.radioMode.set(null);
  }

  /** Complete la file quand la radio s'epuise. */
  private refillRadio(playFirst: boolean): void {
    const cfg = this.radioMode();
    if (!cfg) return;
    this.trackService.radio(cfg.genre, cfg.country, 15).subscribe({
      next: (tracks: Track[]) => {
        const fresh = (tracks || []).filter(t => !this.queue().find(q => q.id === t.id));
        if (!fresh.length) return;
        this.queue.set([...this.queue(), ...fresh]);
        if (playFirst) {
          this.playCounted = false;
          this.load(fresh[0]);
        } else {
          // Pre-chargement discret : complete la file a l'avance
        }
      },
      error: () => {}
    });
  }

  // =====================================================================
  // MEDIASESSION — arriere-plan + ecran verrouille (streaming/YT/local)
  // =====================================================================

  private updateMediaSession(track: Track | null): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!track) {
      ms.metadata = null;
      return;
    }
    const art = track.coverUrl ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : undefined;
    ms.metadata = new (window as any).MediaMetadata({
      title: track.title,
      artist: track.artistName || track.sourceArtist || 'YAM DJ',
      album: 'YAM DJ',
      artwork: art
    });
    try {
      ms.setActionHandler('play', () => this.toggle());
      ms.setActionHandler('pause', () => this.toggle());
      ms.setActionHandler('previoustrack', () => this.previous());
      ms.setActionHandler('nexttrack', () => this.next());
      ms.setActionHandler('seekto', (d: any) => {
        if (d.seekTime != null) this.seek(d.seekTime);
      });
      ms.setActionHandler('seekbackward', () => this.seekBackward(10));
      ms.setActionHandler('seekforward', () => this.seekForward(10));
    } catch { /* handlers non supportes */ }
  }

  // =====================================================================
  // EQ 5 BANDES + NIGHTCLUB + VITESSE
  // =====================================================================

  /** Construit le graphe Web Audio une seule fois (EQ -> bass -> dry/wet). */
  private setupAudioGraph(): void {
    if (this.audioCtx) {
      this.audioCtx.resume().catch(() => {});
      return;
    }
    try {
      this.audioCtx = new AudioContext();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      // Chaine : source -> [eq x5] -> bass -> destination
      //                                   -> reverb -> reverbGain -> destination
      const freqs = [60, 250, 1000, 4000, 12000];
      let node: AudioNode = this.sourceNode;
      this.eqBands = freqs.map(f => {
        const bq = this.audioCtx!.createBiquadFilter();
        bq.type = 'peaking';
        bq.frequency.value = f;
        bq.Q.value = 1.0;
        bq.gain.value = 0;
        node.connect(bq);
        node = bq;
        return bq;
      });

      this.bassFilter = this.audioCtx.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.value = 32000;
      this.bassFilter.gain.value = 0;

      this.reverbNode = this.audioCtx.createConvolver();
      this.reverbNode.buffer = this.createClubReverbIR();
      this.reverbGain = this.audioCtx.createGain();
      this.reverbGain.gain.value = 0;

      node.connect(this.bassFilter);
      this.bassFilter.connect(this.audioCtx.destination);
      this.bassFilter.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.audioCtx.destination);

      // Reapplique les etats actifs (EQ actif, nightclub)
      this.applyEqGains();
      if (this.nightMode()) {
        this.bassFilter.frequency.value = 180;
        this.bassFilter.gain.value = 7;
        this.reverbGain.gain.value = 0.25;
      }
      if (this.speed() !== 1) this.audio.playbackRate = this.speed();
    } catch {
      this.audioCtx = null;
    }
  }

  /** Presets d'egalisateur (dB par bande : 60/250/1k/4k/12k). */
  readonly EQ_PRESETS: Record<string, [number, number, number, number, number]> = {
    'Neutre': [0, 0, 0, 0, 0],
    'Voiture': [4, 2, -1, 1, 3],
    'Casque': [2, 0, 1, 2, 3],
    'Basses': [7, 5, 1, 0, 1],
    'Voix': [-2, 1, 4, 3, 0],
    'Nuit': [3, 1, 0, -1, -3]
  };
  eqPreset = signal<string>('Neutre');
  eqGains = signal<[number, number, number, number, number]>([0, 0, 0, 0, 0]);

  setEqPreset(name: string): void {
    const gains = this.EQ_PRESETS[name];
    if (!gains) return;
    this.eqPreset.set(name);
    this.eqGains.set([...gains] as [number, number, number, number, number]);
    this.applyEqGains();
  }

  setEqBand(i: number, db: number): void {
    const g = [...this.eqGains()] as [number, number, number, number, number];
    g[i] = db;
    this.eqGains.set(g);
    this.eqPreset.set('Perso');
    this.applyEqGains();
  }

  private applyEqGains(): void {
    const gains = this.eqGains();
    this.eqBands.forEach((bq, i) => {
      if (bq && gains[i] != null) bq.gain.value = gains[i];
    });
  }

  /** MODE NIGHTCLUB : bass boost + reverb club. */
  toggleNightMode(): void {
    const enabled = !this.nightMode();
    this.nightMode.set(enabled);
    if (!this.audioCtx) {
      if (enabled) this.setupAudioGraph();
    }
    if (this.bassFilter) {
      this.bassFilter.frequency.value = enabled ? 180 : 32000;
      this.bassFilter.gain.value = enabled ? 7 : 0;
    }
    if (this.reverbGain) {
      this.reverbGain.gain.value = enabled ? 0.25 : 0;
    }
  }

  /** Bascule Mode Data-Lite (48 kbps). */
  toggleDataLite(): void {
    this.dataLite.set(!this.dataLite());
    const current = this.currentTrack();
    if (current && !current.youtubeId && !current.id.startsWith('local:')) {
      this.playCounted = false;
      this.load(current);
    }
  }

  /** Mode audio YouTube : video repliee, son seul. */
  toggleYoutubeAudioOnly(): void {
    this.youtubeAudioOnly.set(!this.youtubeAudioOnly());
  }

  // =====================================================================
  // MINUTERIE SOMMEIL « Dodo musique »
  // =====================================================================

  private sleepTimer: any = null;

  /** Demarre la minuterie (minutes). Fondu puis pause. */
  startSleepTimer(minutes: number): void {
    this.clearSleepTimer();
    this.sleepTotalMin = minutes;
    this.sleepRemaining.set(minutes * 60);
    this.sleepTimer = setInterval(() => {
      const r = this.sleepRemaining();
      if (r == null) { this.clearSleepTimer(); return; }
      if (r <= 30) {
        // Fondu final sur 30 s
        const ratio = r / 30;
        this.setVolume(Math.max(0.05, this.volume() * ratio));
      }
      if (r <= 1) {
        this.finishSleep();
        return;
      }
      this.sleepRemaining.set(r - 1);
    }, 1000);
  }

  private finishSleep(): void {
    this.audio.pause();
    if (this.isYouTube()) this.ytCommand('pauseVideo');
    this.clearSleepTimer();
    window.dispatchEvent(new CustomEvent('yam-sleep-end'));
  }

  clearSleepTimer(): void {
    if (this.sleepTimer) {
      clearInterval(this.sleepTimer);
      this.sleepTimer = null;
    }
    this.sleepRemaining.set(null);
  }

  get sleepTotal(): number { return this.sleepTotalMin; }

  // =====================================================================
  // COMPTEUR DATA (« Ta data, ta maniere »)
  // =====================================================================

  private dataCounter = { day: '', mo: 0 };

  private loadDataCounter(): void {
    try {
      const raw = localStorage.getItem('yam_data_v2');
      if (raw) {
        const c = JSON.parse(raw);
        if (c.day === this.today()) this.dataCounter = c;
      }
    } catch { /* ignore */ }
    this.dataUsedMo.set(this.dataCounter.mo || 0);
  }

  private today(): string { return new Date().toISOString().slice(0, 10); }

  private estimateData(): void {
    const t = this.currentTrack();
    if (!t || !this.isPlaying()) return;
    // ~0.36 Mo/min en Data-Lite, ~0.96 Mo/min en HQ, YouTube estime 3 Mo/min
    const moPerSec = t.youtubeId ? 3 / 60
      : (this.quality() === 'lite' ? 0.36 / 60 : 0.96 / 60);
    this.dataCounter.mo += moPerSec;
    if (this.dataCounter.day !== this.today()) {
      this.dataCounter.day = this.today();
      this.dataCounter.mo = moPerSec;
    }
    this.dataUsedMo.set(this.dataCounter.mo);
    try { localStorage.setItem('yam_data_v2', JSON.stringify(this.dataCounter)); } catch { }
  }

  /** Economie estimee vs ecoute HQ 128 kbps (Mo). */
  get dataSavedMo(): number {
    const used = this.dataCounter.mo;
    if (!used) return 0;
    // Si on avait ecoute tout en Data-Lite, on aurait consomme 37.5 % de moins
    return this.dataLite() ? used * (1 - 0.36 / 0.96) : 0;
  }

  // =====================================================================
  // REPRISE DE LECTURE (progression)
  // =====================================================================

  private loadLocalProgress(): void {
    try {
      const raw = localStorage.getItem('yam_pos_map');
      if (raw) {
        const map = JSON.parse(raw);
        Object.keys(map).forEach(k => this.progressMap.set(k, map[k]));
      }
    } catch { /* ignore */ }
  }

  private loadProgressFromBackend(): void {
    if (!this.auth.isLoggedIn() || !navigator.onLine) return;
    this.http.get<any[]>(`${environment.apiUrl}/api/me/progress`).subscribe({
      next: list => {
        (list || []).forEach(p => {
          if (p?.trackId && !this.progressMap.has(p.trackId)) {
            this.progressMap.set(p.trackId, { pos: p.positionSec || 0, dur: p.durationSec || 0 });
          }
        });
      },
      error: () => {}
    });
  }

  private maybeSaveProgress(force = false): void {
    const t = this.currentTrack();
    if (!t || t.id.startsWith('local:')) return;
    const now = Date.now();
    if (!force && now - this.lastProgressSave < 5000) return;
    this.lastProgressSave = now;
    const pos = this.position();
    const dur = this.duration() || t.durationSec;
    if (!dur) return;
    // Position nulle ou fin de piste : on nettoie
    if (pos < 20 || pos > dur - 30) {
      if (this.progressMap.has(t.id)) this.progressMap.delete(t.id);
    } else {
      this.progressMap.set(t.id, { pos, dur });
    }
    try {
      const obj: any = {};
      this.progressMap.forEach((v, k) => obj[k] = v);
      localStorage.setItem('yam_pos_map', JSON.stringify(obj));
    } catch { /* quota */ }

    // Sync backend (fire & forget, utilisateur connecte en ligne)
    if (this.auth.isLoggedIn() && navigator.onLine) {
      this.http.post(`${environment.apiUrl}/api/me/progress`, {
        trackId: t.id, positionSec: Math.floor(pos), durationSec: Math.floor(dur)
      }).subscribe({ error: () => {} });
    }
  }

  /** Position enregistree pour une piste (UI « Reprendre »). */
  progressFor(trackId: string): { pos: number; dur: number } | undefined {
    return this.progressMap.get(trackId);
  }

  // =====================================================================
  // COMPTABILISATION DES ECOUTES (correcte + hors ligne idempotent)
  // =====================================================================

  /** Comptabilise l'ecoute au VRAI demarrage (playing), une seule fois. */
  private comptabiliserPlay(): void {
    const track = this.currentTrack();
    if (!track || this.playCounted) return;
    this.playCounted = true;
    this.playStartedAt = Date.now();

    // Fichier local : aucune donnee envoyee, aucun comptage
    if (track.id.startsWith('local:')) return;

    const quality = track.youtubeId ? 'youtube' : this.quality();
    const clientEventId = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    this.currentPlayEventId = clientEventId;

    const listenedSec = Math.min(track.durationSec || 0, 0); // complete au save

    if (!navigator.onLine) {
      // HORS LIGNE : file locale, synchronisee au retour du reseau
      this.queueOfflinePlay(track.id, clientEventId, quality, listenedSec);
      return;
    }

    if (this.auth.isLoggedIn()) {
      // Connecte : sync idempotent (meme canal que le hors ligne)
      this.queueOfflinePlay(track.id, clientEventId, quality, listenedSec);
      this.flushOfflinePlays();
    } else {
      // Anonyme en ligne : POST classique
      this.trackService.registerPlay(track.id, this.quality()).subscribe({
        next: () => { track.playCount += 1; },  // mutation SANS set() -> pas de re-render
        error: () => {}
      });
    }
  }

  private queueOfflinePlay(trackId: string, clientEventId: string, quality: string, listenedSec: number): void {
    try {
      const raw = localStorage.getItem('yam_offline_plays');
      const list: OfflinePlay[] = raw ? JSON.parse(raw) : [];
      list.push({
        trackId, clientEventId, quality,
        listenedSec: Math.max(0, Math.round(listenedSec)),
        playedAt: new Date().toISOString()
      });
      localStorage.setItem('yam_offline_plays', JSON.stringify(list.slice(-200)));
    } catch { /* quota */ }
  }

  /** Envoie les ecoutes en attente (hors ligne ou connecte). */
  flushOfflinePlays(): void {
    if (!this.auth.isLoggedIn() || !navigator.onLine) return;
    try {
      const raw = localStorage.getItem('yam_offline_plays');
      if (!raw) return;
      const list: OfflinePlay[] = JSON.parse(raw);
      if (!list?.length) return;
      localStorage.removeItem('yam_offline_plays');
      // Complete la duree ecoutee de l'evenement en cours si possible
      const items = list.map(p => ({
        trackId: p.trackId,
        clientEventId: p.clientEventId,
        quality: p.quality,
        listenedSec: p.listenedSec
      }));
      this.http.post(`${environment.apiUrl}/api/me/plays/sync`, { plays: items })
        .subscribe({ error: () => {
          // Echec : on remet la file (pas de perte)
          try {
            const prev = localStorage.getItem('yam_offline_plays');
            const merged = prev ? [...JSON.parse(prev), ...list] : list;
            localStorage.setItem('yam_offline_plays', JSON.stringify(merged.slice(-200)));
          } catch { }
        }});
    } catch { /* ignore */ }
  }

  // =====================================================================
  // PUB NON INTRUSIVE (Phase 3.5, races corrigees)
  // =====================================================================

  private async ensureAdState(): Promise<void> {
    if (this.adStateLoaded) return;
    try {
      const cfg = await firstValueFrom(
        this.http.get<AdConfig>(`${environment.apiUrl}/api/ads/config`));
      this.adConfig = cfg;
    } catch {
      this.adConfig = null;
    }
    if (this.auth.isLoggedIn()) {
      try {
        const me = await firstValueFrom(this.auth.me());
        this.isPremiumUser = !!me?.premium;
      } catch {
        this.isPremiumUser = false;
      }
    }
    this.adStateLoaded = true; // APRES les awaits (fix race condition)
  }

  private shouldPlayAd(): boolean {
    if (!this.offline.online()) return false;
    if (!this.adStateLoaded || !this.adConfig?.enabled) return false;
    if (this.isPremiumUser) return false;
    if (this.adPlaying()) return false;
    this.tracksSinceAd++;
    return this.tracksSinceAd >= Math.max(1, this.adConfig.intervalTracks);
  }

  private playAdJingle(nextTrack: Track): void {
    this.ensureAdState().then(() => {
      const cfg = this.adConfig;
      if (!cfg?.enabled || this.isPremiumUser || !this.offline.online()) {
        this.load(nextTrack);
        return;
      }
      this.pendingTrackAfterAd = nextTrack;
      this.adText.set(cfg.text || 'Publicite — passe Premium pour zero pub');
      this.adPlaying.set(true);
      this.tracksSinceAd = 0;

      this.audio.pause();
      if (this.isYouTube()) this.ytCommand('pauseVideo');

      this.adAudio = new Audio(cfg.audioUrl);
      this.adAudio.volume = this.volume();
      if (this.adHardStop) clearTimeout(this.adHardStop);
      this.adHardStop = setTimeout(() => this.finishAd(), (cfg.maxDurationSec || 15) * 1000);
      this.adAudio.onended = () => this.finishAd();
      this.adAudio.onerror = () => this.finishAd();
      this.adAudio.play().catch(() => this.finishAd());
    });
  }

  private finishAd(): void {
    if (this.adHardStop) { clearTimeout(this.adHardStop); this.adHardStop = null; }
    if (this.adAudio) {
      this.adAudio.onended = null;
      this.adAudio.onerror = null;
      this.adAudio.pause();
      this.adAudio.src = '';
      this.adAudio = null;
    }
    if (!this.adPlaying()) return; // deja termine (double appel protege)
    this.adPlaying.set(false);
    const next = this.pendingTrackAfterAd;
    this.pendingTrackAfterAd = null;
    if (next) this.load(next);
  }

  skipAd(): void {
    if (this.adPlaying()) this.finishAd();
  }

  // =====================================================================
  // OUTILS
  // =====================================================================

  private ytCommand(func: string, args: any[] = []): void {
    try {
      if (this.ytPlayer && this.ytPlayer[func]) {
        this.ytPlayer[func](...args);
      }
    } catch { /* player non pret */ }
  }

  private detectSlowConnection(): boolean {
    try {
      const conn = (navigator as any).connection
        || (navigator as any).mozConnection
        || (navigator as any).webkitConnection;
      if (!conn) return false;
      const type = (conn.effectiveType || conn.type || '').toLowerCase();
      return ['2g', '3g', 'slow-2g'].includes(type);
    } catch {
      return false;
    }
  }

  private destroyHls(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  /** Impulse response reverb "club" synthetique. */
  private createClubReverbIR(): AudioBuffer {
    const ctx = this.audioCtx!;
    const duration = 2.0;
    const rate = ctx.sampleRate;
    const length = Math.floor(duration * rate);
    const ir = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8);
      }
    }
    return ir;
  }

  formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
}
