/**
 * ============================================================================
 *  YAM DJ — DJ PERFORMANCE ENGINE (le DJ qui DÉCIDE comme un humain)
 * ============================================================================
 *
 *  Couche de PERFORMANCE posée sur le moteur de sélection/mix existant
 *  (auto-mix-planner fournit la sélection, l'ordre, le beatmatch, la courbe
 *  d'énergie ; ce moteur choisit COMMENT jouer la transition).
 *
 *  Pipeline :
 *    1. ÉVÉNEMENTS MUSICAUX par piste (PHRASE_END, VOCAL_END, DROP_INCOMING,
 *       BREAK, ENERGY_RISE/DROP, OUTRO...) — depuis l'analyse réelle du
 *       signal (courbes d'énergie + proxy vocal) quand elle est disponible ;
 *    2. SCORE DE TRANSITION pour chaque couple A→B :
 *       BPM / phrase / harmonique / énergie / vocal / structure / drop /
 *       opportunité / adéquation FX ;
 *    3. SÉLECTION DU MOVE parmi la DJ_MOVE_LIBRARY : style d'audace,
 *       personnalité virtuelle, variation (pénalité de répétition), position
 *       dans le mix, RNG déterministe (2 générations ≠ même mix) ;
 *    4. TIMELINE DE PERFORMANCE : chaque geste positionné en TEMPS MUSICAL
 *       (beats / mesures depuis le « 1 » de coupe) — converti en secondes
 *       par le player au moment de l'exécution (grille réelle du deck) ;
 *    5. CONTRÔLE QUALITÉ : transitions sur phrases, pas de collision de
 *       basses ni de voix, variation suffisante, effets non surutilisés,
 *       drops préparés — sinon la stratégie est REJETÉE et regénérée.
 *
 *  Règle fondamentale : MUSIC → PHRASE → ENERGY → STRUCTURE → DJ MOVE → FX.
 *  Jamais l'inverse : on ne cherche pas où mettre un effet, on cherche ce
 *  que la musique demande, puis on choisit le geste qui y répond.
 */

import { MixPlan, MixSegment, MixTransition } from './auto-mix-planner';
import { TrackAnalysis } from './mix-analyzer';
import {
  DjMove, DjStyle, DjPersonality, DJ_MOVE_LIBRARY, MOVE_BY_ID,
  seededRandom, PERSONALITY_BLEND_FACTOR
} from './dj-moves';

// ============================ TYPES ============================

/** Types d'événements musicaux exploitables par le DJ. */
export type MusicalEventType =
  | 'PHRASE_END' | 'PHRASE_START' | 'VOCAL_END' | 'VOCAL_START'
  | 'DROP_INCOMING' | 'DROP_OUTGOING' | 'BREAK' | 'BUILD_UP'
  | 'ENERGY_RISE' | 'ENERGY_DROP' | 'DRUM_SECTION' | 'INSTRUMENTAL_SECTION'
  | 'OUTRO' | 'BASS_CHANGE' | 'SILENCE';

export interface MusicalEvent {
  type: MusicalEventType;
  /** Position en secondes (temps piste). */
  time: number;
  /** Force de l'événement 0..1. */
  strength: number;
}

/** Contexte de performance d'une piste du plan. */
export interface PerformanceTrackContext {
  events: MusicalEvent[];
  /** Ancrage de la grille (temps piste) — le « 1 » de référence. */
  gridAnchor: number;
  barLen: number;
  beatLen: number;
  energy: number;
}

/** Le move choisi pour une transition, avec ses paramètres effectifs. */
export interface PlannedMove {
  moveId: string;
  name: string;
  /** Transition du plan concernée (index = fromIndex). */
  fromIndex: number;
  /** Durée réelle en mesures (après adaptation style/personnalité/énergie). */
  bars: number;
  /** Durée en secondes au BPM effectif du sortant. */
  durationSec: number;
  /** Geste détaillé, positions en beats RELATIFS au point de coupe (négatif = avant). */
  steps: { atBeats: number; action: string; target: 'out' | 'in' | 'master'; params: Record<string, number>; label: string }[];
  /** Score de décision (pour l'UI et le QC). */
  score: number;
  /** Pourquoi ce move a été choisi (affiché, pédagogie DJ). */
  reason: string;
  /** Facteurs de compatibilité calculés (transparence de la décision). */
  factors: TransitionFactors;
}

