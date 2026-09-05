import { MixPlan, MixSegment, MixTransition } from './auto-mix-planner';
import { TrackAnalysis } from './mix-analyzer';
import { PlannedMove } from './performance-engine';

/**
 * ============================================================================
 *  YAM DJ — MIX RENDERER (rendu DÉTERMINISTE hors ligne)
 * ============================================================================
 *
 *  Le même MixPlan sert deux moteurs :
 *
 *    Preview (temps réel)  : PerformancePlayer  → AudioContext   → écoute
 *    Render  (hors ligne)  : renderMixPlan()    → OfflineAudioContext → WAV
 *
 *  Ici, plus AUCUNE horloge murale : le plan + la performance sont convertis
 *  en une timeline absolue (secondes du mix), puis l'intégralité du graphe
 *  audio est construit et programmé AVANT le rendu :
 *
 *    source(piste) → EQ 3 bandes → filtre LP/HP → fader(trim) → crossfader
 *                    (+ echo / reverb / flanger en envoi)
 *      → master → limiteur → encodeur WAV 16 bits
 *
 *  Tout est reproductible au sample près : deux rendus du même plan
 *  (même graine) donnent exactement le même fichier.
 *
 *  Avantage sur l'enregistrement MediaRecorder (temps réel) :
 *    - rendu PLUS RAPIDE que le temps réel (l'OfflineAudioContext traite
 *      aussi vite que le CPU le permet) ;
 *    - indépendant de l'onglet actif / des throttles d'arrière-plan ;
 *    - WAV universel (téléchargeable, lisible partout, hors ligne).
 */

export interface RenderProgress { (pct: number, phase: string, detail: string): void }

export interface RenderedMix {
  /** Fichier WAV 16 bits prêt à télécharger / sauvegarder hors ligne. */
  wav: Blob;
  durationSec: number;
  sampleRate: number;
  /** Timeline des gestes rendus (diagnostic / UI). */
  gestures: { t: number; label: string; move: string }[];
}

export interface RenderMixOptions {
  sampleRate?: number;
  masterVolume?: number;
  seed?: number;
  onProgress?: RenderProgress;
}

// ============================ TIMELINE INTERNE ============================

/** Un segment du mix, résolu en temps absolus. */
interface SegInfo {
  seg: MixSegment;
  deck: 'A' | 'B';
  rate: number;
  /** Secondes de mix par temps musical (BPM effectif). */
  beatSec: number;
  /** Secondes piste par temps musical (BPM natif de la piste). */
  beatSecTrack: number;
  /** Décalage de départ dans le tampon (temps piste). */
  srcOffset: number;
  trim: number;
  tStart: number;
  /** Temps mix où le sortant atteint son point de coupe. */
  tCut: number;
  /** Temps piste du point de coupe. */
  cutTrack: number;
  tStop: number;
  buffer: AudioBuffer;
}

/** PRNG déterministe (bruit des one-shots reproductible). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Suivi d'automation cumulative pour un AudioParam (hors ligne, tout est
 *  programmé d'avance : les événements sont collectés puis flushés triés). */
class ParamTrack {
  private evts: { t: number; v: number; mode: 'set' | 'lin' | 'exp' }[] = [];
  constructor(private param: AudioParam, initial: number) {
    this.evts.push({ t: 0, v: initial, mode: 'set' });
  }
  set(t: number, v: number): void { this.evts.push({ t, v, mode: 'set' }); }
  lin(t: number, v: number): void { this.evts.push({ t, v, mode: 'lin' }); }
  /** Ancrage + rampe : tient `from` jusqu'à t-rampSec puis glisse vers v.
   *  Utilisé PARTOUT (sweeps échantillonnés → linéaire par morceaux avec
   *  micro-pauses ; gestes ponctuels → saut quasi instantané). Évite le bug
   *  de la rampe qui glisserait depuis t=0. */
  ramp(t: number, v: number, from: number, rampSec = 0.006): void {
    const T = Math.max(0, t);
    this.evts.push({ t: Math.max(0, T - rampSec), v: from, mode: 'set' });
    this.evts.push({ t: T, v, mode: 'lin' });
  }
  exp(t: number, v: number): void {
    if (v <= 0.00001) v = 0.00001;
    this.evts.push({ t, v, mode: 'exp' });
  }
  lastValue(): number {
    return this.evts.length ? this.evts[this.evts.length - 1].v : 0;
  }
  flush(): void {
    this.evts.sort((a, b) => a.t - b.t);
    for (const e of this.evts) {
      if (e.mode === 'set') this.param.setValueAtTime(e.v, Math.max(0, e.t));
      else if (e.mode === 'lin') this.param.linearRampToValueAtTime(e.v, Math.max(0, e.t));
      else this.param.exponentialRampToValueAtTime(e.v, Math.max(0, e.t));
    }
  }
}

/** Chaîne d'un deck dans le graphe hors ligne. */
interface DeckNodes {
  input: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  lpf: BiquadFilterNode;
  hpf: BiquadFilterNode;
  channelGain: GainNode;
  crossGain: GainNode;
  echo: DelayNode;
  echoWet: GainNode;
  echoFeedback: GainNode;
  reverb: ConvolverNode;
  reverbWet: GainNode;
  flanger: DelayNode;
  flangerWet: GainNode;
}

/** Automation logique d'un deck (miroir des gestes du DJ). */
class DeckAuto {
  vol = 1;
  eqLow = 0; eqMid = 0; eqHigh = 0;
  filterPos = 0.5;
  echoWetVal = 0;
  reverbWetVal = 0;
  flangerWetVal = 0;
  readonly channel: ParamTrack;
  readonly low: ParamTrack;
  readonly mid: ParamTrack;
  readonly high: ParamTrack;
  readonly lpfHz: ParamTrack;
  readonly hpfHz: ParamTrack;
  readonly echoWet: ParamTrack;
  readonly reverbWet: ParamTrack;
  readonly flangerWet: ParamTrack;
  readonly cross: ParamTrack;

