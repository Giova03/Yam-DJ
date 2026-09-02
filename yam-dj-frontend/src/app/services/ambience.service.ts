import { Injectable, signal } from '@angular/core';

/**
 * MODE AMBIANCE — natures sonores synthetisees (Web Audio), 100 % hors
 * ligne et gratuites : la pluie, l'ocean et le vent sont generes par
 * bruit filtre, sans aucun fichier a telecharger. Complement naturel
 * de la minuterie sommeil « Dodo musique ».
 */
@Injectable({ providedIn: 'root' })
export class AmbienceService {

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private buffer: AudioBuffer | null = null;

  /** Ambiance active : null | 'rain' | 'ocean' | 'wind' */
  active = signal<string | null>(null);
  volume = signal<number>(0.6);

  /** Lance une ambiance (toggle si deja active). */
  toggle(kind: 'rain' | 'ocean' | 'wind'): void {
    if (this.active() === kind) {
      this.stop();
      return;
    }
    this.stop();
    this.ensureContext();
    if (!this.ctx || !this.master) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const wet = this.ctx.createGain();

    if (kind === 'rain') {
      // Pluie : bruit blanc passe-haut + leger souffle
      filter.type = 'highpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.4;
      lfo.frequency.value = 0.35;
      lfoGain.gain.value = 500;   // variation douce de la texture
      wet.gain.value = 0.45;
    } else if (kind === 'ocean') {
      // Ocean : bruit brun grave + houle lente (LFO 0.09 Hz)
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 0.6;
      lfo.frequency.value = 0.09;
      lfoGain.gain.value = 260;
      wet.gain.value = 0.9;
    } else {
      // Vent : bande medium et souffle irregulier
      filter.type = 'bandpass';
      filter.frequency.value = 550;
      filter.Q.value = 0.25;
      lfo.frequency.value = 0.16;
      lfoGain.gain.value = 320;
      wet.gain.value = 0.7;
    }

    try { lfo.connect(lfoGain); lfoGain.connect(filter.frequency); } catch { }

    src.connect(filter);
    filter.connect(wet);
    wet.connect(this.master);

    src.start();
    try { lfo.start(); } catch { }

    this.nodes = [src, filter, lfo, lfoGain, wet];
    this.active.set(kind);
  }

  stop(): void {
    this.nodes.forEach(n => {
      try {
        if ((n as AudioBufferSourceNode).stop) (n as AudioBufferSourceNode).stop();
        n.disconnect();
      } catch { /* deja detache */ }
    });
    this.nodes = [];
    this.active.set(null);
  }

  setVolume(v: number): void {
    this.volume.set(v);
    if (this.master) this.master.gain.value = v;
  }

  private ensureContext(): void {
    if (this.ctx) {
      this.ctx.resume().catch(() => {});
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume();
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  /** Genere 4 s de bruit blanc stereo (reutilise en boucle). */
  private noiseBuffer(): AudioBuffer {
    if (this.buffer) return this.buffer;
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        // bruit brun lisse (moyenne mobile) pour ocean/vent
        last = (last + 0.02 * white) / 1.02;
        data[i] = white * 0.35 + last * 3.2;
      }
    }
    this.buffer = buf;
    return buf;
  }
}