export interface TransitionFactors {
  bpm: number;        // 0..1
  phrase: number;     // 0..1
  harmonic: number;   // 0..1
  energy: number;     // 0..1
  vocal: number;      // 0..1 (1 = aucun risque de collision)
  structure: number;  // 0..1
  dropProximity: number; // 0..1
  opportunity: number;   // 0..1
  fxSuitability: number; // 0..1
  total: number;
}

/** Ligne de la timeline de performance (un geste du DJ). */
export interface PerformanceAction {
  /** Index de la transition. */
  transitionIndex: number;
  atBeats: number;
  action: string;
  target: 'out' | 'in' | 'master';
  params: Record<string, number>;
  label: string;
}

/** Rapport de contrôle qualité. */
export interface QcReport {
  passed: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  warnings: string[];
}

/** La performance complète (attachée au MixPlan). */
export interface DjPerformance {
  style: DjStyle;
  personality: DjPersonality;
  /** Signature lisible (« DJ technique · club · mix Vol. 3 »). */
  signature: string;
  moves: PlannedMove[];
  timeline: PerformanceAction[];
  qc: QcReport;
  /** Statistiques (UI). */
  stats: { totalActions: number; distinctMoves: number; fxDensity: number; seed: number };
}

export interface PerformanceOptions {
  style: DjStyle;
  personality: DjPersonality;
  /** Analyses réelles disponibles (clé = index de segment). */
  analyses?: Map<number, TrackAnalysis>;
  /** Graine (null = aléatoire à chaque génération). */
  seed?: number;
}

// ============================ ÉVÉNEMENTS ============================