  constructor(readonly nodes: DeckNodes, trim: number) {
    this.channel = new ParamTrack(nodes.channelGain.gain, trim);
    this.low = new ParamTrack(nodes.eqLow.gain, 0);
    this.mid = new ParamTrack(nodes.eqMid.gain, 0);
    this.high = new ParamTrack(nodes.eqHigh.gain, 0);
    this.lpfHz = new ParamTrack(nodes.lpf.frequency, 22050);
    this.hpfHz = new ParamTrack(nodes.hpf.frequency, 10);
    this.echoWet = new ParamTrack(nodes.echoWet.gain, 0);
    this.reverbWet = new ParamTrack(nodes.reverbWet.gain, 0);
    this.flangerWet = new ParamTrack(nodes.flangerWet.gain, 0);
    this.cross = new ParamTrack(nodes.crossGain.gain, 0);
    this.vol = trim;
  }

  /** Pose le filtre à une position (0..1) au temps t — ancrage + rampe :
   *  sweeps échantillonnés → linéaire par morceaux, zéro zipper. */
  filterAt(t: number, pos: number): void {
    const p = Math.max(0, Math.min(1, pos));
    // valeurs courantes déduites de la position logique
    let curLpf = 22050, curHpf = 10;
    if (this.filterPos <= 0.5) {
      const r = 1 - this.filterPos * 2;
      curLpf = 22050 * Math.pow(200 / 22050, r);
    } else {
      const r = (this.filterPos - 0.5) * 2;
      curHpf = 20 * Math.pow(4000 / 20, r);
    }
    if (p <= 0.5) {
      const ratio = 1 - p * 2;
      const hz = 22050 * Math.pow(200 / 22050, ratio);
      this.lpfHz.ramp(t, hz, curLpf);
      this.hpfHz.ramp(t, 10, curHpf);
    } else {
      const ratio = (p - 0.5) * 2;
      const hz = 20 * Math.pow(4000 / 20, ratio);
      this.hpfHz.ramp(t, hz, curHpf);
      this.lpfHz.ramp(t, 22050, curLpf);
    }
    this.filterPos = p;
  }

  /** Sweep du filtre interpolé (16 pas). */
  filterSweep(t0: number, fromPos: number, toPos: number, dur: number): void {
    const steps = 16;
    for (let k = 1; k <= steps; k++) {
      const p = fromPos + (toPos - fromPos) * (k / steps);
      this.filterAt(t0 + (dur * k) / steps, p);
    }
  }

  eqAt(t: number, band: 'low' | 'mid' | 'high', db: number): void {
    const tr = band === 'low' ? this.low : band === 'mid' ? this.mid : this.high;
    const cur = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh;
    tr.ramp(t, db, cur);
    if (band === 'low') this.eqLow = db;
    else if (band === 'mid') this.eqMid = db;
    else this.eqHigh = db;
  }

  volAt(t: number, v: number, rampSec = 0.006): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.channel.ramp(t, clamped, this.vol, rampSec);
    this.vol = clamped;
  }

  /** Wet d'effet — ancrage + rampe (sweep lisse ou allumage rapide). */
  wetAt(kind: 'echo' | 'reverb' | 'flanger', t: number, v: number, rampSec = 0.006): void {
    const tr = kind === 'echo' ? this.echoWet : kind === 'reverb' ? this.reverbWet : this.flangerWet;
    const cur = kind === 'echo' ? this.echoWetVal : kind === 'reverb' ? this.reverbWetVal : this.flangerWetVal;
    tr.ramp(t, Math.max(0, v), cur, rampSec);
    if (kind === 'echo') this.echoWetVal = v;
    else if (kind === 'reverb') this.reverbWetVal = v;
    else this.flangerWetVal = v;
  }

  /** Reset complet (fin de transition, miroir de resetDeckFx). */
  resetAt(t: number): void {
    this.wetAt('echo', t, 0, 0.25);
    this.wetAt('reverb', t, 0, 0.2);
    this.wetAt('flanger', t, 0, 0.2);
    this.filterAt(t, 0.5);
    this.eqAt(t, 'low', 0);
    this.eqAt(t, 'mid', 0);
    this.eqAt(t, 'high', 0);
  }
}

/** Convertit une fréquence HPF en position de filtre. */
function hzToFilterPos(hz: number): number {
  const h = Math.max(20, Math.min(4000, hz));
  return 0.5 + (0.5 * Math.log(h / 20)) / Math.log(4000 / 20);
}

// ============================ SOURCE CONTRÔLÉE ============================

/** Une piste jouée sur un deck, avec sa vie (découpe, boucles, sauts,
 *  spinback) entièrement programmée d'avance — déterministe. */
class SegSource {
  private reigns: { src: AudioBufferSourceNode; from: number; to: number }[] = [];
  private cur: { src: AudioBufferSourceNode; from: number; to: number } | null = null;
  private main: AudioBufferSourceNode;

  constructor(
    private ctx: OfflineAudioContext,
    private buffer: AudioBuffer,
    private rate: number,
    private dest: AudioNode,
    private srcOffset: number,
    tStart: number,
    tStop: number
  ) {
    this.main = this.spawn(tStart, srcOffset, tStop);
  }

  private spawn(t: number, offset: number, tStop: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.rate;
    src.connect(this.dest);
    src.start(Math.max(0, t), Math.max(0, Math.min(offset, this.buffer.duration - 0.05)));
    src.stop(Math.max(0, tStop));
    const rec = { src, from: t, to: tStop };
    this.reigns.push(rec);
    this.cur = rec;
    return src;
  }

  /** Position piste théorique au temps mix t (vitesse nominale). */
  positionAt(t: number): number {
    return this.srcOffset + (t - this.reigns[0].from) * this.rate;
  }

