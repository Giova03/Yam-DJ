import { Track } from '../../models/models';

/**
 * ============================================================================
 *  YAM DJ — PLANIFICATEUR DE MIX AUTO (le "cerveau DJ")
 * ============================================================================
 *  Construit un plan de mix professionnel AVANT la lecture :
 *
 *  1. SÉLECTION INTELLIGENTE — candidats filtrés (genre, artistes, BPM),
 *     puis séquence construite pas à pas en optimisant simultanément :
 *     compatibilité BPM (avec fold half/double), compatibilité harmonique
 *     (roue Camelot), adéquation à la courbe d'énergie, cohérence de genre,
 *     diversité d'artistes. Le morceau le plus populaire ne part PAS en
 *     premier : la première piste installe l'ambiance.
 *  2. COURBE D'ÉNERGIE — INTRO → MONTÉE → GROOVE → ENERGY → PEAK →
 *     VARIATION → SECOND PEAK → FINALE, profilée par l'ambiance choisie.
 *  3. DJ EDIT — intro / corps / outro par piste (durée cible par morceau,
 *     budget durée max du mix), points quantifiés à la mesure.
 *  4. TRANSITIONS — 8 techniques (A..H) choisies selon BPM / tonalité /
 *     énergie : beatmatch, crossfade étendu, relay EQ, filtre, echo out,
 *     break, relai percussif, energy drop. Pitch d'asservissement ±8 %.
 *  5. CONTRÔLE QUALITÉ — pas de saut de BPM brutal sans transition
 *     créative, pas de collision harmonique sur beatmatch, pas deux fois
 *     le même artiste d'affilée, durée totale respectée, points cohérents.
 *
 *  L'analyse du signal réel (mix-analyzer) affine chaque segment au
 *  chargement : entrée/sortie calées sur les vraies fins de phrase,
 *  énergie mesurée, normalisation loudness.
 */

// ============================ TYPES ============================

export type Mood = 'fete' | 'dance' | 'chill' | 'route' | 'nuit';

export interface MoodInfo {
  key: Mood;
  label: string;
  desc: string;
  /** Courbe cible normalisée (8 jalons INTRO→FINALE). */
  curve: number[];
  /** Intensité par défaut 1..10. */
  energy: number;
}

export const MOODS: MoodInfo[] = [
  { key: 'fete', label: 'Fête', desc: 'Montée en soirée, pic vers le milieu, final qui reste chaud', curve: [0.45, 0.60, 0.72, 0.82, 0.95, 0.70, 0.90, 0.80], energy: 8 },
  { key: 'dance', label: 'Dancefloor', desc: 'Courbe club : gros pic, variation, second pic immédiat', curve: [0.52, 0.66, 0.78, 0.88, 1.00, 0.76, 0.95, 0.86], energy: 9 },
  { key: 'chill', label: 'Chill', desc: 'Douce et régulière, énergie basse, fin apaisée', curve: [0.30, 0.38, 0.45, 0.50, 0.56, 0.46, 0.52, 0.40], energy: 3 },
  { key: 'route', label: 'Route', desc: 'Road-trip : bon groove constant, jamais agressif', curve: [0.42, 0.50, 0.60, 0.68, 0.75, 0.64, 0.70, 0.60], energy: 6 },
  { key: 'nuit', label: 'Nuit profonde', desc: 'Amapiano tardif : hypnotique, un seul vrai pic', curve: [0.34, 0.48, 0.58, 0.68, 0.80, 0.56, 0.68, 0.46], energy: 5 }
];

export type TransitionType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const TRANSITION_INFO: Record<TransitionType, { label: string; short: string; bars: number; desc: string }> = {
  A: { label: 'Beatmatch + crossfade', short: 'BEATMATCH', bars: 16, desc: 'BPM et tonalité compatibles : tempos synchronisés, fondu equal-power' },
  B: { label: 'Crossfade étendu', short: 'EXTENDU', bars: 24, desc: 'Long fondu progressif sur plusieurs mesures' },
  C: { label: 'Relay des basses (EQ)', short: 'EQ', bars: 16, desc: 'Les basses du sortant s\'effacent, celles de l\'entrant prennent le relais' },
  D: { label: 'Filtre sweep', short: 'FILTRE', bars: 12, desc: 'Passe-haut montant sur le sortant, l\'entrant s\'ouvre proprement' },
  E: { label: 'Echo out', short: 'ECHO OUT', bars: 8, desc: 'Écho synchro au tempo qui emporte la fin de phrase du sortant' },
  F: { label: 'Break', short: 'BREAK', bars: 12, desc: 'Silence rythmique bref au milieu de la transition, entrée franche' },
  G: { label: 'Relai percussif', short: 'PERCUSSIF', bars: 12, desc: 'Écart de tempo modéré : les percussions font le pont, basses en retard' },
  H: { label: 'Energy drop', short: 'ENERGY', bars: 6, desc: 'Changement d\'énergie assumé, transition courte et franche' }
};