/** Extrait les événements musicaux d'une piste à partir de son analyse. */
export function extractEvents(analysis: TrackAnalysis | null, seg: MixSegment): MusicalEvent[] {
  const events: MusicalEvent[] = [];
  const duration = analysis?.duration || seg.track.durationSec || 0;
  if (!duration) return events;

  const bpm = analysis?.bpm || seg.effectiveBpm || seg.track.bpm || 105;
  const beat = 60 / bpm;
  const barLen = beat * 4;
  const curve = analysis?.energyCurve;
  const vocal = analysis?.vocalCurve;
  const anchor = analysis?.structure.bestIn ?? seg.playFrom;

  const energyAt = (t: number): number => {
    if (!curve || !curve.length) return seg.estEnergy;
    const i = Math.max(0, Math.min(curve.length - 1, Math.round((t / duration) * curve.length)));
    return curve[i];
  };
  const vocalAt = (t: number): number => {
    if (!vocal || !vocal.length) return 0.5;
    const i = Math.max(0, Math.min(vocal.length - 1, Math.round((t / duration) * vocal.length)));
    return vocal[i];
  };

  // ---- PHRASE_END / PHRASE_START : la grille 8/16/32 mesures depuis l'ancrage
  const barsTotal = Math.floor((duration - anchor) / barLen);
  for (let b = 4; b <= barsTotal; b += 4) {
    const t = anchor + b * barLen;
    const isPhrase = b % 8 === 0;
    const isBig = b % 16 === 0;
    if (isPhrase) {
      events.push({ type: 'PHRASE_END', time: t, strength: isBig ? 1 : 0.6 });
      events.push({ type: 'PHRASE_START', time: t, strength: isBig ? 1 : 0.6 });
    }
  }

  if (curve && curve.length > 8) {
    // ---- Énergie avant/après sur fenêtres de 2 mesures
    const win = Math.max(1, Math.round((2 * barLen / duration) * curve.length));
    for (let i = win; i < curve.length - win; i += Math.max(1, Math.round(win / 2))) {
      const t = (i / curve.length) * duration;
      let before = 0, after = 0;
      for (let k = i - win; k < i; k++) before += curve[k];
      for (let k = i; k < i + win; k++) after += curve[k];
      before /= win; after /= win;
      const slope = after - before;
      if (slope > 0.13) events.push({ type: 'ENERGY_RISE', time: t, strength: Math.min(1, slope * 4) });
      else if (slope < -0.13) events.push({ type: 'ENERGY_DROP', time: t, strength: Math.min(1, -slope * 4) });
      // BUILD_UP : montée soutenue
      if (slope > 0.20) events.push({ type: 'BUILD_UP', time: t, strength: Math.min(1, slope * 3) });
      // DROP_INCOMING : montée juste avant un plateau haut (= le drop arrive)
      if (slope > 0.16 && after > 0.62) events.push({ type: 'DROP_INCOMING', time: t, strength: Math.min(1, slope * 3.5) });
      // BREAK : zone calme nette
      if (before > 0.45 && after < 0.30 && after < before * 0.65) {
        events.push({ type: 'BREAK', time: t, strength: Math.min(1, (before - after) * 2.5) });
      }
      // DRUM / INSTRUMENTAL : fort mais sans voix
      if (vocal && vocal.length) {
        const v = vocalAt(t);
        if (after > 0.5 && v < 0.30) events.push({ type: 'INSTRUMENTAL_SECTION', time: t, strength: 0.7 });
        if (after > 0.55 && v < 0.22) events.push({ type: 'DRUM_SECTION', time: t, strength: 0.8 });
      }
    }
  }

  // ---- VOCAL_START / VOCAL_END : frontières du proxy vocal (fenêtres 1 mesure)
  if (vocal && vocal.length > 10) {
    const threshold = 0.42;
    let prevActive = vocalAt(anchor) > threshold;
    const stepSec = (duration / vocal.length) * 4;
    for (let t = anchor; t < duration - stepSec; t += stepSec) {
      const active = vocalAt(t) > threshold;
      if (active && !prevActive) events.push({ type: 'VOCAL_START', time: t, strength: 0.6 });
      if (!active && prevActive) {
        // fin de section vocale : force selon l'énergie de la voix avant
        const strength = Math.min(1, vocalAt(t - stepSec) * 1.8);
        events.push({ type: 'VOCAL_END', time: t, strength });
      }
      prevActive = active;
    }
  }

  // ---- OUTRO
  if (analysis?.structure.outro) {
    events.push({ type: 'OUTRO', time: analysis.structure.outro[0], strength: 0.8 });
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}

// ============================ FACTEURS DE COMPATIBILITÉ ============================

function camelotDistance(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 6; // inconnu → neutre-défavorable
  const pa = /^(\d{1,2})([AB])$/.exec(a);
  const pb = /^(\d{1,2})([AB])$/.exec(b);
  if (!pa || !pb) return 6;
  const na = parseInt(pa[1], 10), nb = parseInt(pb[1], 10);
  const sameMode = pa[2] === pb[2];
  const ring = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb));
  if (sameMode) {
    if (ring === 0) return 0;
    if (ring === 1) return 1;
    if (ring === 2) return 3;
    return 5;
  }
  // mode opposé : +1 (relative) compatible
  if (ring === 1) return 2;
  return 6;
}

