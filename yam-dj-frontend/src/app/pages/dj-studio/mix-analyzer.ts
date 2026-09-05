import { Track } from '../../models/models';
import { detectBpm } from './dj-engine';

/**
 * ============================================================================
 *  YAM DJ — ANALYSEUR MUSICAL (signal reel, cote navigateur)
 * ============================================================================
 *  Complète les métadonnées de la plateforme par une vraie analyse du
 *  signal une fois la piste décodée en mémoire (AudioBuffer) :
 *
 *  - courbe d'énergie (RMS fenêtré, lissé) → structure intro / outro,
 *    meilleur point d'entrée et de sortie pour une transition DJ ;
 *  - énergie moyenne 0..1 (pour la courbe d'énergie du mix) ;
 *  - loudness RMS → gain de normalisation (homogénéité du mix) ;
 *  - BPM réel si absent des métadonnées (detectBpm du moteur) ;
 *  - tonalité (chroma Goertzel + gabarits Krumhansl) → Camelot si absente.
 *
 *  Toutes les opérations parcourent le signal avec sous-échantillonnage :
 *  ~1-2 s par piste au chargement du deck, aucune donnée envoyée.
 */

/** Structure musicale estimée d'une piste (temps en secondes piste). */
export interface TrackStructure {
  intro: [number, number] | null;
  outro: [number, number] | null;
  bestIn: number | null;
  bestOut: number | null;
}

/** Analyse complète d'une piste. */
export interface TrackAnalysis {
  track: Track;
  duration: number;
  bpm: number | null;
  camelot: string | null;
  /** Énergie moyenne 0..1 (bande médiane 80 %). */
  energy: number;
  /** Courbe d'énergie normalisée (points équirépartis). */
  energyCurve: number[];
  /** Proxy vocal (énergie bande 300–3400 Hz normalisée) — même longueur
   *  que energyCurve. Utilisé par le moteur de performance pour repérer
   *  les fins de phrase vocale et les extraits teasables. */
  vocalCurve?: number[];
  /** RMS global (≈ loudness). */
  rms: number;
  /** Gain de normalisation vers RMS cible 0.20 (0.7..1.4). */
  trim: number;
  structure: TrackStructure;
  /** Durée d'une mesure (s) selon le BPM. */
  barLen: number;
}

const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PITCHES_FLAT: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb' };

/** Table Camelot officielle (tonalité → code). */
const KEY_TO_CAMELOT: Record<string, string> = {
  C: '8B', G: '9B', D: '10B', A: '11B', E: '12B', B: '1B',
  'F#': '2B', Db: '3B', Ab: '4B', Eb: '5B', Bb: '6B', F: '7B',
  Cm: '8A', Gm: '9A', Dm: '10A', Am: '11A', Em: '12A', Bm: '1A',
  'F#m': '2A', Dbm: '3A', Abm: '4A', Ebm: '5A', Bbm: '6A', Fm: '7A'
};

/** Gabarits de Krumhansl (profil de tonalité majeur / mineur, classe 0 = tonique). */
const MAJOR_TEMPLATE = [6.35, 2.23, 3.48, 2.33, 4.38, 3.34, 2.46, 5.22, 2.39, 3.34, 2.46, 4.38];
const MINOR_TEMPLATE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** RMS global + courbe d'énergie normalisée. */
export function computeEnergy(buffer: AudioBuffer, points = 96): { curve: number[]; rms: number } {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const n = buffer.length;
  const hop = Math.max(1, Math.floor(n / points));
  const win = Math.min(hop, 4096);
  const raw: number[] = [];
  for (let w = 0; w * hop < n; w++) {
    const start = w * hop;
    const end = Math.min(start + win, n);
    let sum = 0;
    let cnt = 0;
    for (let i = start; i < end; i += 4) { // sous-échantillonnage x4
      const v = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
      sum += v * v;
      cnt++;
    }
    raw.push(cnt ? Math.sqrt(sum / cnt) : 0);
  }
  // RMS global (pondéré par les fenêtres)
  let rmsSum = 0;
  for (const r of raw) rmsSum += r * r;
  const rms = raw.length ? Math.sqrt(rmsSum / raw.length) : 0;

  // Lissage (moyenne glissante 5) puis normalisation par le 95e centile
  const smooth: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    let s = 0, c = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < raw.length) { s += raw[j]; c++; }
    }
    smooth.push(s / Math.max(1, c));
  }
  const sorted = [...smooth].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
  const norm = p95 > 0.001 ? p95 : 1;
  const curve = smooth.map(v => Math.max(0, Math.min(1, v / norm)));
  return { curve, rms };
}

/** Proxy vocal : énergie de la bande 300–3400 Hz (là où vivent les voix)
 *  via un filtre passe-bande numérique 2e ordre, fenêtré comme computeEnergy. */