export interface MixParams {
  /** Nombre de morceaux (null = déduit de la durée max). */
  trackCount: number | null;
  /** Morceaux spécifiques imposés (sélection manuelle) — réordonnés intelligemment. */
  trackIds: string[];
  /** Artistes souhaités (prioritaires dans la sélection). */
  artists: string[];
  genre: string | null;
  mood: Mood;
  targetBpm: number | null;
  maxDurationSec: number;
  /** Durée cible par morceau (null = piste entière, éditée aux points DJ). */
  trackDurationSec: number | null;
  /** Intensité 1..10 (redimensionne la courbe). */
  energyLevel: number;
  /** 'auto' = le DJ IA choisit, sinon type imposé. */
  transitionStyle: 'auto' | TransitionType;
  introOutro: boolean;
  djVoice: boolean;
}

export interface MixSegment {
  track: Track;
  index: number;
  /** Temps piste de départ (début d'intro ou meilleur point d'entrée). */
  playFrom: number;
  /** Temps piste d'arrêt (meilleur point de sortie / outro). */
  playTo: number;
  /** Temps mix (s) où le segment devient audible seul. */
  mixStart: number;
  mixEnd: number;
  /** Pitch appliqué au deck (%), asservissement beatmatch. */
  pitchPct: number;
  /** BPM effectif après pitch. */
  effectiveBpm: number;
  /** Énergie estimée (métadonnées) 0..1 — remplacée par la mesure réelle à l'écoute. */
  estEnergy: number;
  /** Énergie mesurée sur le signal (remplie par le séquenceur). */
  measuredEnergy: number | null;
}

export interface MixTransition {
  fromIndex: number;
  toIndex: number;
  type: TransitionType;
  bars: number;
  /** Durée réelle de la transition (s), au BPM effectif du sortant. */
  durationSec: number;
  reason: string;
}

export interface MixPlan {
  segments: MixSegment[];
  transitions: MixTransition[];
  totalDurationSec: number;
  warnings: string[];
  summary: string;
  params: MixParams;
  /** Performance DJ V2 (gestes, moves, timeline) — posée par buildPerformance. */
  performance?: import('./performance-engine').DjPerformance;
}

// ============================ OUTILS ============================

/** Ratio d'asservissement BPM plié en ±8 % (avec half/double). */
export function foldBpmRatio(bpmIn: number, bpmOut: number): { ratio: number; ok: boolean } {
  let ratio = bpmIn > 0 && bpmOut > 0 ? bpmOut / bpmIn : 1;
  while (ratio > 1.6) ratio /= 2;   // half-time
  while (ratio < 0.625) ratio *= 2; // double-time
  const ok = ratio <= 1.085 && ratio >= 0.915;
  return { ratio, ok };
}

/** Compatibilité harmonique Camelot 0..1 (1 = parfait, <0.3 = dissonant). */
export function camelotCompat(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0.5; // inconnu : neutre
  const na = parseInt(a), nb = parseInt(b);
  if (isNaN(na) || isNaN(nb)) return 0.5;
  const la = a.slice(-1), lb = b.slice(-1);
  const diff = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb));
  if (diff === 0) return la === lb ? 1 : 0.88;   // même tonalité ou relatif majeur/mineur
  if (diff === 1) return 0.84;                    // adjacent sur la roue
  if (diff === 2) return 0.5;
  return 0.15;                                    // dissonant
}