/** Calcule les facteurs de compatibilité d'une transition A→B. */
function computeFactors(
  outCtx: PerformanceTrackContext, inCtx: PerformanceTrackContext,
  outSeg: MixSegment, inSeg: MixSegment, trans: MixTransition
): TransitionFactors {
  // BPM (fold half/double déjà appliqué par le planner via pitch)
  const bpmDiff = Math.abs(outSeg.effectiveBpm - inSeg.effectiveBpm);
  const bpm = Math.max(0, 1 - bpmDiff / 12);

  // Harmonique
  const dist = camelotDistance(outSeg.track.camelot, inSeg.track.camelot);
  const harmonic = Math.max(0, 1 - dist / 7);

  // Énergie (delta assumé ok si move prévu pour)
  const eOut = outCtx.energy, eIn = inCtx.energy;
  const dE = Math.abs(eIn - eOut);
  const energy = Math.max(0, 1 - dE / 0.55);

  // Phrase : le point de sortie est-il sur la grille 8/16 ?
  const playTo = outSeg.playTo;
  const barsFromAnchor = (playTo - outCtx.gridAnchor) / outCtx.barLen;
  const onGrid = Math.abs(barsFromAnchor - Math.round(barsFromAnchor)) < 0.05;
  const mod8 = Math.abs((Math.round(barsFromAnchor) % 8));
  const phrase = onGrid ? (mod8 === 0 ? 1 : 0.75) : 0.4;

  // Vocal : risque de collision voix A vs voix B aux points de mix
  const eventsOut = outCtx.events;
  const vocalEndNear = eventsOut.some(e =>
    (e.type === 'VOCAL_END' || e.type === 'INSTRUMENTAL_SECTION' || e.type === 'DRUM_SECTION')
    && Math.abs(e.time - playTo) < 2 * outCtx.barLen && e.strength > 0.35);
  const vocal = vocalEndNear ? 1 : 0.45;

  // Structure : longueur jouable de l'entrant
  const inPlayable = inSeg.playTo - inSeg.playFrom;
  const structure = Math.max(0, Math.min(1, inPlayable / 90));

  // Drop proximité : l'entrant a-t-il un DROP_INCOMING près de son entrée ?
  const dropNear = inCtx.events.some(e =>
    (e.type === 'DROP_INCOMING' || e.type === 'BUILD_UP')
    && e.time > inSeg.playFrom && e.time < inSeg.playFrom + 32 * inCtx.barLen);
  const dropProximity = dropNear ? 1 : 0.2;

  // Opportunité : événements marquants autour du point de coupe
  const oppEvents = eventsOut.filter(e =>
    Math.abs(e.time - playTo) < 4 * outCtx.barLen &&
    ['VOCAL_END', 'BREAK', 'ENERGY_RISE', 'ENERGY_DROP', 'PHRASE_END', 'DROP_OUTGOING'].includes(e.type));
  const opportunity = Math.min(1, 0.3 + oppEvents.length * 0.25);

  // FX : compatibilité types
  const fxSuitability = 0.5 + (['C', 'D', 'E', 'G'].includes(trans.type) ? 0.3 : 0)
    + (bpmDiff < 2 ? 0.2 : 0);

  const total = bpm * 0.16 + phrase * 0.18 + harmonic * 0.14 + energy * 0.10 +
    vocal * 0.10 + structure * 0.06 + dropProximity * 0.08 + opportunity * 0.10 +
    fxSuitability * 0.08;

  return { bpm, phrase, harmonic, energy, vocal, structure, dropProximity, opportunity, fxSuitability, total };
}

// ============================ SÉLECTION DU MOVE ============================

function energyClass(e: number): 'low' | 'mid' | 'high' {
  return e < 0.35 ? 'low' : e < 0.62 ? 'mid' : 'high';
}