export function computeVocalCurve(buffer: AudioBuffer, points = 96): number[] {
  try {
    const rate = buffer.sampleRate;
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    const n = buffer.length;
    const hop = Math.max(1, Math.floor(n / points));
    const win = Math.min(hop, 4096);
    // passe-bande RLC (biquad) centré ~1200 Hz, Q ~0.8
    const f0 = 1200, Q = 0.8;
    const w0 = 2 * Math.PI * f0 / rate;
    const alpha = Math.sin(w0) / (2 * Q);
    const cw = Math.cos(w0), a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0;
    const a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
    const raw: number[] = [];
    for (let w = 0; w * hop < n; w++) {
      const start = w * hop;
      const end = Math.min(start + win, n);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, sum = 0, cnt = 0;
      for (let i = start; i < end; i++) {
        const v = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
        const y = b0 * v + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = v; y2 = y1; y1 = y;
        sum += y * y; cnt++;
      }
      raw.push(cnt ? Math.sqrt(sum / cnt) : 0);
    }
    // normalisation au 95e centile (indépendante du loudness du morceau)
    const sorted = [...raw].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
    const norm = p95 > 0.0005 ? p95 : 1;
    return raw.map(v => Math.max(0, Math.min(1, v / norm)));
  } catch { return []; }
}
/** Magnitude Goertzel d'une fréquence sur une fenêtre (chroma rapide). */
function goertzelMag(data: Float32Array, rate: number, freq: number, start: number, len: number): number {
  const k = 2 * Math.PI * freq / rate;
  const coeff = 2 * Math.cos(k);
  let s1 = 0, s2 = 0;
  const end = Math.min(start + len, data.length);
  for (let i = start; i < end; i++) {
    const s0 = data[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2);
  return Math.sqrt(power) / Math.max(1, end - start);
}

/** Chroma (12 classes de hauteur) par Goertzel sur des fenêtres réparties. */
function chromaOf(buffer: AudioBuffer): number[] {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const rate = buffer.sampleRate;
  const mono = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i += 1) {
    mono[i] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
  }
  const chroma = new Array(12).fill(0);
  const WINDOWS = 10;
  const WIN = 8192;
  const from = Math.floor(mono.length * 0.15);
  const to = Math.floor(mono.length * 0.9);
  const stride = Math.max(WIN, Math.floor((to - from) / WINDOWS));
  for (let wStart = from; wStart + WIN < to; wStart += stride) {
    for (let pc = 0; pc < 12; pc++) {
      for (let oct = 0; oct < 4; oct++) { // C3 .. B6
        const midi = 48 + pc + oct * 12; // 48 = C3
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        if (freq > rate / 2.2) continue;
        chroma[pc] += goertzelMag(mono, rate, freq, wStart, WIN);
      }
    }
  }
  return chroma;
}

/** Estime la tonalité (nom + mode) puis la convertit en code Camelot. */
export function estimateCamelot(buffer: AudioBuffer): string | null {
  try {
    const chroma = chromaOf(buffer);
    const total = chroma.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let best: { score: number; tonic: number; minor: boolean } | null = null;
    for (let tonic = 0; tonic < 12; tonic++) {
      let maj = 0, min = 0;
      for (let i = 0; i < 12; i++) {
        const v = chroma[(tonic + i) % 12] / total;
        maj += v * MAJOR_TEMPLATE[i];
        min += v * MINOR_TEMPLATE[i];
      }
      if (!best || maj > best.score) best = { score: maj, tonic, minor: false };
      if (min > best.score) best = { score: min, tonic, minor: true };
    }
    if (!best) return null;
    let name = PITCHES[best.tonic];
    if (!best.minor && PITCHES_FLAT[name]) name = PITCHES_FLAT[name];
    const key = best.minor ? name + 'm' : name;
    return KEY_TO_CAMELOT[key] || null;
  } catch { return null; }
}

/** Arrondit un temps au début de mesure suivant (grille DJ). */
function snapUpToBar(t: number, barLen: number): number {
  if (!barLen || !isFinite(barLen) || barLen <= 0) return t;
  return Math.ceil(t / barLen) * barLen;
}