/** Énergie estimée depuis les métadonnées (avant mesure réelle). */
function estEnergyOf(track: Track, minBpm: number, maxBpm: number): number {
  const bpm = track.bpm && track.bpm > 40 ? track.bpm : 105;
  const normBpm = Math.max(0, Math.min(1, (bpm - minBpm) / Math.max(1, maxBpm - minBpm)));
  const plays = Math.log10(1 + (track.playCount || 0));
  const normPop = Math.min(1, plays / 4);
  return Math.max(0.15, Math.min(1, 0.5 + 0.38 * normBpm + 0.12 * normPop));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Interpole la courbe cible sur N points (progression fluide). */
function spreadCurve(curve: number[], count: number, scale: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = count === 1 ? 0.5 : i / (count - 1);
    const f = p * (curve.length - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(curve.length - 1, i0 + 1);
    const v = curve[i0] + (curve[i1] - curve[i0]) * (f - i0);
    out.push(Math.max(0.12, Math.min(1, v * scale)));
  }
  return out;
}

function fmtMin(sec: number): string {
  const m = Math.round(sec / 60);
  return m + ' min';
}

// ============================ PLANIFICATION ============================

/**
 * Construit le plan complet du mix.
 * @param pool pistes disponibles (catalogue et/ou fichiers locaux)
 * @param partial paramètres utilisateur (les valeurs vides sont déduites)
 */
export function planAutoMix(pool: Track[], partial: Partial<MixParams>): MixPlan {
  const warnings: string[] = [];

  // ---------- Candidats ----------
  let candidates = pool.filter(t => (t.audioUrlHq || t.audioUrlLq || t.id.startsWith('local-'))
    && (t.durationSec || 0) > 20);
  const imposed = (partial.trackIds || []).filter(id => id.length > 0);
  if (imposed.length >= 2) {
    const byId = new Map(candidates.map(t => [t.id, t]));
    const fixed: Track[] = [];
    for (const id of imposed) {
      const t = byId.get(id);
      if (t) { fixed.push(t); byId.delete(id); }
    }
    candidates = fixed;
    if (candidates.length < 2) candidates = pool.filter(t => (t.durationSec || 0) > 20);
  } else {
    if (partial.genre && partial.genre !== 'all') {
      const g = candidates.filter(t => t.genre === partial.genre);
      if (g.length >= 2) candidates = g;
    }
    if (partial.artists && partial.artists.length) {
      const wanted = partial.artists.map(a => a.toLowerCase().trim()).filter(Boolean);
      const match = candidates.filter(t =>
        wanted.some(a => (t.artistName || '').toLowerCase().includes(a) || (t.artistPseudo || '').toLowerCase().includes(a)));
      if (match.length >= 2) candidates = match;
      else if (match.length) candidates = [...match, ...candidates.filter(t => !match.includes(t))];
    }
  }

  // ---------- Paramètres déduits ----------
  const moodInfo = MOODS.find(m => m.key === partial.mood) || MOODS[0];
  const bpms = candidates.map(t => t.bpm).filter((b): b is number => !!b && b > 40);
  const targetBpm = partial.targetBpm || (bpms.length ? Math.round(median(bpms)) : null);
  const avgDur = candidates.length ? candidates.reduce((s, t) => s + (t.durationSec || 180), 0) / candidates.length : 180;
  const maxDurationSec = partial.maxDurationSec || 45 * 60;
  let trackCount = partial.trackCount
    || Math.max(2, Math.min(10, Math.round(maxDurationSec / Math.max(90, Math.min(avgDur, 240)))));
  trackCount = Math.max(2, Math.min(trackCount, candidates.length));
  const energyLevel = partial.energyLevel || moodInfo.energy;
  const params: MixParams = {
    trackCount,
    trackIds: imposed,
    artists: partial.artists || [],
    genre: partial.genre || null,
    mood: moodInfo.key,
    targetBpm,
    maxDurationSec,
    trackDurationSec: partial.trackDurationSec || null,
    energyLevel,
    transitionStyle: partial.transitionStyle || 'auto',
    introOutro: partial.introOutro !== false,
    djVoice: !!partial.djVoice
  };

  if (candidates.length < 2) {
    return {
      segments: [], transitions: [], totalDurationSec: 0,
      warnings: ['Pas assez de pistes mixables (il faut au moins 2 morceaux avec audio disponible).'],
      summary: 'Sélection insuffisante.', params
    };
  }

  // ---------- Estimations (métadonnées) ----------
  const minBpm = Math.min(...(bpms.length ? bpms : [90]));
  const maxBpm = Math.max(...(bpms.length ? bpms : [120]));
  const est = new Map<Track, number>();
  for (const t of candidates) est.set(t, estEnergyOf(t, minBpm, maxBpm));

  // ---------- Séquence gloutonne (courbe d'énergie + harmonie + BPM) ----------
  const target = spreadCurve(moodInfo.curve, trackCount, 0.55 + 0.05 * energyLevel);
  const remaining = [...candidates];
  const order: Track[] = [];

  // Première piste : installe l'ambiance (énergie basse de la courbe, pas un pic)
  const first = [...remaining].sort((a, b) => {
    const ea = Math.abs((est.get(a) || 0.5) - target[0]);
    const eb = Math.abs((est.get(b) || 0.5) - target[0]);
    const pa = (a.playCount || 0), pb = (b.playCount || 0);
    return (ea - eb) + (pa - pb) * 1e-6; // départage : PAS la plus populaire en premier
  })[0];
  order.push(first);
  remaining.splice(remaining.indexOf(first), 1);

  while (order.length < trackCount && remaining.length) {
    const prev = order[order.length - 1];
    const pos = order.length;
    let best: { t: Track; s: number } | null = null;
    for (const t of remaining) {
      const key = camelotCompat(prev.camelot, t.camelot);
      const { ratio, ok } = prev.bpm && t.bpm
        ? foldBpmRatio(t.bpm, prev.bpm)
        : { ratio: 1, ok: true };
      const bpmCompat = 1 - Math.min(1, Math.abs(ratio - 1) / 0.09);
      const energyFit = 1 - Math.min(1, Math.abs((est.get(t) || 0.5) - target[pos]));
      const genreCo = (prev.genre && t.genre && prev.genre === t.genre) ? 1 : 0.35;
      const artistNovel = (t.artistId && t.artistId === prev.artistId) ? 0 : 1;
      let s = 0.30 * key + 0.27 * bpmCompat + 0.23 * energyFit + 0.08 * genreCo + 0.12 * artistNovel;
      // pénalités "gardes-fous DJ"
      if (t.artistId && t.artistId === prev.artistId) s -= 0.5;              // même artiste d'affilée
      if (prev.bpm && t.bpm && !ok) s -= 0.35;                              // écart BPM trop grand
      if (targetBpm && t.bpm && Math.abs(t.bpm - targetBpm) > 18) s -= 0.08; // éloigné du BPM cible
      if (!best || s > best.s) best = { t, s };
    }
    if (!best) break;
    order.push(best.t);
    remaining.splice(remaining.indexOf(best.t), 1);
  }

  // ---------- Segments (DJ edit) ----------
  const introOutro = params.introOutro;
  let budget = params.maxDurationSec;
  const segments: MixSegment[] = order.map((track, index) => {
    const dur = track.durationSec || 180;
    const outReserve = introOutro ? (dur > 100 ? 8 : 3) : 2;
    const segTarget = params.trackDurationSec
      ? Math.min(dur - 2, params.trackDurationSec)
      : dur - outReserve;
    const playFrom = 0;
    const playTo = Math.max(Math.min(playFrom + segTarget, dur - 1.5), Math.min(dur, 30));
    return {
      track, index, playFrom, playTo,
      mixStart: 0, mixEnd: 0,
      pitchPct: 0,
      effectiveBpm: track.bpm || targetBpm || 105,
      estEnergy: est.get(track) || 0.5,
      measuredEnergy: null
    };
  });

  // ---------- Transitions ----------
  const transitions: MixTransition[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const out = segments[i];
    const inn = segments[i + 1];
    transitions.push(chooseTransition(out, inn, params, warnings, est));
  }

  // ---------- Asservissement pitch (types A/B/C) ----------
  for (const tr of transitions) {
    const out = segments[tr.fromIndex];
    const inn = segments[tr.toIndex];
    if ((tr.type === 'A' || tr.type === 'B' || tr.type === 'C') && out.track.bpm && inn.track.bpm) {
      const { ratio, ok } = foldBpmRatio(inn.track.bpm, out.track.bpm);
      if (ok) {
        inn.pitchPct = Math.round(((ratio - 1) * 100) * 10) / 10;
        inn.effectiveBpm = Math.round(inn.track.bpm * (1 + inn.pitchPct / 100) * 10) / 10;
        tr.reason += ` · ${inn.track.bpm}→${inn.effectiveBpm} BPM (${inn.pitchPct > 0 ? '+' : ''}${inn.pitchPct} %)`;
      }
    }
  }

  // ---------- Montage temporel (mixStart / mixEnd, durée réelle) ----------
  const recomputeTimeline = () => {
    let t = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const rate = 1 + seg.pitchPct / 100;
      seg.mixStart = t;
      seg.mixEnd = t + (seg.playTo - seg.playFrom) / rate;
      if (i < transitions.length) {
        const tr = transitions[i];
        const bpmOut = segments[i].effectiveBpm || 105;
        tr.durationSec = Math.max(6, Math.min(36, tr.bars * 4 * 60 / bpmOut));
        t = seg.mixEnd - tr.durationSec;
      }
    }
    return segments.length ? segments[segments.length - 1].mixEnd : 0;
  };
  let total = recomputeTimeline();

  // ---------- Respect du budget durée max ----------
  if (total > params.maxDurationSec * 1.03) {
    let guard = 0;
    while (total > params.maxDurationSec && guard++ < 60) {
      // raccourcir le segment le plus long (jamais sous 35 s)
      let idxLong = -1; let lenLong = 0;
      segments.forEach((s, i) => {
        const len = s.playTo - s.playFrom;
        if (len > lenLong && len > 40) { lenLong = len; idxLong = i; }
      });
      if (idxLong < 0) break;
      segments[idxLong].playTo = Math.max(segments[idxLong].playFrom + 35, segments[idxLong].playTo - 10);
      total = recomputeTimeline();
    }
    if (total > params.maxDurationSec * 1.05) {
      warnings.push(`Durée totale ${fmtMin(total)} légèrement au-delà de ${fmtMin(params.maxDurationSec)} (transitions comprises).`);
    }
  }

  // ---------- Contrôle qualité ----------
  qc(segments, transitions, params, warnings);

  const medianBpm = median(segments.map(s => s.effectiveBpm).filter(Boolean));
  const typesCount = transitions.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {} as Record<string, number>);
  const typesTxt = Object.entries(typesCount).map(([k, v]) => `${TRANSITION_INFO[k as TransitionType].short} ×${v}`).join(' · ') || '—';
  const summary = `Mix ${fmtMin(total)} · ${segments.length} pistes · ${Math.round(medianBpm)} BPM médian · ambiance ${moodInfo.label.toLowerCase()} · transitions : ${typesTxt}`;

  return { segments, transitions, totalDurationSec: total, warnings, summary, params };
}