function moveConditionScore(
  move: DjMove, outCtx: PerformanceTrackContext, inCtx: PerformanceTrackContext,
  factors: TransitionFactors, position: number, mixEnergyLevel: number
): number {
  let s = 0;

  // Conditions dures (le move doit cadrer avec la situation musicale)
  if (move.vocal_condition === 'vocalEnd') {
    const hasVocalEnd = outCtx.events.some(e => e.type === 'VOCAL_END' && e.strength > 0.4);
    s += hasVocalEnd ? 0.9 : -0.55;
  }
  if (move.vocal_condition === 'instrumental') {
    const hasInst = outCtx.events.some(e =>
      (e.type === 'INSTRUMENTAL_SECTION' || e.type === 'DRUM_SECTION') && e.strength > 0.3);
    s += hasInst ? 0.8 : -0.3;
  }
  if (move.phrase_condition === 'phraseEnd') s += factors.phrase * 0.8;

  // BPM range
  const bpmAvg = (outCtx.beatLen && inCtx.beatLen)
    ? 60 / ((outCtx.beatLen + inCtx.beatLen) / 2) : 105;
  if (bpmAvg < move.bpm_range[0] || bpmAvg > move.bpm_range[1]) s -= 0.8;

  // Énergie avant → après
  const eOut = energyClass(outCtx.energy), eIn = energyClass(inCtx.energy);
  const classes = ['low', 'mid', 'high'] as const;
  if (move.energy_before !== 'any') {
    if (move.energy_before === eOut) s += 0.35;
    else s -= 0.25;
  }
  if (move.energy_after !== 'any') {
    if (move.energy_after === eIn) s += 0.45;
    else s -= 0.4;
  }
  // Un move 'high after' est naturellement bon si l'énergie du mix doit monter
  if (move.energy_after === 'high' && position > 0.35 && position < 0.85) s += 0.25 * mixEnergyLevel / 10;
  // Un move 'low after' au peak du mix est malvenu
  if (move.energy_after === 'low' && position > 0.45 && position < 0.8) s -= 0.35;

  // Drop proximity : LOOP_BUILD / RISER_DROP / DOUBLE_DROP réclament un drop chez l'entrant
  if (['LOOP_BUILD', 'RISER_DROP', 'DOUBLE_DROP', 'FILTER_DROP'].includes(move.id)) {
    s += (factors.dropProximity - 0.5) * 1.2;
  }

  // Vocal collision : si les deux ont des voix, éviter les longs blends
  if (factors.vocal < 0.6 && ['LONG_BLEND', 'BASS_SWAP', 'DOUBLE_DROP'].includes(move.id)) s -= 0.35;
  if (factors.vocal < 0.6 && ['VOCAL_ECHO_EXIT', 'VOCAL_TEASE', 'SILENCE_IMPACT'].includes(move.id)) s += 0.3;

  // BPM compat : si écart important, préférer cut/echo/spinback (pas de beatmatch)
  if (factors.bpm < 0.5) {
    if (['BACKSPIN_IMPACT', 'VOCAL_ECHO_EXIT', 'PITCH_BRIDGE', 'SILENCE_IMPACT'].includes(move.id)) s += 0.4;
    if (['BASS_SWAP', 'DOUBLE_DROP', 'LONG_BLEND', 'EQ_PERC_RELAY'].includes(move.id)) s -= 0.5;
  }

  // Transition types compatibles (le planner a déjà choisi un type A..H raisonnable)
  s += factors.fxSuitability > 0.6 ? 0.15 : 0;

  return s;
}

// ============================ MOTEUR PRINCIPAL ============================

/**
 * Construit la performance DJ complète pour un plan donné.
 * Ne modifie PAS le plan : produit les gestes qui l'exécutent.
 */
