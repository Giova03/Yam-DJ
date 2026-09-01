import { Injectable, signal, computed, inject } from '@angular/core';
import { TrackService } from './track.service';
import { Track } from '../models/models';
import Hls from 'hls.js';

/**
 * PLAYER GLOBAL — Streaming HLS + Web Audio API.
 *
 * 3 differenciateurs YAM DJ :
 *  1. MODE DATA-LITE : bascule auto 48 kbps si connexion lente
 *     (detectee via navigator.connection) — 3x moins de data.
 *  2. MODE NIGHTCLUB : effets Web Audio (reverb + bass boost) qui
 *     transforment l'ecoute en ambiance club.
 *  3. File d'attente (queue) avec lecture automatique enchainee.
 */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private trackService = inject(TrackService);

  private audio: HTMLAudioElement;
  private hls: Hls | null = null;

  // Contexte Web Audio (effets nightclub)
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  // Etat reactif
  currentTrack = signal<Track | null>(null);
  isPlaying = signal<boolean>(false);
  position = signal<number>(0);          // secondes
  duration = signal<number>(0);
  volume = signal<number>(0.9);
  queue = signal<Track[]>([]);
  dataLite = signal<boolean>(this.detectSlowConnection());
  nightMode = signal<boolean>(false);
  loading = signal<boolean>(false);

  quality = computed<'hq' | 'lite'>(() => (this.dataLite() ? 'lite' : 'hq'));

  private playCounted = false;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = 0.9;

    this.audio.addEventListener('timeupdate', () => {
      this.position.set(this.audio.currentTime);
    });
    this.audio.addEventListener('durationchange', () => {
      if (isFinite(this.audio.duration)) this.duration.set(this.audio.duration);
    });
    this.audio.addEventListener('playing', () => {
      this.isPlaying.set(true);
      this.loading.set(false);
    });
    this.audio.addEventListener('pause', () => this.isPlaying.set(false));
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('waiting', () => this.loading.set(true));
    this.audio.addEventListener('error', () => {
      // Fallback : si le stream echoue en lite, retenter en hq
      if (this.dataLite()) {
        this.dataLite.set(false);
        if (this.currentTrack()) this.load(this.currentTrack()!);
      }
    });
  }

  /** Lecture d'une piste (avec ajout auto dans la file). */
  play(track: Track, newQueue: Track[] = []): void {
    if (newQueue.length) {
      this.queue.set(newQueue);
    } else if (!this.queue().find(t => t.id === track.id)) {
      this.queue.set([track, ...this.queue()]);
    }
    this.playCounted = false;
    this.load(track);
  }

  private load(track: Track): void {
    this.currentTrack.set(track);
    this.loading.set(true);
    this.duration.set(track.durationSec || 0);

    this.trackService.streamUrl(track.id, this.quality()).subscribe({
      next: (res: { url: string }) => this.attachSource(res.url),
      error: () => {
        // Fallback direct R2 si l'API stream indisponible
        const fallback = this.quality() === 'lite' ? track.audioUrlLq : track.audioUrlHq;
        if (fallback) this.attachSource(fallback);
      }
    });
  }

  private attachSource(url: string): void {
    this.destroyHls();

    if (url.endsWith('.m3u8') && Hls.isSupported()) {
      // Streaming adaptatif HLS (R2)
      this.hls = new Hls({
        maxBufferLength: this.dataLite() ? 10 : 30,
        maxMaxBufferLength: this.dataLite() ? 20 : 60,
        abrEwmaDefaultEstimate: this.dataLite() ? 48000 : 128000
      });
      this.hls.loadSource(url);
      this.hls.attachMedia(this.audio);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.audio.play().catch(() => {
          // Autoplay bloque : le user cliquera play
          this.isPlaying.set(false);
        });
      });
    } else {
      this.audio.src = url;
      this.audio.play().catch(() => this.isPlaying.set(false));
    }
  }

  toggle(): void {
    if (this.isPlaying()) {
      this.audio.pause();
    } else {
      this.audio.play().then(() => {
        this.comptabiliserPlay();
      }).catch(() => {});
    }
  }

  seek(seconds: number): void {
    if (isFinite(seconds)) {
      this.audio.currentTime = seconds;
    }
  }

  setVolume(vol: number): void {
    this.volume.set(vol);
    this.audio.volume = vol;
  }

  next(): void {
    const q = this.queue();
    const idx = q.findIndex(t => t.id === this.currentTrack()?.id);
    if (idx >= 0 && idx < q.length - 1) {
      this.playCounted = false;
      this.load(q[idx + 1]);
    } else {
      this.isPlaying.set(false);
    }
  }

  previous(): void {
    const q = this.queue();
    const idx = q.findIndex(t => t.id === this.currentTrack()?.id);
    if (idx > 0) {
      this.playCounted = false;
      this.load(q[idx - 1]);
    }
  }

  addToQueue(track: Track): void {
    if (!this.queue().find(t => t.id === track.id)) {
      this.queue.set([...this.queue(), track]);
    }
  }

  removeFromQueue(trackId: string): void {
    this.queue.set(this.queue().filter(t => t.id !== trackId));
  }

  /** Bascule Mode Data-Lite (48 kbps) — sauvegarde du forfait data. */
  toggleDataLite(): void {
    this.dataLite.set(!this.dataLite());
    const current = this.currentTrack();
    if (current) {
      this.playCounted = false;
      this.load(current);
    }
  }

  /** MODE NIGHTCLUB : bass boost + reverb club via Web Audio API. */
  toggleNightMode(): void {
    const enabled = !this.nightMode();
    this.nightMode.set(enabled);
    this.setupAudioGraph();
    if (this.bassFilter) {
      this.bassFilter.frequency.value = enabled ? 180 : 32000;
      this.bassFilter.gain.value = enabled ? 7 : 0;
    }
    if (this.reverbGain) {
      this.reverbGain.gain.value = enabled ? 0.25 : 0;
    }
  }

  private setupAudioGraph(): void {
    if (this.audioCtx) return;
    try {
      this.audioCtx = new AudioContext();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      // Chaine : source -> bass filter -> dry gain -> destination
      this.bassFilter = this.audioCtx.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.value = 32000;
      this.bassFilter.gain.value = 0;

      // Reverb artificielle (impulse response synthetisee)
      this.reverbNode = this.audioCtx.createConvolver();
      this.reverbNode.buffer = this.createClubReverbIR();
      this.reverbGain = this.audioCtx.createGain();
      this.reverbGain.gain.value = 0;

      this.sourceNode.connect(this.bassFilter);
      this.bassFilter.connect(this.audioCtx.destination);
      this.bassFilter.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.audioCtx.destination);
    } catch (e) {
      // AudioContext indisponible : lecture classique sans effets
      this.audioCtx = null;
    }
  }

  /** Genere une impulse response reverb "club" synthetique (2 s de decay). */
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

  /** Comptabilise l'ecoute une seule fois par piste (stats artiste). */
  private comptabiliserPlay(): void {
    const track = this.currentTrack();
    if (track && !this.playCounted) {
      this.playCounted = true;
      this.trackService.registerPlay(track.id, this.quality()).subscribe({
        next: () => {
          track.playCount += 1;
          this.currentTrack.set({ ...track });
        },
        error: () => {}
      });
    }
  }

  /** Detection connexion lente (2G/3G) => Data-Lite automatique. */
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

  formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
}