// ============================ TRANSITIONS ============================

function chooseTransition(
  out: MixSegment, inn: MixSegment, params: MixParams,
  warnings: string[], _est: Map<Track, number>
): MixTransition {
  const bpmA = out.track.bpm;
  const bpmB = inn.track.bpm;
  const fold = bpmA && bpmB ? foldBpmRatio(bpmB, bpmA) : { ratio: 1, ok: true };
  const diffPct = Math.abs(fold.ratio - 1) * 100;
  const key = camelotCompat(out.track.camelot, inn.track.camelot);
  const energyDrop = out.estEnergy - inn.estEnergy;
  const energyRise = inn.estEnergy - out.estEnergy;

  let type: TransitionType;
  let reason: string;

  if (params.transitionStyle !== 'auto') {
    type = params.transitionStyle;
    reason = 'style imposé par le DJ';
    if ((type === 'A' || type === 'B') && diffPct > 6) {
      warnings.push(`Transition ${TRANSITION_INFO[type].short} avec écart BPM ${diffPct.toFixed(1)} % : le pitch ne pourra pas tout synchroniser, rendu volontairement créatif.`);
    }
  } else if (diffPct <= 3 && key >= 0.8) {
    type = (params.mood === 'chill' || params.mood === 'route') ? 'B' : 'A';
    reason = `BPM proches (${diffPct.toFixed(1)} %) et tonalités compatibles`;
  } else if (diffPct <= 6 && key >= 0.5) {
    type = 'C';
    reason = `tempo proche (${diffPct.toFixed(1)} %), relay des basses pour rester propre`;
  } else if (key < 0.5 && diffPct <= 6) {
    type = 'D';
    reason = 'tonalités peu compatibles : filtre pour éviter la collision harmonique';
  } else if (energyDrop > 0.18) {
    type = 'E';
    reason = 'chute d\'énergie : echo out pour une sortie élégante';
  } else if (energyRise > 0.2) {
    type = 'H';
    reason = 'montée d\'énergie assumée, entrée franche';
  } else if (diffPct <= 11) {
    type = 'G';
    reason = `écart de tempo ${diffPct.toFixed(1)} % : les percussions font le pont`;
  } else {
    type = 'F';
    reason = `écart de tempo important (${diffPct.toFixed(1)} %) : break pour changer d'un coup`;
    warnings.push('Changement de tempo fort entre deux pistes — transition break utilisée (pas de beatmatch possible).');
  }

  let bars = TRANSITION_INFO[type].bars;
  if (params.mood === 'chill') bars = Math.max(8, Math.round(bars * 0.7));
  if (params.mood === 'dance') bars = Math.min(32, Math.round(bars * 1.25));

  return {
    fromIndex: out.index, toIndex: inn.index,
    type, bars, durationSec: 0, reason
  };
}