export function buildPerformance(
  plan: MixPlan,
  opts: PerformanceOptions
): DjPerformance {
  const seed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffff)) >>> 0);
  const rng = seededRandom(seed);

  // ---- 1. Contextes par piste (événements + grille) ----
  const contexts: PerformanceTrackContext[] = plan.segments.map((seg, i) => {
    const analysis = opts.analyses?.get(i) || null;
    const events = extractEvents(analysis, seg);
    const bpm = analysis?.bpm || seg.effectiveBpm || seg.track.bpm || 105;
    const beatLen = 60 / bpm;
    const anchor = analysis?.structure.bestIn ?? seg.playFrom;
    return {
      events,
      gridAnchor: anchor,
      barLen: beatLen * 4,
      beatLen,
      energy: analysis?.energy ?? seg.estEnergy
    };
  });

  const history: string[] = [];
  const moves: PlannedMove[] = [];
  const timeline: PerformanceAction[] = [];
  const moveCounts: Record<string, number> = {};

  const n = plan.transitions.length;
  plan.transitions.forEach((trans, i) => {
    const outSeg = plan.segments[trans.fromIndex];
    const inSeg = plan.segments[trans.toIndex];
    const outCtx = contexts[trans.fromIndex];
    const inCtx = contexts[trans.toIndex];

    // Position dans le mix (0..1) — pour l'agressivité progressive
    const position = n > 1 ? i / (n - 1) : 0.5;

    const factors = computeFactors(outCtx, inCtx, outSeg, inSeg, trans);

    // ---- scoring de chaque move candidat ----
    const scored = DJ_MOVE_LIBRARY.map(move => {
      // compatibilité avec le type de transition planifié
      if (!move.compatible_transition_types.includes(trans.type)) {
        // le planner peut avoir choisi un type générique : on tolère, pénalité légère
        // sauf si style 'safe' → on respecte strictement
        if (opts.style === 'safe') return { move, score: -Infinity };
      }
      let score = moveConditionScore(move, outCtx, inCtx, factors, position, plan.params.energyLevel);
      score += factors.total * 1.4;

      // style d'audace
      const sw = move.style_weights[opts.style] ?? 0.5;
      if (sw <= 0) return { move, score: -Infinity };
      score += (sw - 1) * 1.6;

      // personnalité
      const pa = move.personality_affinity[opts.personality] ?? 1;
      score += (pa - 1) * 0.9;

      // ---- VARIATION : pénaliser la répétition immédiate ----
      const lastIdx = history.lastIndexOf(move.id);
      if (lastIdx >= 0) {
        const since = history.length - lastIdx;
        if (since === 1) score -= 1.4;       // jamais 2 fois de suite
        else if (since === 2) score -= 0.7;
        else if (since === 3) score -= 0.35;
      }
      // fréquence globale : ne pas user un move au-delà de sa fréquence de référence
      const used = moveCounts[move.id] || 0;
      const maxUses = Math.max(1, Math.round((move.ref_frequency * (n + 2)) + 0.5));
      if (used >= maxUses) score -= (used - maxUses + 1) * 0.9;

      // position dans le mix : early = plus safe, peak = plus percutant
      if (position < 0.25 && ['BACKSPIN_IMPACT', 'SILENCE_IMPACT', 'STUTTER_EXIT', 'DOUBLE_DROP'].includes(move.id)) score -= 0.5;
      if (position > 0.55 && position < 0.95 && ['SILENCE_IMPACT', 'BACKSPIN_IMPACT', 'STUTTER_EXIT', 'LOOP_BUILD'].includes(move.id)) score += 0.3;
      if (position > 0.9 && ['VOCAL_ECHO_EXIT', 'LONG_BLEND', 'BASS_SWAP'].includes(move.id)) score += 0.25; // final : on respire

      // RNG déterministe → 2 générations ≠ même mix
      score += rng() * 0.55;

      return { move, score };
    }).filter(s => isFinite(s.score))
      .sort((a, b) => b.score - a.score);

    let chosen = scored[0];
    // RÈGLE DE REJET : si le meilleur score est trop faible (transition « automatique »),
    // la stratégie est rejetée → on prend la 2e meilleure approche.
    if (chosen && chosen.score < 1.15 && scored.length > 1) chosen = scored[1];
    if (!chosen) return;

    const move = chosen.move;
    moveCounts[move.id] = (moveCounts[move.id] || 0) + 1;
    history.push(move.id);

    // ---- adaptation paramétrique (durée en mesures) ----
    const blendFactor = PERSONALITY_BLEND_FACTOR[opts.personality] * (opts.style === 'safe' ? 1.15 : opts.style === 'aggressive' ? 0.75 : 1);
    const energyFactor = 1 - (inCtx.energy - outCtx.energy) * 0.4; // montée d'énergie = transitions plus courtes
    let bars = Math.max(2, Math.round(move.duration_bars * blendFactor * Math.max(0.6, Math.min(1.4, energyFactor))));

    // contrainte de budget : la transition ne peut dépasser le segment sortant
    const outBeats = (outSeg.playTo - outSeg.playFrom) / outCtx.beatLen;
    const maxBars = Math.max(2, Math.floor(outBeats / 4) - 1);
    if (bars > maxBars) bars = maxBars;
    // et l'entrant doit exister après son point d'entrée
    const inBeats = (inSeg.playTo - inSeg.playFrom) / inCtx.beatLen;
    const maxBarsIn = Math.max(2, Math.floor(inBeats / 4));
    if (bars > maxBarsIn) bars = maxBarsIn;

    const durationSec = bars * 4 * outCtx.beatLen;

    // write-back : le séquenceur de base (AutoMixPlayer) s'appuie sur
    // trans.durationSec pour déclencher la transition au bon moment → on
    // aligne la durée du move sur la transition du plan.
    trans.bars = bars;
    trans.durationSec = durationSec;

    // ---- geste : scale des steps sur la durée adaptée ----
    const scale = (bars * 4) / (move.duration_bars * 4);
    const steps = move.steps.map(st => ({
      atBeats: Math.round(st.atBeats * scale * 4) / 4,   // arrondi au 1/4 de temps (grille 1/16)
      action: st.action,
      target: st.target,
      params: { ...(st.params || {}) },
      label: st.label
    }));

    const pm: PlannedMove = {
      moveId: move.id,
      name: move.name,
      fromIndex: trans.fromIndex,
      bars,
      durationSec,
      steps,
      score: Math.round(chosen.score * 100) / 100,
      reason: buildReason(move, factors, outSeg, inSeg),
      factors
    };
    moves.push(pm);

    for (const st of steps) {
      timeline.push({
        transitionIndex: i,
        atBeats: st.atBeats,
        action: st.action,
        target: st.target,
        params: st.params,
        label: st.label
      });
    }
  });

  timeline.sort((a, b) => a.transitionIndex - b.transitionIndex || a.atBeats - b.atBeats);

  const qc = runQc(plan, moves, timeline, contexts);
  const distinct = new Set(moves.map(m => m.moveId)).size;
  const signature = buildSignature(opts.personality, opts.style, moves);

  return {
    style: opts.style,
    personality: opts.personality,
    signature,
    moves,
    timeline,
    qc,
    stats: {
      totalActions: timeline.length,
      distinctMoves: distinct,
      fxDensity: moves.length ? Math.round((timeline.length / moves.length) * 10) / 10 : 0,
      seed
    }
  };
}