  /** Coupe la source courante au temps t. */
  stopAt(t: number): void {
    if (this.cur) { try { this.cur.src.stop(Math.max(0, t)); this.cur.to = t; } catch { } }
  }

  /** La source active au temps t (pour brake / pitch ramp). */
  activeAt(t: number): AudioBufferSourceNode | null {
    let found: { src: AudioBufferSourceNode; from: number; to: number } | null = null;
    for (const r of this.reigns) {
      if (t >= r.from - 0.001 && t <= r.to + 0.001) found = r;
    }
    return found ? found.src : this.cur?.src || null;
  }

  /** Saut en avant (beat jump) : coupe et relance plus loin. */
  jumpAt(t: number, deltaTrackSec: number): void {
    const pos = Math.min(this.buffer.duration - 0.1, this.positionAt(t) + deltaTrackSec);
    const stopT = this.cur ? this.cur.to : t + 1;
    this.stopAt(t);
    this.spawn(t, pos, stopT);
  }

  /** Boucle fixe : coupe la source, boucle la région, reprend ensuite. */
  loopRegion(tLoop: number, startTrack: number, endTrack: number, tUntil: number, resumeOffset: number): void {
    const stopT = this.cur ? this.cur.to : tUntil;
    this.stopAt(tLoop);
    const L = this.ctx.createBufferSource();
    L.buffer = this.buffer;
    L.playbackRate.value = this.rate;
    L.loop = true;
    L.loopStart = Math.max(0, startTrack);
    L.loopEnd = Math.min(this.buffer.duration, Math.max(startTrack + 0.04, endTrack));
    L.connect(this.dest);
    L.start(Math.max(0, tLoop), L.loopStart);
    L.stop(Math.max(0, tUntil));
    const rec = { src: L, from: tLoop, to: tUntil };
    this.reigns.push(rec);
    // reprise après la boucle (sémantique platine : la position a « gelé »)
    if (tUntil < stopT - 0.05) {
      const cont = this.ctx.createBufferSource();
      cont.buffer = this.buffer;
      cont.playbackRate.value = this.rate;
      cont.connect(this.dest);
      const off = Math.max(0, Math.min(resumeOffset, this.buffer.duration - 0.05));
      cont.start(Math.max(0, tUntil), off);
      cont.stop(Math.max(0, stopT));
      const rec2 = { src: cont, from: tUntil, to: stopT };
      this.reigns.push(rec2);
      this.cur = rec2;
    } else {
      this.cur = rec;
    }
  }

  /** Spinback : buffer inversé accéléré (le geste de coupe spectaculaire). */
  spinbackAt(t: number, durMs: number, posTrack: number, inRate: number): void {
    const dur = Math.max(0.18, durMs / 1000);
    const revLen = Math.min(dur * 2.2 * inRate, posTrack);
    if (revLen < 0.12) return;
    this.stopAt(t);
    const lenS = Math.floor(revLen * this.buffer.sampleRate);
    const rev = this.ctx.createBuffer(this.buffer.numberOfChannels, lenS, this.buffer.sampleRate);
    const startS = Math.floor((posTrack - revLen) * this.buffer.sampleRate);
    for (let ch = 0; ch < this.buffer.numberOfChannels; ch++) {
      const src = this.buffer.getChannelData(ch);
      const dst = rev.getChannelData(ch);
      for (let i = 0; i < lenS; i++) dst[i] = src[startS + lenS - 1 - i] || 0;
    }
    const s = this.ctx.createBufferSource();
    s.buffer = rev;
    s.connect(this.dest);
    const r2 = Math.max(1, inRate);
    s.playbackRate.setValueAtTime(0.55 * r2, t);
    s.playbackRate.linearRampToValueAtTime(2.1 * r2, t + dur);
    s.start(t);
    s.stop(t + dur + 0.02);
  }
}

// ============================ ONE-SHOTS (synthèse déterministe) ============================

function synthRiserAt(ctx: OfflineAudioContext, dest: AudioNode, t0: number, durSec: number, rng: () => number, short = false): void {
  const dur = Math.max(0.6, Math.min(6, durSec));
  const noise = ctx.createBufferSource();
  const len = Math.ceil(dur * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1;
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(short ? 500 : 260, t0);
  bp.frequency.exponentialRampToValueAtTime(short ? 3000 : 5200, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.16, t0 + dur * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
  noise.connect(bp); bp.connect(g); g.connect(dest);
  noise.start(t0);
  noise.stop(t0 + dur + 0.15);
}

function synthImpactAt(ctx: OfflineAudioContext, dest: AudioNode, t0: number, rng: () => number): void {
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(dest);
  const n = ctx.createBufferSource();
  const nb = ctx.createBuffer(1, Math.ceil(0.22 * ctx.sampleRate), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (rng() * 2 - 1) * Math.pow(1 - i / nd.length, 2);
  n.buffer = nb;
  const ng = ctx.createGain();
  ng.gain.value = 0.5;
  n.connect(ng); ng.connect(out);
  n.start(t0);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t0);
  o.frequency.exponentialRampToValueAtTime(38, t0 + 0.28);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.55, t0);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
  o.connect(og); og.connect(out);
  o.start(t0); o.stop(t0 + 0.35);
}

function synthSirenAt(ctx: OfflineAudioContext, dest: AudioNode, t0: number): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.15);
  g.gain.setValueAtTime(0.09, t0 + 1.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
  g.connect(dest);
  for (const det of [0, 7]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(620 + det, t0);
    o.frequency.linearRampToValueAtTime(980 + det, t0 + 0.8);
    o.frequency.linearRampToValueAtTime(640 + det, t0 + 1.6);
    o.connect(g);
    o.start(t0); o.stop(t0 + 1.8);
  }
}