/** Détecte la structure (intro, outro, meilleurs points de transition). */
function detectStructure(curve: number[], duration: number, barLen: number): TrackStructure {
  const n = curve.length;
  if (!n || duration < 20) {
    return { intro: null, outro: null, bestIn: null, bestOut: null };
  }
  const sorted = [...curve].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)] || 0;
  const tOf = (i: number) => (i / n) * duration;

  // ---- Intro : jusqu'à la première fenêtre soutenue (6 consécutives >= 55 % médiane)
  let introEnd = -1;
  let run = 0;
  for (let i = 0; i < Math.floor(n * 0.4); i++) {
    if (curve[i] >= median * 0.55) {
      if (++run >= 6) { introEnd = i - 5; break; }
    } else run = 0;
  }
  let intro: [number, number] | null = null;
  let bestIn: number | null = null;
  if (introEnd > 0 && tOf(introEnd) >= 3 && tOf(introEnd) <= duration * 0.25) {
    intro = [0, tOf(introEnd)];
    bestIn = snapUpToBar(tOf(introEnd), barLen);
  } else {
    // Pas d'intro claire : entrée à la première zone d'énergie stable
    for (let i = 0; i < n; i++) {
      if (curve[i] >= median * 0.75) { bestIn = snapUpToBar(tOf(i), barLen); break; }
    }
  }
  if (bestIn == null || bestIn > duration * 0.3) bestIn = 0;

  // ---- Outro : dernière fenêtre soutenue (au-delà = queue qui retombe)
  let lastStrong = -1;
  for (let i = n - 1; i >= Math.floor(n * 0.5); i--) {
    if (curve[i] >= median * 0.75) { lastStrong = i; break; }
  }
  let outro: [number, number] | null = null;
  const outroStart = lastStrong >= 0 ? tOf(lastStrong) : duration;
  if (outroStart >= duration * 0.8 && duration - outroStart >= 4) {
    outro = [outroStart, duration];
  }

  // ---- Meilleur point de SORTIE : frontière de mesure où l'énergie retombe,
  //      dans la dernière partie ; priorité aux multiples de 16 mesures.
  let bestOut: number | null = null;
  if (barLen <= 0) {
    // BPM inconnu : pas de grille, on prend la fin de la zone forte
    bestOut = Math.max(bestIn + 8, duration - Math.min(12, duration * 0.08));
  } else {
  const searchFrom = Math.max(duration * 0.55, outro ? outro[0] - 16 * barLen : duration * 0.7);
  const searchTo = Math.max(searchFrom + barLen, duration - 2.5);
  const barsTotal = Math.floor(duration / barLen);
  const barIndexOf = (t: number) => Math.round(t / barLen);
  for (let b = barIndexOf(searchTo); b >= barIndexOf(searchFrom); b--) {
    const t = b * barLen;
    if (t < searchFrom || t > searchTo) continue;
    const before = avgRange(curve, t - 4 * barLen, t, duration);
    const after = avgRange(curve, t, t + 4 * barLen, duration);
    const is16 = b % 16 === 0;
    if (after < before * 0.92 || after < median * 0.6) {
      bestOut = t;
      if (is16) break;      // fin de phrase 16 mesures : le point idéal
      if (bestOut != null && b % 8 === 0) break;
    }
    if (bestOut == null && is16 && t <= searchTo) bestOut = t; // filet de sécurité
  }
  if (bestOut == null) bestOut = snapUpToBar(Math.max(searchFrom, duration - 12), barLen);
  if (bestOut >= duration - 1.5) bestOut = Math.max(0, duration - 1.5);
  if (bestOut <= bestIn + 8) bestOut = Math.min(duration - 2, bestIn + 16 * barLen);
  }

  return { intro, outro, bestIn, bestOut };
}

function avgRange(curve: number[], from: number, to: number, duration: number): number {
  if (to <= from || !curve.length) return 0;
  const i0 = Math.max(0, Math.floor((from / duration) * curve.length));
  const i1 = Math.min(curve.length, Math.ceil((to / duration) * curve.length));
  let s = 0, c = 0;
  for (let i = i0; i < i1; i++) { s += curve[i]; c++; }
  return c ? s / c : 0;
}

/** Énergie moyenne sur la bande médiane 10 %..90 %. */
function medianBandEnergy(curve: number[]): number {
  if (!curve.length) return 0.5;
  const i0 = Math.floor(curve.length * 0.1);
  const i1 = Math.floor(curve.length * 0.9);
  let s = 0, c = 0;
  for (let i = i0; i < i1; i++) { s += curve[i]; c++; }
  return c ? s / c : 0.5;
}

/**
 * Analyse complète d'une piste décodée.
 * @param track métadonnées (BPM / Camelot de la plateforme prioritaires)
 * @param buffer AudioBuffer décodé (deck)
 */
export function analyzeTrack(track: Track, buffer: AudioBuffer): TrackAnalysis {
  const duration = buffer.duration;
  const { curve, rms } = computeEnergy(buffer);
  const vocalCurve = computeVocalCurve(buffer, 96);
  const bpm = (track.bpm && track.bpm > 40 && track.bpm < 220)
    ? track.bpm
    : (detectBpm(buffer) ?? track.bpm ?? null);
  const camelot = track.camelot && /^[0-9]{1,2}[AB]$/.test(track.camelot)
    ? track.camelot
    : estimateCamelot(buffer);
  const barLen = bpm ? (60 / bpm) * 4 : 0;
  const structure = detectStructure(curve, duration, barLen);
  // Normalisation : RMS cible 0.20 (mix homogène), gain bridé 0.7..1.4
  const trim = Math.max(0.7, Math.min(1.4, rms > 0.001 ? 0.20 / rms : 1));
  return {
    track, duration, bpm, camelot,
    energy: medianBandEnergy(curve),
    energyCurve: curve, vocalCurve, rms, trim,
    structure, barLen
  };
}