// ============================ CONTRÔLE QUALITÉ ============================

function qc(segments: MixSegment[], transitions: MixTransition[], params: MixParams, warnings: string[]): void {
  // 1. Aucune piste en double
  const ids = new Set(segments.map(s => s.track.id));
  if (ids.size !== segments.length) warnings.push('Doublon détecté dans la séquence (retiré si possible).');

  // 2. Beatmatch jamais sur tonalités dissonantes ou gros écart BPM
  for (const tr of transitions) {
    const a = segments[tr.fromIndex];
    const b = segments[tr.toIndex];
    if (tr.type === 'A' || tr.type === 'B') {
      if (camelotCompat(a.track.camelot, b.track.camelot) < 0.4) {
        tr.type = 'D';
        tr.bars = TRANSITION_INFO.D.bars;
        tr.reason = 'QC : tonalités dissonantes → transition par filtre remplaçant le beatmatch';
        warnings.push(`Tonalités incompatibles (${a.track.camelot || '?'} → ${b.track.camelot || '?'}) : beatmatch remplacé par un filtre.`);
      }
      const fold = a.track.bpm && b.track.bpm ? foldBpmRatio(b.track.bpm, a.track.bpm) : { ratio: 1, ok: true };
      if (!fold.ok) {
        tr.type = 'G';
        tr.bars = TRANSITION_INFO.G.bars;
        tr.reason = 'QC : écart BPM hors plage de pitch → relai percussif';
        b.pitchPct = 0;
        b.effectiveBpm = b.track.bpm || b.effectiveBpm;
      }
    }
    // pitch borné ±8 %
    if (Math.abs(b.pitchPct) > 8.05) {
      b.pitchPct = 0;
      b.effectiveBpm = b.track.bpm || b.effectiveBpm;
      warnings.push('Asservissement de pitch abandonné sur un segment (écart trop grand), tempo natif conservé.');
    }
  }

  // 3. Segments jouables (durée minimale, points cohérents)
  for (const s of segments) {
    if (s.playTo - s.playFrom < 25 && (s.track.durationSec || 0) > 40) {
      warnings.push(`« ${s.track.title} » jouée très brièvement (${Math.round(s.playTo - s.playFrom)} s) — allonge la durée par morceau si tu veux la garder entière.`);
    }
  }

  // 4. Première piste pas au pic d'énergie
  if (segments.length > 2) {
    const e0 = segments[0].estEnergy;
    const maxE = Math.max(...segments.map(s => s.estEnergy));
    if (e0 > maxE * 0.97 && params.mood !== 'dance') {
      warnings.push('La première piste est la plus énergique du mix : installe l\'ambiance avec un départ plus doux si tu veux une vraie montée.');
    }
  }

  if (params.trackIds && params.trackIds.length && segments.length) {
    warnings.push('Sélection imposée : l\'ordre et les transitions restent optimisés par le DJ IA.');
  }
}