// ============================ RAISONS (pédagogie) ============================

function buildReason(move: DjMove, f: TransitionFactors, outSeg: MixSegment, inSeg: MixSegment): string {
  const bits: string[] = [];
  bits.push(move.trigger);
  if (f.vocal >= 0.9) bits.push('fin de phrase vocale dégagée');
  else if (f.vocal < 0.6) bits.push('risque de collision vocale → geste court/isolant');
  if (f.dropProximity >= 0.9) bits.push('drop de l\'entrant détecté à proximité');
  if (f.bpm >= 0.9) bits.push('BPM synchronisés (' + Math.round(outSeg.effectiveBpm) + '→' + Math.round(inSeg.effectiveBpm) + ')');
  else if (f.bpm < 0.5) bits.push('écart de tempo assumé (' + Math.round(outSeg.effectiveBpm) + '→' + Math.round(inSeg.effectiveBpm) + ')');
  if (f.harmonic >= 0.85) bits.push('harmonie compatible');
  if (f.energy < 0.4) bits.push('changement d\'énergie délibéré');
  return bits.join(' · ');
}

function buildSignature(personality: DjPersonality, style: DjStyle, moves: PlannedMove[]): string {
  const labels: Record<DjPersonality, string> = {
    smooth: 'DJ Smooth', groovy: 'DJ Groovy', afroclub: 'DJ Afroclub',
    hype: 'DJ Hype', dynamic: 'DJ Dynamic', technical: 'DJ Technique', showman: 'DJ Showman'
  };
  const styleLabel: Record<DjStyle, string> = {
    safe: 'safe', creative: 'créatif', club: 'club', aggressive: 'agressif'
  };
  const top = [...moves].sort((a, b) => b.score - a.score)[0];
  const fav = top ? ` · move signature : ${top.name}` : '';
  return `${labels[personality]} · set ${styleLabel[style]}${fav}`;
}