function synthReverseImpactAt(ctx: OfflineAudioContext, dest: AudioNode, t0: number, rng: () => number): void {
  const n = ctx.createBufferSource();
  const nb = ctx.createBuffer(1, Math.ceil(0.9 * ctx.sampleRate), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (rng() * 2 - 1) * Math.pow(i / nd.length, 2.2);
  n.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.value = 0.22;
  n.connect(bp); bp.connect(g); g.connect(dest);
  n.start(t0);
  n.stop(t0 + 0.95);
}

// ============================ IR REVERB (hors ligne) ============================

function makeReverbIROffline(ctx: OfflineAudioContext, seconds: number, rng: () => number): AudioBuffer {
  const length = Math.floor(seconds * ctx.sampleRate);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (rng() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  return ir;
}

// ============================ ENCODEUR WAV ============================

/** Encode un AudioBuffer en WAV PCM 16 bits (stéréo préservée). */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const len = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, dataSize, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = chans[c][i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

// ============================ MOTEUR DE RENDU ============================

const STOP_ACTIONS = ['cut', 'hardCut', 'dropSwitch', 'playOut', 'brake', 'tapeStop', 'spinback'];

export async function renderMixPlan(
  plan: MixPlan,
  buffers: Map<string, AudioBuffer>,
  analyses: Map<number, TrackAnalysis>,
  opts: RenderMixOptions = {}
): Promise<RenderedMix> {

  const onProgress = opts.onProgress || (() => { });
  const sampleRate = opts.sampleRate || 44100;
  const masterVol = opts.masterVolume ?? 0.9;
  const rng = mulberry32(opts.seed ?? plan.performance?.stats.seed ?? 42);
  const gestures: { t: number; label: string; move: string }[] = [];

  onProgress(0.02, 'timeline', 'Construction de la timeline…');

  // ---- 0. plan résolu (copie : jamais de mutation du plan vivant) ----
  const segments: MixSegment[] = plan.segments.map(s => ({ ...s }));
  const transitions: MixTransition[] = plan.transitions.map(t => ({ ...t }));
  const moves: PlannedMove[] = plan.performance?.moves || [];

  const n = segments.length;
  if (n === 0) throw new Error('Plan vide');
  if (n >= 2 && transitions.length < n - 1) throw new Error('Plan incohérent (transitions manquantes)');

  // ---- 1. décisions de point d'entrée (miroir du player live) ----
  const srcOffsetOf = (i: number): number => {
    const seg = segments[i];
    const a = analyses.get(i) || null;
    const bi = a?.structure.bestIn ?? null;
    const inRange = bi != null && bi > 4 && bi < 20;
    if (i === 0) return seg.playFrom;
    const move = moves.find(m => m.fromIndex === i - 1);
    if (move) {
      const playIn = move.steps.find(s => s.action === 'playIn' && s.target === 'in');
      if (playIn?.params['onDownbeat']) return seg.playFrom;
    }
    return seg.playFrom + (inRange && bi ? bi : 0);
  };

  // ---- 2. timeline absolue ----
  const segs: SegInfo[] = [];
  let tInStartPrev = 0;
  for (let i = 0; i < n; i++) {
    const seg = segments[i];
    const buffer = buffers.get(seg.track.id);
    if (!buffer) throw new Error('Tampon audio manquant pour « ' + seg.track.title + ' »');
    const rate = 1 + (seg.pitchPct || 0) / 100;
    const bpmTrack = seg.track.bpm || 105;
    const bpmEff = seg.effectiveBpm || bpmTrack * rate;
    const beatSec = 60 / bpmEff;
    const beatSecTrack = 60 / bpmTrack;
    const analysis = analyses.get(i) || null;

    let cutTrack = seg.playTo;
    if (analysis?.structure.bestOut != null) {
      const measured = seg.playFrom + analysis.structure.bestOut;
      if (Math.abs(measured - seg.playTo) < 25 && measured > seg.playFrom + 25) cutTrack = measured;
    }
    const srcOffset = srcOffsetOf(i);
    const tStart = i === 0 ? 0.02 : tInStartPrev;
    const tCut = tStart + Math.max(0.5, (cutTrack - srcOffset) / rate);
    const trim = analysis ? Math.max(0.5, Math.min(1, analysis.trim)) : 1;

    const info: SegInfo = {
      seg, deck: i % 2 === 0 ? 'A' : 'B', rate, beatSec, beatSecTrack,
      srcOffset, trim, tStart, tCut, cutTrack, tStop: tCut + 0.35, buffer
    };
    segs.push(info);

    if (i < n - 1) {
      const trans = transitions[i];
      const move = moves.find(m => m.fromIndex === i) || null;
      const tTransStart = Math.max(info.tStart + 0.1, info.tCut - trans.durationSec);
      let tInStart: number;
      if (move) {
        const inStep = move.steps
          .filter(s => s.target === 'in' && (s.action === 'playIn' || s.action === 'vocalTease' || s.action === 'vocalLoop'))
          .sort((a, b) => a.atBeats - b.atBeats)[0];
        tInStart = inStep
          ? Math.max(tTransStart, info.tCut + inStep.atBeats * info.beatSec)
          : tTransStart;
      } else {
        tInStart = trans.type === 'F' ? tTransStart + trans.durationSec * 0.5 : tTransStart;
      }
      tInStartPrev = tInStart;

      // arrêt du sortant
      let tOutStop: number;
      if (move) {
        const postBeats = Math.max(0, ...move.steps.map(s => s.atBeats));
        const stopStep = move.steps
          .filter(s => s.target === 'out' && STOP_ACTIONS.includes(s.action))
          .sort((a, b) => a.atBeats - b.atBeats)
          .pop();
        if (stopStep) {
          const t = Math.max(tTransStart, info.tCut + stopStep.atBeats * info.beatSec);
          const extra = stopStep.action === 'brake' || stopStep.action === 'tapeStop'
            ? (stopStep.params['ms'] ?? 420) / 1000 + 0.12
            : stopStep.action === 'spinback' ? (Math.max(180, (stopStep.params['beats'] ?? 1) * info.beatSec * 1000 * 0.85)) / 1000 + 0.1 : 0.12;
          tOutStop = t + extra;
        } else {
          tOutStop = info.tCut + postBeats * info.beatSec + 0.3;
        }
      } else {
        tOutStop = tTransStart + trans.durationSec + 0.3;
      }
      info.tStop = tOutStop;
    } else {
      // dernier segment : il joue à travers le fondu de fin (4 s)
      info.tStop = info.tCut + 4.6;
    }
  }

  const totalDur = Math.max(...segs.map(s => s.tStop)) + 2.2;

  onProgress(0.08, 'graph', 'Graphe audio…');

  // ---- 3. graphe hors ligne ----
  const OAC: typeof OfflineAudioContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(totalDur * sampleRate), sampleRate);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0; // fade-in initial anti-clic
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const fxBus = ctx.createGain();
  fxBus.gain.value = 0.9;
  masterGain.connect(limiter);
  limiter.connect(ctx.destination);
  fxBus.connect(masterGain);

  const masterTrack = new ParamTrack(masterGain.gain, 0.0001);
  masterTrack.lin(0.05, masterVol);
  let masterVal = masterVol;

  const buildDeck = (): DeckNodes => {
    const input = ctx.createGain();
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf'; eqLow.frequency.value = 250;
    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking'; eqMid.frequency.value = 1200; eqMid.Q.value = 1.0;
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf'; eqHigh.frequency.value = 4000;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 22050; lpf.Q.value = 0.5;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 10; hpf.Q.value = 0.5;
    const channelGain = ctx.createGain();
    const crossGain = ctx.createGain();
    crossGain.gain.value = 0;

    // echo (envoi parallèle)
    const echo = ctx.createDelay(2.0);
    echo.delayTime.value = 0.35;
    const echoWet = ctx.createGain(); echoWet.gain.value = 0;
    const echoFeedback = ctx.createGain(); echoFeedback.gain.value = 0.35;
    // reverb
    const reverb = ctx.createConvolver();
    reverb.buffer = makeReverbIROffline(ctx, 1.8, rng);
    const reverbWet = ctx.createGain(); reverbWet.gain.value = 0;
    // flanger (LFO continu)
    const flanger = ctx.createDelay(0.05);
    flanger.delayTime.value = 0.0065;
    const flangerWet = ctx.createGain(); flangerWet.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.0022;
    lfo.connect(lfoGain); lfoGain.connect(flanger.delayTime);
    lfo.start(0); lfo.stop(totalDur);

    input.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
    eqHigh.connect(lpf); lpf.connect(hpf);
    hpf.connect(channelGain);
    hpf.connect(echo); echo.connect(echoWet); echoWet.connect(channelGain);
    echo.connect(echoFeedback); echoFeedback.connect(echo);
    hpf.connect(reverb); reverb.connect(reverbWet); reverbWet.connect(channelGain);
    hpf.connect(flanger); flanger.connect(flangerWet); flangerWet.connect(channelGain);
    channelGain.connect(crossGain);
    crossGain.connect(masterGain);

    return { input, eqLow, eqMid, eqHigh, lpf, hpf, channelGain, crossGain, echo, echoWet, echoFeedback, reverb, reverbWet, flanger, flangerWet };
  };

  const deckANodes = buildDeck();
  const deckBNodes = buildDeck();
  const autoA = new DeckAuto(deckANodes, segs[0]?.trim ?? 1);
  const autoB = new DeckAuto(deckBNodes, segs[1]?.trim ?? 1);
  const deckAuto = (deck: 'A' | 'B') => (deck === 'A' ? autoA : autoB);
  const deckNodes = (deck: 'A' | 'B') => (deck === 'A' ? deckANodes : deckBNodes);

  // sources par segment
  const sources = new Map<number, SegSource>();
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    sources.set(i, new SegSource(ctx, s.buffer, s.rate, deckNodes(s.deck).input, s.srcOffset, s.tStart, s.tStop));
  }

  // trim de voie au démarrage de chaque segment
  for (let i = 0; i < n; i++) {
    deckAuto(segs[i].deck).volAt(segs[i].tStart, segs[i].trim, 0.1);
  }
  // crossfader initial : segment 0 plein sur A
  autoA.cross.set(0.02, 1);
  autoB.cross.set(0.02, 0);

  // ---- 4. programmation des transitions ----
  onProgress(0.15, 'gestes', 'Programmation des gestes DJ…');

  /** Crossfade : x = part du deck B (0 = A plein, 1 = B plein).
   *  État logique suivi → ancrage + rampe : sweeps lisses, sauts nets. */
  let crossX = 0;
  const crossTo = (t: number, x: number, rampSec = 0.006): void => {
    const clampedX = Math.max(0, Math.min(1, x));
    const a = Math.max(0.0001, Math.cos(clampedX * Math.PI / 2));
    const b = Math.max(0.0001, Math.sin(clampedX * Math.PI / 2));
    const ca = Math.max(0.0001, Math.cos(crossX * Math.PI / 2));
    const cb = Math.max(0.0001, Math.sin(crossX * Math.PI / 2));
    autoA.cross.ramp(t, a, ca, rampSec);
    autoB.cross.ramp(t, b, cb, rampSec);
    crossX = clampedX;
  };

  /** Cherche la prochaine étape (après atBeats ref) sur une cible/action. */
  const nextStepTime = (
    move: PlannedMove, afterBeats: number, target: 'out' | 'in' | 'master',
    actions: string[], tCut: number, beatSec: number, tFallback: number
  ): number => {
    let best: number | null = null;
    for (const s of move.steps) {
      if (s.target !== target || !actions.includes(s.action) || s.atBeats <= afterBeats) continue;
      const t = tCut + s.atBeats * beatSec;
      if (best == null || t < best) best = t;
    }
    return best != null ? best : tFallback;
  };

  for (let i = 0; i < n - 1; i++) {
    const out = segs[i];
    const inn = segs[i + 1];
    const trans = transitions[i];
    const move = moves.find(m => m.fromIndex === i) || null;
    const outAuto = deckAuto(out.deck);
    const inAuto = deckAuto(inn.deck);
    const outSrc = sources.get(i)!;
    const tTransStart = Math.max(out.tStart + 0.1, out.tCut - trans.durationSec);

    if (move) {
      // =============== PERFORMANCE : les gestes du DJ ===============
      const sorted = [...move.steps].sort((a, b) => a.atBeats - b.atBeats);
      const stepT = (atBeats: number): number => Math.max(tTransStart, out.tCut + atBeats * out.beatSec);

      // garde-fou anti-collision de basses (miroir du player live)
      if (move.bars >= 16 && !sorted.some(s => s.action === 'eqLow' && s.target === 'out' && (s.params['db'] ?? 0) <= -14)) {
        outAuto.eqAt(stepT(-2), 'low', -22);
      }

      let rollAnchor: number | null = null;   // fin de roll (temps piste)
      let teaseSrc: AudioBufferSourceNode | null = null;

      for (const st of sorted) {
        const t = stepT(st.atBeats);
        gestures.push({ t, label: st.label, move: move.name });
        const targetAuto = st.target === 'out' ? outAuto : st.target === 'in' ? inAuto : null;

        switch (st.action) {
          case 'eqLow': targetAuto?.eqAt(t, 'low', st.params['db'] ?? 0); break;
          case 'eqMid': targetAuto?.eqAt(t, 'mid', st.params['db'] ?? 0); break;
          case 'eqHigh': targetAuto?.eqAt(t, 'high', st.params['db'] ?? 0); break;
          case 'eqNeutral':
            targetAuto?.eqAt(t, 'low', 0); targetAuto?.eqAt(t, 'mid', 0); targetAuto?.eqAt(t, 'high', 0);
            break;

          case 'volume':
            targetAuto?.volAt(t, st.params['to'] ?? 0.5, 0.35);
            break;

          case 'crossfade': {
            const to = Math.max(0, Math.min(1, st.params['to'] ?? 1));
            crossTo(t, out.deck === 'A' ? to : 1 - to, 0.15);
            break;
          }

          case 'mute': {
            const deck = st.target === 'out' ? outAuto : inAuto;
            const prev = deck.vol > 0.05 ? deck.vol : 0.8;
            deck.volAt(t, 0, 0.02);
            const back = t + Math.max(0.12, (st.params['beats'] ?? 1) * out.beatSec);
            deck.volAt(back, prev, 0.05);
            break;
          }
          case 'unmute': targetAuto?.volAt(t, st.params['to'] ?? 0.8, 0.1); break;

          case 'echoOn': {
            const deck = st.target === 'out' ? outAuto : inAuto;
            const nodes = st.target === 'out' ? deckNodes(out.deck) : deckNodes(inn.deck);
            const div = Math.max(1, st.params['div'] ?? 2);
            // synchro au temps : delai = duree d'un temps (BPM effectif) / division
            nodes.echo.delayTime.setValueAtTime(Math.min(1.9, out.beatSec / div), t - 0.02);
            nodes.echoFeedback.gain.setValueAtTime(Math.max(0, Math.min(0.85, st.params['feedback'] ?? 0.6)), t - 0.02);
            deck.wetAt('echo', t + 0.08, st.params['wet'] ?? 0.5, 0.08);
            break;
          }
          case 'echoOff': targetAuto?.wetAt('echo', t, 0, 0.3); break;
          case 'reverbOn': targetAuto?.wetAt('reverb', t + 0.1, st.params['wet'] ?? 0.4, 0.1); break;
          case 'reverbOff': targetAuto?.wetAt('reverb', t, 0, 0.25); break;
          case 'flangerOn': targetAuto?.wetAt('flanger', t + 0.15, st.params['wet'] ?? 0.4, 0.15); break;

          case 'filterHp': {
            const hz = st.params['to'] ?? st.params['from'] ?? 800;
            const dur = st.params['over'] ?? 0;
            const pos = hzToFilterPos(hz);
            if (dur > 0 && targetAuto) targetAuto.filterSweep(t, targetAuto.filterPos, pos, dur);
            else targetAuto?.filterAt(t, pos);
            break;
          }
          case 'filterLp': {
            const hz = st.params['to'] ?? st.params['from'] ?? 300;
            const pos = 0.5 * (1 - Math.log(Math.max(200, Math.min(22050, hz)) / 200) / Math.log(22050 / 200));
            if (st.params['over'] && targetAuto) targetAuto.filterSweep(t, targetAuto.filterPos, pos, st.params['over']);
            else targetAuto?.filterAt(t, pos);
            break;
          }
          case 'filterNeutral': targetAuto?.filterAt(t, 0.5); break;

          case 'loop': {
            if (st.target !== 'out') break;
            const beats = st.params['beats'] ?? 4;
            const posTrack = outSrc.positionAt(t);
            const k = Math.round((posTrack - out.cutTrack) / out.beatSecTrack);
            const q = out.cutTrack + k * out.beatSecTrack;
            const until = nextStepTime(move, st.atBeats, 'out', ['loopClear', ...STOP_ACTIONS], out.tCut, out.beatSec, out.tStop);
            outSrc.loopRegion(t, q, q + beats * out.beatSecTrack, until, q + beats * out.beatSecTrack);
            break;
          }
          case 'loopClear':
            if (st.target === 'out') rollAnchor = null; // la boucle se termine via until
            break;

          case 'loopRoll': {
            if (st.target !== 'out') break;
            const seqBeats = Math.max(0.25, st.params['seq'] ?? 1);
            const posTrack = outSrc.positionAt(t);
            if (rollAnchor == null) {
              const k = Math.round((posTrack - out.cutTrack) / out.beatSecTrack);
              const q = out.cutTrack + k * out.beatSecTrack;
              rollAnchor = q + seqBeats * out.beatSecTrack;
              const until = nextStepTime(move, st.atBeats, 'out', ['loopRoll', 'loopClear', ...STOP_ACTIONS], out.tCut, out.beatSec, Math.min(out.tStop, t + seqBeats * out.beatSec));
              outSrc.loopRegion(t, rollAnchor - seqBeats * out.beatSecTrack, rollAnchor, until, rollAnchor);
            } else {
              const until = nextStepTime(move, st.atBeats, 'out', ['loopRoll', 'loopClear', ...STOP_ACTIONS], out.tCut, out.beatSec, Math.min(out.tStop, t + seqBeats * out.beatSec));
              outSrc.loopRegion(t, rollAnchor - seqBeats * out.beatSecTrack, rollAnchor, until, rollAnchor);
            }
            break;
          }

          case 'gate': {
            const deck = st.target === 'out' ? outAuto : inAuto;
            const beats = st.params['beats'] ?? 2;
            const duty = st.params['duty'] ?? 0.5;
            const stepT2 = out.beatSec / 4;
            const vol = deck.vol > 0.05 ? deck.vol : 0.8;
            const nn = Math.max(1, Math.round(beats * 4));
            for (let k2 = 1; k2 <= nn; k2++) {
              const tt = t + k2 * stepT2;
              deck.channel.set(tt, k2 % 2 === 0 ? vol : vol * (1 - duty));
            }
            deck.channel.set(t + (nn + 1) * stepT2, vol);
            break;
          }

          case 'cut': {
            if (st.target === 'in' && teaseSrc) {
              try { teaseSrc.stop(t); } catch { }
              teaseSrc = null;
            } else if (st.target === 'out') {
              outSrc.stopAt(t);
            }
            break;
          }
          case 'hardCut': {
            if (st.target === 'in' && teaseSrc) {
              try { teaseSrc.stop(t); } catch { }
              teaseSrc = null;
            }
            if (st.target === 'out') outSrc.stopAt(t);
            targetAuto?.volAt(t, 0.85, 0.02);
            break;
          }
          case 'dropSwitch': {
            inAuto.filterAt(t, 0.5);
            inAuto.eqAt(t, 'low', 0);
            outAuto.volAt(t, 0, 0.03);
            crossTo(t, out.deck === 'A' ? 1 : 0, 0.05);
            break;
          }
          case 'playOut': outSrc.stopAt(t); break;

          case 'silence': {
            const beats = st.params['beats'] ?? 1;
            masterTrack.ramp(t + 0.03, masterVol * 0.04, masterVal, 0.03);
            masterVal = masterVol * 0.04;
            masterTrack.ramp(t + Math.max(0.12, beats * out.beatSec), masterVol, masterVal, 0.06);
            masterVal = masterVol;
            break;
          }

          case 'spinback': {
            const beats = st.params['beats'] ?? 1;
            const durMs = Math.max(180, beats * out.beatSec * 1000 * 0.85);
            outSrc.spinbackAt(t, durMs, outSrc.positionAt(t), out.rate);
            break;
          }
          case 'brake':
          case 'tapeStop': {
            const ms = st.params['ms'] ?? (st.action === 'brake' ? 420 : 520);
            const src = outSrc.activeAt(t);
            if (src) {
              src.playbackRate.setValueAtTime(out.rate, t);
              src.playbackRate.exponentialRampToValueAtTime(0.02, t + ms / 1000);
            }
            outSrc.stopAt(t + ms / 1000 + 0.05);
            outAuto.filterAt(t, Math.max(0, 0.5 - 0.5 * (ms / 600)));
            break;
          }
          case 'pitchRamp': {
            const toPct = st.params['toPct'] ?? 5;
            const beats = st.params['beats'] ?? 6;
            const src = outSrc.activeAt(t);
            if (src) {
              src.playbackRate.setValueAtTime(out.rate, t);
              src.playbackRate.linearRampToValueAtTime(1 + toPct / 100, t + beats * out.beatSec);
            }
            break;
          }
          case 'beatJump': {
            const beats = st.params['beats'] ?? 4;
            if (st.target === 'out') outSrc.jumpAt(t, beats * out.beatSecTrack);
            else {
              const inSrc = sources.get(i + 1);
              inSrc?.jumpAt(t, beats * inn.beatSecTrack);
            }
            break;
          }

          case 'vocalTease':
          case 'vocalLoop': {
            // boucle vocale de l'entrant : source supplémentaire (casque « tease »)
            const inBuf = inn.buffer;
            const beats = st.params['beats'] ?? 2;
            const a = analyses.get(i + 1) || null;
            let from = inn.seg.playFrom;
            if (a?.vocalCurve?.length) {
              const dur = a.duration;
              let best = -1, bestT = from;
              for (let tt = inn.seg.playFrom; tt < Math.min(inn.seg.playFrom + 16 * a.barLen, dur - 1); tt += a.barLen) {
                const idx = Math.round((tt / dur) * a.vocalCurve.length);
                let s = 0, c = 0;
                const win = Math.round(4 * 4 * (a.barLen / dur) * a.vocalCurve.length);
                for (let k2 = idx; k2 < Math.min(a.vocalCurve.length, idx + win); k2++) { s += a.vocalCurve[k2]; c++; }
                const v = c ? s / c : 0;
                if (v > best) { best = v; bestT = tt; }
              }
              if (best > 0.35) from = bestT;
            }
            inAuto.volAt(t, 0.4, 0.05);
            inAuto.wetAt('reverb', t + 0.1, 0.4, 0.1);
            const L = ctx.createBufferSource();
            L.buffer = inBuf;
            L.playbackRate.value = inn.rate;
            L.loop = true;
            L.loopStart = Math.max(0, from);
            L.loopEnd = Math.min(inBuf.duration - 0.05, from + beats * inn.beatSecTrack);
            L.connect(deckNodes(inn.deck).input);
            const tStopTease = nextStepTime(move, st.atBeats, 'in', ['cut', 'hardCut'], out.tCut, out.beatSec, Math.min(out.tCut, t + 8));
            L.start(t, L.loopStart);
            L.stop(tStopTease);
            teaseSrc = L;
            crossTo(t, out.deck === 'A' ? 0.42 : 0.58, 0.2);
            break;
          }

          case 'riser': synthRiserAt(ctx, fxBus, t, (st.params['beats'] ?? 8) * out.beatSec, rng); break;
          case 'noiseSweep': synthRiserAt(ctx, fxBus, t, (st.params['beats'] ?? 2) * out.beatSec, rng, true); break;
          case 'impact': synthImpactAt(ctx, fxBus, t, rng); break;
          case 'siren': synthSirenAt(ctx, fxBus, t); break;
          case 'reverseHit': synthReverseImpactAt(ctx, fxBus, t, rng); break;

          case 'playIn': {
            // la source principale de l'entrant part exactement ici (déjà
            // programmée à tStart = ce temps) : filtre/EQ d'entrée
            if (st.params['filtered']) {
              inAuto.filterAt(t, hzToFilterPos(st.params['hzFrom'] ?? 600));
              inAuto.eqAt(t, 'low', st.params['filteredLow'] ?? -12);
            }
            crossTo(t, out.deck === 'A' ? (st.params['onDownbeat'] ? 1 : 0.35) : (st.params['onDownbeat'] ? 0 : 0.65), 0.08);
            break;
          }
        }
      }

      // fin du move : reset du sortant + crossfader plein sur l'entrant
      const postBeats = Math.max(0, ...move.steps.map(s => s.atBeats));
      const tEndMove = Math.max(out.tStop + 0.25, out.tCut + postBeats * out.beatSec + 0.2);
      outAuto.resetAt(tEndMove);
      crossTo(tEndMove, out.deck === 'A' ? 1 : 0, 0.1);
      inAuto.volAt(inn.tStart, inn.trim, 0.1);
    } else {
      // =============== TRANSITION CLASSIQUE (types A..H) ===============
      const N = 24;
      const outIsA = out.deck === 'A';
      for (let k2 = 0; k2 <= N; k2++) {
        const p = k2 / N;
        const pe = p * p * (3 - 2 * p);
        const t = tTransStart + trans.durationSec * p;
        crossTo(t, outIsA ? pe : 1 - pe, 0);

        switch (trans.type) {
          case 'C':
            outAuto.eqAt(t, 'low', -26 * Math.min(1, pe * 1.5));
            inAuto.eqAt(t, 'low', pe < 0.45 ? -14 : -14 + 14 * (pe - 0.45) / 0.55);
            break;
          case 'D':
            outAuto.filterAt(t, 0.5 + 0.32 * pe);
            inAuto.filterAt(t, 0.5 + 0.16 * (1 - Math.min(1, pe * 1.6)));
            break;
          case 'E':
            if (pe > 0.5) {
              const wet = Math.min(0.6, 0.15 + (pe - 0.5) * 0.9);
              outAuto.wetAt('echo', t, wet, 0.006);
              deckNodes(out.deck).echo.delayTime.setValueAtTime(60 / (out.seg.track.bpm || 105), tTransStart);
            }
            break;
          case 'G':
            if (pe < 0.5) inAuto.eqAt(t, 'low', -16 - 8 * pe);
            else inAuto.eqAt(t, 'low', -24 + 24 * (pe - 0.5) * 2);
            outAuto.eqAt(t, 'high', 2 * pe);
            break;
          case 'H':
            if (pe > 0.35) outAuto.wetAt('flanger', t, 0.35 + 0.35 * pe, 0.006);
            break;
        }
      }
      // F : break — silence rythmique bref + entrée franche
      if (trans.type === 'F') {
        const tDip = tTransStart + trans.durationSec * 0.45;
        const tBack = tTransStart + trans.durationSec * 0.58;
        masterTrack.ramp(tDip + 0.03, masterVol * 0.06, masterVal, 0.03);
        masterTrack.ramp(tBack, masterVol, masterVol * 0.06, 0.08);
      }
      const tEnd = tTransStart + trans.durationSec;
      outAuto.resetAt(tEnd + 0.35);
      crossTo(tEnd + 0.05, outIsA ? 1 : 0, 0.1);
      inAuto.volAt(inn.tStart, inn.trim, 0.1);
    }
  }

  // ---- 5. fondu de fin (miroir de beginFinish : 4 s de master) ----
  const last = segs[n - 1];
  masterTrack.ramp(last.tCut + 4.0, 0.0001, masterVal, 4.0);
  masterTrack.set(last.tCut + 4.5, 0.0001);

  // ---- 6. flush de toutes les automations ----
  autoA.channel.flush(); autoA.low.flush(); autoA.mid.flush(); autoA.high.flush();
  autoA.lpfHz.flush(); autoA.hpfHz.flush();
  autoA.echoWet.flush(); autoA.reverbWet.flush(); autoA.flangerWet.flush(); autoA.cross.flush();
  autoB.channel.flush(); autoB.low.flush(); autoB.mid.flush(); autoB.high.flush();
  autoB.lpfHz.flush(); autoB.hpfHz.flush();
  autoB.echoWet.flush(); autoB.reverbWet.flush(); autoB.flangerWet.flush(); autoB.cross.flush();
  masterTrack.flush();

  onProgress(0.3, 'render', 'Rendu audio hors ligne…');

  // ---- 7. rendu ----
  const rendered = await ctx.startRendering();

  onProgress(0.85, 'encode', 'Encodage WAV…');

  const wav = encodeWav(rendered);

  onProgress(1, 'done', 'Terminé');

  return {
    wav,
    durationSec: rendered.duration,
    sampleRate: rendered.sampleRate,
    gestures
  };
}