// ============================ CONTRÔLE QUALITÉ ============================

function runQc(
  plan: MixPlan, moves: PlannedMove[], timeline: PerformanceAction[],
  contexts: PerformanceTrackContext[]
): QcReport {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const warnings: string[] = [];

  // 1. transitions sur phrases musicales
  const offPhrase = moves.filter(m => m.factors.phrase < 0.7);
  checks.push({
    name: 'Transitions calées sur les phrases',
    ok: offPhrase.length === 0,
    detail: offPhrase.length ? `${offPhrase.length} transition(s) hors grille — recalage au démarrage du deck` : 'toutes sur la grille 8/16 mesures'
  });

  // 2. variation des transitions
  const ids = moves.map(m => m.moveId);
  const repeats = ids.filter((id, i) => i > 0 && id === ids[i - 1]).length;
  checks.push({
    name: 'Aucune transition identique répétée',
    ok: repeats === 0,
    detail: repeats ? `${repeats} répétition(s) immédiate(s)` : `${new Set(ids).size} moves distincts sur ${ids.length} transitions`
  });

  // 3. densité d'effets (pas de sur-utilisation)
  const perTrans = new Map<number, number>();
  for (const a of timeline) perTrans.set(a.transitionIndex, (perTrans.get(a.transitionIndex) || 0) + 1);
  const maxActions = Math.max(0, ...perTrans.values());
  checks.push({
    name: 'Effets non surutilisés',
    ok: maxActions <= 14,
    detail: `max ${maxActions} gestes par transition`
  });

  // 4. basses : au moins un kill/swap sur transitions chevauchantes
  const longMoves = moves.filter(m => m.bars >= 16);
  const bassManaged = longMoves.every(m =>
    m.steps.some(s => (s.action === 'eqLow' || s.action === 'bass' || s.action === 'dropSwitch') && (s.params?.['db'] ?? 0) <= -10));
  checks.push({
    name: 'Aucune collision de basses',
    ok: bassManaged,
    detail: bassManaged ? 'relais de basses systématique sur les blends longs' : 'attention : blend long sans relais de basses'
  });
  if (!bassManaged) warnings.push('Un blend long garde deux lignes de basses : le player appliquera un kill de sécurité.');

  // 5. préparation des drops
  const dropPrepared = moves.filter(m => ['LOOP_BUILD', 'RISER_DROP', 'FILTER_DROP', 'DOUBLE_DROP'].includes(m.moveId));
  const highEnergyIn = moves.filter(m => m.factors.dropProximity >= 0.9);
  const unprepped = highEnergyIn.filter(m => !dropPrepared.includes(m) &&
    !['BACKSPIN_IMPACT', 'SILENCE_IMPACT', 'STUTTER_EXIT'].includes(m.moveId));
  checks.push({
    name: 'Drops correctement préparés',
    ok: unprepped.length <= 1,
    detail: unprepped.length > 1 ? `${unprepped.length} drops non préparés` : 'drops préparés (roll/riser/filter) ou assumés (cut/impact)'
  });

  // 6. énergie globale
  const energies = plan.segments.map((s, i) => contexts[i]?.energy ?? s.estEnergy);
  let coherent = true;
  for (let i = 1; i < energies.length; i++) {
    if (Math.abs(energies[i] - energies[i - 1]) > 0.6) coherent = false;
  }
  checks.push({
    name: 'Courbe d\'énergie cohérente',
    ok: coherent,
    detail: coherent ? 'progression régulière' : 'un saut d\'énergie majeur est assumé (transition créative)'
  });

  const passed = checks.every(c => c.ok);
  return { passed, checks, warnings };
}
