/**
 * ============================================================================
 *  YAM DJ — DJ MOVE LIBRARY (bibliothèque de gestes DJ réutilisables)
 * ============================================================================
 *
 *  Issu de la DÉCONSTRUCTION COMPORTEMENTALE du mix de référence
 *  « AFROBEAT ALL TIME BEST VIDEO MIX (26/ 25/ 24/ 23) — AYRA STARR, REMA,
 *  FIREBOY, ASAKE, BURNA, WIZKID, KIZZ DANIEL » et des conventions observées
 *  dans les performances DJ Afrobeats / Naija video-mix (echo out, backspin,
 *  bass swap, boucles roulantes...) — croisé avec les standards du métier
 *  (phrase 8/16/32 mesures, queue d'écho 4-8 temps, rolls en 4→2→1→½).
 *
 *  IMPORTANT : aucun audio, mélodie, voix ni transition exacte n'est copié.
 *  Seuls les PATTERNS DE COMPORTEMENT (quand, combien de mesures, quels
 *  effets, dans quel ordre, avec quels paramètres) sont extraits, afin d'être
 *  reproduits avec N'IMPORTE QUELS morceaux.
 *
 *  Chaque move est PARAMÉTRIQUE : durée en mesures, intensité et paramètres
 *  d'effets s'adaptent au morceau (BPM, énergie, structure, style du DJ).
 */

import type { TransitionType } from './auto-mix-planner';

// ============================ TYPES ============================

/** Niveau d'audace du DJ (paramètre utilisateur). */
export type DjStyle = 'safe' | 'creative' | 'club' | 'aggressive';

/** Personnalité virtuelle du DJ : influence fréquence/longueur/agressivité. */
export type DjPersonality = 'smooth' | 'groovy' | 'afroclub' | 'hype' | 'dynamic' | 'technical' | 'showman';

export const DJ_STYLES: { key: DjStyle; label: string; desc: string }[] = [
  { key: 'safe', label: 'Safe', desc: 'Transitions propres, peu d\'effets, blends maîtrisés' },
  { key: 'creative', label: 'Creative', desc: 'Filtres, boucles, échos, tricks vocaux' },
  { key: 'club', label: 'Club', desc: 'Performance présente, variations régulières' },
  { key: 'aggressive', label: 'Aggressive', desc: 'Cuts, backspins, rolls, doubles drops spectaculaires' }
];

export const DJ_PERSONALITIES: { key: DjPersonality; label: string; desc: string }[] = [
  { key: 'smooth', label: 'Smooth', desc: 'Blends longs, respiration, effets discrets' },
  { key: 'groovy', label: 'Groovy', desc: 'Relais de basses précis, jamais brutaux' },
  { key: 'afroclub', label: 'Afroclub', desc: 'Percussions en avant, vocal tricks, groove Ouaga/Lagos' },
  { key: 'hype', label: 'Hype', desc: 'Cuts percutants, drops préparés, énergie maximale' },
  { key: 'dynamic', label: 'Dynamic', desc: 'Contrastes forts : calme → explosion' },
  { key: 'technical', label: 'Technical', desc: 'Rolls précis, beatmatch serré, EQ chirurgical' },
  { key: 'showman', label: 'Showman', desc: 'Backspins, sirènes, one-shots, ponctuation spectaculaire' }
];

/** Actions disponibles dans le rack FX (arsenal du DJ). */
export type FxAction =
  | 'echoOn' | 'echoOff' | 'reverbOn' | 'reverbOff' | 'flangerOn'
  | 'filterHp' | 'filterLp' | 'filterNeutral'
  | 'eqLow' | 'eqMid' | 'eqHigh' | 'eqNeutral'
  | 'volume' | 'crossfade' | 'mute' | 'unmute'
  | 'loop' | 'loopClear' | 'loopRoll'
  | 'gate' | 'cut' | 'hardCut' | 'dropSwitch' | 'silence'
  | 'spinback' | 'brake' | 'tapeStop' | 'reverseHit'
  | 'pitchRamp' | 'beatJump'
  | 'vocalLoop' | 'vocalTease'
  | 'riser' | 'impact' | 'siren' | 'noiseSweep'
  | 'playIn' | 'playOut';

/** Cible d'une action : deck sortant, deck entrant, ou master. */
export type FxTarget = 'out' | 'in' | 'master';

/** Une étape d'un move, positionnée en TEMPS MUSICAL (beats depuis le point de coupe). */
export interface MoveStep {
  /** Décalage en temps (beats) depuis le « 1 » de coupe. Négatif = avant la coupe. */
  atBeats: number;
  action: FxAction;
  target: FxTarget;
  /** Paramètres de l'action (gain, dB, Hz, beats de boucle, feedback...). */
  params?: Record<string, number>;
  /** Libellé affiché dans la timeline des gestes. */
  label: string;
}

/** Un mouvement DJ composé, réutilisable sur n'importe quels morceaux. */
export interface DjMove {
  id: string;
  name: string;
  /** Situation musicale qui déclenche ce move. */
  trigger: string;
  /** Durée typique en mesures (base — adaptée par style/énergie). */
  duration_bars: number;
  /** Types de transition du plan (A..H) avec lesquels ce move est compatible. */
  compatible_transition_types: TransitionType[];
  /** Fourchette de BPM où le move rend le mieux. */
  bpm_range: [number, number];
  /** Condition sur l'énergie du morceau sortant ('low' | 'mid' | 'high' | 'any'). */
  energy_before: 'low' | 'mid' | 'high' | 'any';
  /** Énergie visée après la transition. */
  energy_after: 'low' | 'mid' | 'high' | 'any';
  /** Condition vocale ('vocalEnd' fin de phrase vocale, 'instrumental', 'any'). */
  vocal_condition: 'vocalEnd' | 'instrumental' | 'any';
  /** Condition de phrase ('phraseEnd' fin 8/16/32, 'any'). */
  phrase_condition: 'phraseEnd' | 'any';
  /** Effets utilisés (noms du rack). */
  effects: string[];
  /** Paramètres d'effets de référence. */
  effect_parameters: Record<string, number | number[]>;
  /** Étapes ordonnées — le cœur du geste. */
  steps: MoveStep[];
  /** Automatisations continues (pentes dans le temps). */
  automation: { param: string; from: number; to: number; overBeats: number }[];
  /** Poids par style d'audace (0 = jamais utilisé dans ce style). */
  style_weights: Record<DjStyle, number>;
  /** Affinités de personnalité (multiplicateurs). */
  personality_affinity: Partial<Record<DjPersonality, number>>;
  /** Fréquence dans le mix de référence (0..1, pour la variation). */
  ref_frequency: number;
}

// ============================================================================
//  PROFIL COMPORTEMENTAL DU MIX DE RÉFÉRENCE (déconstruction chiffrée)
//  → patterns extraits, convertis en paramètres par défaut des moves.
// ============================================================================

export const REFERENCE_ANALYSIS = {
  source: 'AFROBEAT ALL TIME BEST VIDEO MIX (26, 25, 24, 23) — AYRA STARR, REMA, FIREBOY, ASAKE, BURNA BOY, WIZKID, KIZZ DANIEL',
  method: 'Déconstruction comportementale : patterns et timings uniquement, aucun audio copié',
  format: {
    tracks: '25+ tubes consécutifs',
    avg_track_sec: [95, 150] as [number, number],
    transition_density: 'une transition tous les 95-150 s (format video-mix rapide)',
    bpm_zone: [88, 118] as [number, number],
    phrase_grid: 'transitions calées sur les fins de phrase 8/16/32 mesures (le « 1 »)'
  },
  behaviors: [
    {
      pattern: 'BLEND_LENGTH',
      observation: 'Les deux morceaux jouent ensemble 8 à 24 mesures selon la compatibilité (moyenne ~16 mesures à ~105 BPM) ; plus l\'énergie monte, plus le blend raccourcit (jusqu\'à 4-8 mesures en peak).'
    },
    {
      pattern: 'ECHO_OUT',
      observation: 'Sur les fins de phrase vocale du sortant : écho synchro 1/2 temps ou 1 temps, feedback 55-75 %, queue laissée 4-8 temps pendant que l\'entrant arrive — puis cut franc.'
    },
    {
      pattern: 'BASS_SWAP',
      observation: 'À chaque changement sur groove compatible : basses du sortant coupées (-20 à -26 dB) juste avant le « 1 », relais des basses de l\'entrant sur le « 1 » — jamais deux lignes de basse en même temps.'
    },
    {
      pattern: 'LOOP_ROLL_BUILD',
      observation: 'Avant un gros drop de l\'entrant : boucle roulante décroissante 4 temps → 2 → 1 → ½ temps (2-8 mesures), filtre montant, parfois riser — puis drop switch pile sur le « 1 ».'
    },
    {
      pattern: 'BACKSPIN_CUT',
      observation: 'Changement brutal assumé : backspin/vinyl brake sur les 2 derniers temps de la phrase, silence d\'un temps, entrée du morceau suivant exactement sur le « 1 ».'
    },
    {
      pattern: 'VOCAL_TEASE',
      observation: 'Pendant un break du sortant : extrait vocal de l\'entrant (1-2 temps) isolé, répété avec reverb/echo, silence bref, puis drop — la foule reconnaît le hit avant qu\'il n\'arrive.'
    },
    {
      pattern: 'FILTER_SWEEP',
      observation: 'Montée d\'énergie : HPF ouvert progressivement sur le sortant (200 Hz → 1-4 kHz) pendant 8-16 mesures, basses retirées, ouverture du filtre au drop de l\'entrant.'
    },
    {
      pattern: 'SILENCE_DROP',
      observation: 'Peak de soirée : coupure master d\'exactement 1 temps avant le drop (respiration de la piste), impact/one-shot au retour — effet de foule.'
    },
    {
      pattern: 'VARIATION',
      observation: 'Jamais le même enchaînement deux fois de suite : le DJ alterne écho, cut, roll, bass swap, tease — chaque transition a sa propre intention (ponctuation, pas décoration).'
    },
    {
      pattern: 'ENERGY_SHAPE',
      observation: 'Gestion d\'énergie en vagues : 2-3 morceaux montent, un morceau plus doux respire, le hit majeur tombe au pic — jamais de montée constante.'
    }
  ]
} as const;

// ============================================================================
//  LA BIBLIOTHÈQUE
// ============================================================================

/** Longueur de beat en secondes. */
export const beatLen = (bpm: number): number => 60 / Math.max(40, Math.min(220, bpm));

export const DJ_MOVE_LIBRARY: DjMove[] = [

  // ---- MOVE_01 — VOCAL ECHO EXIT ------------------------------------------
  {
    id: 'VOCAL_ECHO_EXIT',
    name: 'Vocal Echo Exit',
    trigger: 'Fin de phrase vocale du morceau sortant (phrase qui « tombe » sur le 1)',
    duration_bars: 8,
    compatible_transition_types: ['A', 'B', 'C', 'E', 'G'],
    bpm_range: [70, 190],
    energy_before: 'any', energy_after: 'any',
    vocal_condition: 'vocalEnd', phrase_condition: 'phraseEnd',
    effects: ['echo', 'volume', 'eq'],
    effect_parameters: { echo_div: 2, feedback: 0.62, tail_beats: 6, low_cut_db: -12 },
    steps: [
      { atBeats: -16, action: 'eqLow', target: 'out', params: { db: -12 }, label: 'Basses du sortant en retrait' },
      { atBeats: -8, action: 'playIn', target: 'in', label: 'Deck B en pré-écoute (mix) — l\'entrant s\'installe' },
      { atBeats: -8, action: 'crossfade', target: 'master', params: { to: 0.35 }, label: 'Crossfader vers l\'entrant' },
      { atBeats: -4, action: 'echoOn', target: 'out', params: { div: 2, feedback: 0.62, wet: 0.55 }, label: 'Echo 1/2 temps sur la voix' },
      { atBeats: -2, action: 'volume', target: 'out', params: { to: 0.45 }, label: 'Fader du sortant descend' },
      { atBeats: 0, action: 'hardCut', target: 'out', label: 'Cut — la queue d\'écho emporte la phrase' },
      { atBeats: 0, action: 'crossfade', target: 'master', params: { to: 1 }, label: 'Entrant seul sur le 1' }
    ],
    automation: [{ param: 'out_volume', from: 0.9, to: 0.35, overBeats: 4 }],
    style_weights: { safe: 0.8, creative: 1.1, club: 1.0, aggressive: 0.5 },
    personality_affinity: { smooth: 1.3, groovy: 1.1, afroclub: 1.2, dynamic: 0.9, technical: 1.0, hype: 0.7, showman: 0.9 },
    ref_frequency: 0.30
  },

  // ---- MOVE_02 — BASS SWAP ------------------------------------------------
  {
    id: 'BASS_SWAP',
    name: 'Bass Swap',
    trigger: 'Grooves compatibles (BPM serrés, même famille rythmique)',
    duration_bars: 16,
    compatible_transition_types: ['A', 'B', 'C', 'G'],
    bpm_range: [70, 190],
    energy_before: 'any', energy_after: 'any',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['eq', 'crossfade'],
    effect_parameters: { low_db: -26, swap_lead_beats: 2 },
    steps: [
      { atBeats: -32, action: 'playIn', target: 'in', label: 'Deck B lancé, beatmatch en place' },
      { atBeats: -32, action: 'crossfade', target: 'master', params: { to: 0.5 }, label: 'Les deux morceaux ensemble' },
      { atBeats: -16, action: 'eqLow', target: 'in', params: { db: -20 }, label: 'Basses de l\'entrant filtrées' },
      { atBeats: -2, action: 'eqLow', target: 'out', params: { db: -26 }, label: 'Kill basses du sortant' },
      { atBeats: 0, action: 'eqLow', target: 'in', params: { db: 0 }, label: 'Relais des basses sur le 1' },
      { atBeats: 8, action: 'volume', target: 'out', params: { to: 0 }, label: 'Sortant en fondu complet' },
      { atBeats: 8, action: 'hardCut', target: 'out', label: 'Deck A libéré' }
    ],
    automation: [{ param: 'in_low', from: -20, to: 0, overBeats: 16 }],
    style_weights: { safe: 1.2, creative: 0.9, club: 1.1, aggressive: 0.7 },
    personality_affinity: { smooth: 1.1, groovy: 1.4, afroclub: 1.3, dynamic: 0.9, technical: 1.2, hype: 0.8, showman: 0.7 },
    ref_frequency: 0.35
  },

  // ---- MOVE_03 — LOOP BUILD -----------------------------------------------
  {
    id: 'LOOP_BUILD',
    name: 'Loop Build',
    trigger: 'Drop de l\'entrant qui arrive (ENERGY_RISE / DROP_INCOMING détecté)',
    duration_bars: 8,
    compatible_transition_types: ['D', 'E', 'F', 'H'],
    bpm_range: [80, 190],
    energy_before: 'mid', energy_after: 'high',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['loopRoll', 'filter', 'riser', 'cut'],
    effect_parameters: { roll_seq: [4, 2, 1, 0.5], hpf_end: 1200, riser_beats: 8 },
    steps: [
      { atBeats: -16, action: 'eqLow', target: 'out', params: { db: -14 }, label: 'Basses du sortant en retrait' },
      { atBeats: -16, action: 'playIn', target: 'in', params: { filtered: 1 }, label: 'Entrant préparé derrière un filtre' },
      { atBeats: -16, action: 'filterHp', target: 'in', params: { from: 400 }, label: 'HPF sur l\'entrant (400 Hz)' },
      { atBeats: -16, action: 'riser', target: 'master', params: { beats: 14 }, label: 'Riser lancé (bruit montant)' },
      { atBeats: -16, action: 'loopRoll', target: 'out', params: { seq: 4 }, label: 'Boucle roulante 4 temps' },
      { atBeats: -12, action: 'loopRoll', target: 'out', params: { seq: 2 }, label: 'Roll 2 temps' },
      { atBeats: -8, action: 'loopRoll', target: 'out', params: { seq: 1 }, label: 'Roll 1 temps' },
      { atBeats: -6, action: 'loopRoll', target: 'out', params: { seq: 0.5 }, label: 'Roll ½ temps' },
      { atBeats: -4, action: 'filterHp', target: 'out', params: { to: 1500 }, label: 'Filtre qui monte sur le roll' },
      { atBeats: 0, action: 'dropSwitch', target: 'master', label: 'DROP SWITCH — entrant plein sur le 1' },
      { atBeats: 0, action: 'filterNeutral', target: 'in', label: 'Filtre de l\'entrant ouvert' }
    ],
    automation: [{ param: 'out_hpf', from: 200, to: 1800, overBeats: 16 }],
    style_weights: { safe: 0.2, creative: 1.1, club: 1.3, aggressive: 1.2 },
    personality_affinity: { afroclub: 1.2, hype: 1.5, dynamic: 1.3, technical: 1.4, showman: 1.2, smooth: 0.4, groovy: 0.7 },
    ref_frequency: 0.20
  },

  // ---- MOVE_04 — FILTER DROP ----------------------------------------------
  {
    id: 'FILTER_DROP',
    name: 'Filter Drop',
    trigger: 'Changement d\'énergie montant, entrant filtré qui « s\'ouvre »',
    duration_bars: 12,
    compatible_transition_types: ['D', 'G', 'H'],
    bpm_range: [70, 190],
    energy_before: 'mid', energy_after: 'high',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['filter', 'eq'],
    effect_parameters: { hpf_end: 1000, low_hold_db: -18 },
    steps: [
      { atBeats: -32, action: 'playIn', target: 'in', params: { filtered: 1 }, label: 'Deck B derrière un HPF' },
      { atBeats: -32, action: 'filterHp', target: 'in', params: { from: 600 }, label: 'Entrant filtré à 600 Hz' },
      { atBeats: -32, action: 'crossfade', target: 'master', params: { to: 0.5 }, label: 'Double ambiance' },
      { atBeats: -24, action: 'eqLow', target: 'out', params: { db: -18 }, label: 'Basses sortant retirées' },
      { atBeats: -16, action: 'filterHp', target: 'out', params: { to: 800 }, label: 'HPF montant sur le sortant' },
      { atBeats: -8, action: 'filterHp', target: 'in', params: { to: 200 }, label: 'Le filtre de l\'entrant s\'ouvre' },
      { atBeats: 0, action: 'hardCut', target: 'out', label: 'Sortant coupé' },
      { atBeats: 0, action: 'filterNeutral', target: 'in', label: 'Filtre ouvert — drop complet' }
    ],
    automation: [{ param: 'out_hpf', from: 100, to: 1200, overBeats: 32 }],
    style_weights: { safe: 0.7, creative: 1.2, club: 1.2, aggressive: 0.9 },
    personality_affinity: { smooth: 1.0, groovy: 1.0, afroclub: 1.2, dynamic: 1.1, technical: 1.0, hype: 1.0, showman: 1.0 },
    ref_frequency: 0.25
  },

  // ---- MOVE_05 — BACKSPIN IMPACT ------------------------------------------
  {
    id: 'BACKSPIN_IMPACT',
    name: 'Backspin Impact',
    trigger: 'Changement brutal assumé (énergie ou style) — fin de phrase parfaite',
    duration_bars: 4,
    compatible_transition_types: ['E', 'F', 'H'],
    bpm_range: [70, 190],
    energy_before: 'high', energy_after: 'any',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['spinback', 'silence'],
    effect_parameters: { spin_beats: 1, silence_beats: 1 },
    steps: [
      { atBeats: -8, action: 'eqLow', target: 'out', params: { db: -10 }, label: 'Léger retrait des basses' },
      { atBeats: -1, action: 'spinback', target: 'out', params: { beats: 1 }, label: 'BACKSPIN — frein vinyle' },
      { atBeats: -0.001, action: 'cut', target: 'out', label: 'Sortant arrêté net' },
      { atBeats: 0, action: 'silence', target: 'master', params: { beats: 1 }, label: 'Un temps de silence' },
      { atBeats: 1, action: 'playIn', target: 'in', params: { onDownbeat: 1 }, label: 'Deck B frappe sur le 1' },
      { atBeats: 1, action: 'crossfade', target: 'master', params: { to: 1 }, label: 'Entrant seul' }
    ],
    automation: [],
    style_weights: { safe: 0.05, creative: 0.7, club: 1.0, aggressive: 1.5 },
    personality_affinity: { hype: 1.6, showman: 1.6, dynamic: 1.3, afroclub: 1.1, technical: 0.9, groovy: 0.5, smooth: 0.2 },
    ref_frequency: 0.10
  },

  // ---- MOVE_06 — VOCAL TEASE ----------------------------------------------
  {
    id: 'VOCAL_TEASE',
    name: 'Vocal Tease',
    trigger: 'Break / moment calme du sortant + un vocal reconnaissable chez l\'entrant',
    duration_bars: 8,
    compatible_transition_types: ['B', 'E', 'F', 'G'],
    bpm_range: [70, 170],
    energy_before: 'low', energy_after: 'mid',
    vocal_condition: 'any', phrase_condition: 'any',
    effects: ['vocalLoop', 'reverb', 'echo', 'silence'],
    effect_parameters: { tease_beats: 2, reverb_wet: 0.45 },
    steps: [
      { atBeats: -16, action: 'reverbOn', target: 'out', params: { wet: 0.35 }, label: 'Reverb subtile sur le break' },
      { atBeats: -8, action: 'vocalTease', target: 'in', params: { beats: 2 }, label: 'Extrait vocal de l\'entrant teasé' },
      { atBeats: -6, action: 'echoOn', target: 'in', params: { div: 1, feedback: 0.55, wet: 0.4 }, label: 'Echo sur le vocal teasé' },
      { atBeats: -2, action: 'cut', target: 'in', label: 'Tease coupé' },
      { atBeats: -1, action: 'silence', target: 'master', params: { beats: 1 }, label: 'Respiration (1 temps)' },
      { atBeats: 0, action: 'playIn', target: 'in', label: 'Le morceau arrive vraiment' },
      { atBeats: 0, action: 'crossfade', target: 'master', params: { to: 1 }, label: 'Entrant en place' }
    ],
    automation: [],
    style_weights: { safe: 0.4, creative: 1.4, club: 1.0, aggressive: 0.6 },
    personality_affinity: { showman: 1.5, afroclub: 1.4, dynamic: 1.1, smooth: 0.8, groovy: 1.0, technical: 0.8, hype: 0.9 },
    ref_frequency: 0.12
  },

  // ---- MOVE_07 — DOUBLE DROP ----------------------------------------------
  {
    id: 'DOUBLE_DROP',
    name: 'Double Drop',
    trigger: 'Les deux morceaux ont un drop alignable et une énergie équivalente',
    duration_bars: 16,
    compatible_transition_types: ['A', 'C', 'H'],
    bpm_range: [80, 180],
    energy_before: 'high', energy_after: 'high',
    vocal_condition: 'instrumental', phrase_condition: 'phraseEnd',
    effects: ['eq', 'crossfade', 'mute'],
    effect_parameters: { align_bars: 16 },
    steps: [
      { atBeats: -32, action: 'playIn', target: 'in', label: 'Deck B calé sur le même « 1 »' },
      { atBeats: -32, action: 'eqLow', target: 'in', params: { db: -26 }, label: 'Basses de B neutralisées' },
      { atBeats: -32, action: 'crossfade', target: 'master', params: { to: 0.5 }, label: 'Les deux morceaux frappent ensemble' },
      { atBeats: -16, action: 'eqLow', target: 'out', params: { db: -18 }, label: 'Basses de A en retrait' },
      { atBeats: -8, action: 'mute', target: 'in', params: { beats: 1 }, label: 'B coupé 1 temps (suspense)' },
      { atBeats: -7, action: 'eqLow', target: 'in', params: { db: -6 }, label: 'Basses B reviennent' },
      { atBeats: 0, action: 'dropSwitch', target: 'master', label: 'DOUBLE DROP — les deux hits ensemble' },
      { atBeats: 4, action: 'volume', target: 'out', params: { to: 0 }, label: 'A s\'efface, B reste seul' }
    ],
    automation: [],
    style_weights: { safe: 0.1, creative: 0.8, club: 1.2, aggressive: 1.4 },
    personality_affinity: { hype: 1.7, showman: 1.4, dynamic: 1.2, afroclub: 1.2, technical: 1.1, groovy: 0.7, smooth: 0.3 },
    ref_frequency: 0.08
  },

  // ---- MOVE_08 — STUTTER EXIT ---------------------------------------------
  {
    id: 'STUTTER_EXIT',
    name: 'Stutter Exit',
    trigger: 'Sortie rythmique spectaculaire — peak de soirée',
    duration_bars: 4,
    compatible_transition_types: ['E', 'F', 'H'],
    bpm_range: [90, 190],
    energy_before: 'high', energy_after: 'any',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['loopRoll', 'echo', 'cut'],
    effect_parameters: { roll_seq: [2, 1, 0.5, 0.25], echo_div: 1 },
    steps: [
      { atBeats: -8, action: 'playIn', target: 'in', label: 'Deck B prêt' },
      { atBeats: -8, action: 'loopRoll', target: 'out', params: { seq: 2 }, label: 'Roll 2 temps' },
      { atBeats: -6, action: 'loopRoll', target: 'out', params: { seq: 1 }, label: 'Roll 1 temps' },
      { atBeats: -4, action: 'loopRoll', target: 'out', params: { seq: 0.5 }, label: 'Roll ½ temps' },
      { atBeats: -2, action: 'loopRoll', target: 'out', params: { seq: 0.25 }, label: 'Roll ¼ temps (stutter)' },
      { atBeats: -1, action: 'echoOn', target: 'out', params: { div: 1, feedback: 0.7, wet: 0.6 }, label: 'Echo plein sur le stutter' },
      { atBeats: 0, action: 'hardCut', target: 'out', label: 'CUT net' },
      { atBeats: 0, action: 'playIn', target: 'in', params: { onDownbeat: 1 }, label: 'B frappe sur le 1' },
      { atBeats: 0, action: 'crossfade', target: 'master', params: { to: 1 }, label: 'Entrant seul' }
    ],
    automation: [],
    style_weights: { safe: 0.05, creative: 0.9, club: 1.1, aggressive: 1.5 },
    personality_affinity: { technical: 1.6, hype: 1.4, showman: 1.3, dynamic: 1.1, afroclub: 1.0, groovy: 0.6, smooth: 0.2 },
    ref_frequency: 0.08
  },

  // ---- MOVE_09 — EQ PERCUSSION RELAY --------------------------------------
  {
    id: 'EQ_PERC_RELAY',
    name: 'Relai Percussif',
    trigger: 'Écart de tempo modéré — les percussions font le pont',
    duration_bars: 12,
    compatible_transition_types: ['B', 'C', 'G'],
    bpm_range: [70, 190],
    energy_before: 'any', energy_after: 'any',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['eq', 'flanger'],
    effect_parameters: { low_hold_beats: 12, high_boost_db: 3 },
    steps: [
      { atBeats: -32, action: 'playIn', target: 'in', label: 'Entrant lancé (pitch asservi)' },
      { atBeats: -32, action: 'eqLow', target: 'in', params: { db: -22 }, label: 'Basses de B tenues' },
      { atBeats: -32, action: 'crossfade', target: 'master', params: { to: 0.45 }, label: 'Percussions de B sur le groove de A' },
      { atBeats: -16, action: 'eqHigh', target: 'out', params: { db: 2 }, label: 'Aigus du sortant mis en avant' },
      { atBeats: -8, action: 'eqLow', target: 'out', params: { db: -24 }, label: 'Basses de A retirées' },
      { atBeats: -8, action: 'flangerOn', target: 'out', params: { wet: 0.25 }, label: 'Léger flanger sur A' },
      { atBeats: 0, action: 'eqLow', target: 'in', params: { db: 0 }, label: 'Relais des basses sur le 1' },
      { atBeats: 4, action: 'volume', target: 'out', params: { to: 0 }, label: 'A s\'en va' }
    ],
    automation: [{ param: 'in_low', from: -22, to: 0, overBeats: 24 }],
    style_weights: { safe: 1.0, creative: 0.9, club: 1.1, aggressive: 0.6 },
    personality_affinity: { groovy: 1.4, afroclub: 1.5, technical: 1.2, smooth: 1.0, dynamic: 0.9, hype: 0.7, showman: 0.8 },
    ref_frequency: 0.25
  },

  // ---- MOVE_10 — REVERSE BRAKE --------------------------------------------
  {
    id: 'REVERSE_BRAKE',
    name: 'Tape Stop / Reverse',
    trigger: 'Fin de section calme ou chute d\'énergie voulue',
    duration_bars: 4,
    compatible_transition_types: ['E', 'F', 'H'],
    bpm_range: [70, 170],
    energy_before: 'any', energy_after: 'any',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['tapeStop', 'reverseHit'],
    effect_parameters: { brake_ms: 450 },
    steps: [
      { atBeats: -8, action: 'reverbOn', target: 'out', params: { wet: 0.3 }, label: 'Reverb d\'ambiance' },
      { atBeats: -2, action: 'tapeStop', target: 'out', params: { ms: 450 }, label: 'TAPE STOP — la musique s\'arrête comme une cassette' },
      { atBeats: -0.5, action: 'reverseHit', target: 'master', label: 'Impact inversé' },
      { atBeats: 0, action: 'playIn', target: 'in', params: { onDownbeat: 1 }, label: 'B démarre sur le 1' },
      { atBeats: 0, action: 'crossfade', target: 'master', params: { to: 1 }, label: 'Entrant seul' }
    ],
    automation: [],
    style_weights: { safe: 0.15, creative: 1.3, club: 0.9, aggressive: 0.9 },
    personality_affinity: { showman: 1.3, dynamic: 1.2, smooth: 0.9, afroclub: 0.9, technical: 0.9, hype: 0.9, groovy: 0.8 },
    ref_frequency: 0.06
  },

  // ---- MOVE_11 — RISER DROP ------------------------------------------------
  {
    id: 'RISER_DROP',
    name: 'Riser Drop',
    trigger: 'Le drop de l\'entrant est imparable — le préparer à grands renforts',
    duration_bars: 8,
    compatible_transition_types: ['D', 'F', 'H'],
    bpm_range: [80, 190],
    energy_before: 'mid', energy_after: 'high',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['riser', 'eq', 'impact', 'dropSwitch'],
    effect_parameters: { riser_beats: 12, impact_db: 1 },
    steps: [
      { atBeats: -16, action: 'eqLow', target: 'out', params: { db: -20 }, label: 'Retrait progressif des basses' },
      { atBeats: -12, action: 'riser', target: 'master', params: { beats: 11 }, label: 'RISER — la tension monte' },
      { atBeats: -12, action: 'filterHp', target: 'out', params: { to: 900 }, label: 'Filtre montant sur A' },
      { atBeats: -2, action: 'cut', target: 'out', label: 'A coupé (suspense maximal)' },
      { atBeats: -1, action: 'silence', target: 'master', params: { beats: 1 }, label: 'Silence — la salle retient son souffle' },
      { atBeats: 0, action: 'impact', target: 'master', label: 'IMPACT' },
      { atBeats: 0, action: 'playIn', target: 'in', params: { onDownbeat: 1 }, label: 'DROP — B à pleine puissance' },
      { atBeats: 0, action: 'crossfade', target: 'master', params: { to: 1 }, label: 'Entrant seul' }
    ],
    automation: [{ param: 'out_hpf', from: 100, to: 1200, overBeats: 12 }],
    style_weights: { safe: 0.2, creative: 1.0, club: 1.3, aggressive: 1.3 },
    personality_affinity: { hype: 1.5, showman: 1.4, dynamic: 1.3, afroclub: 1.1, technical: 1.0, groovy: 0.7, smooth: 0.5 },
    ref_frequency: 0.10
  },

  // ---- MOVE_12 — SILENCE IMPACT -------------------------------------------
  {
    id: 'SILENCE_IMPACT',
    name: 'Silence Impact',
    trigger: 'Peak de soirée — ponctuation maximale, un temps de silence total',
    duration_bars: 2,
    compatible_transition_types: ['F', 'H', 'E'],
    bpm_range: [80, 190],
    energy_before: 'high', energy_after: 'high',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['silence', 'impact'],
    effect_parameters: { silence_beats: 1 },
    steps: [
      { atBeats: -1, action: 'cut', target: 'out', label: 'A stoppé net en fin de phrase' },
      { atBeats: -1, action: 'silence', target: 'master', params: { beats: 1 }, label: 'SILENCE — un temps complet' },
      { atBeats: 0, action: 'impact', target: 'master', label: 'One-shot d\'impact' },
      { atBeats: 0, action: 'playIn', target: 'in', params: { onDownbeat: 1 }, label: 'B frappe sur le 1' },
      { atBeats: 0, action: 'crossfade', target: 'master', params: { to: 1 }, label: 'Entrant seul' }
    ],
    automation: [],
    style_weights: { safe: 0.1, creative: 0.8, club: 1.2, aggressive: 1.6 },
    personality_affinity: { hype: 1.6, showman: 1.5, dynamic: 1.2, afroclub: 1.0, technical: 0.8, groovy: 0.6, smooth: 0.2 },
    ref_frequency: 0.08
  },

  // ---- MOVE_13 — LONG BLEND -----------------------------------------------
  {
    id: 'LONG_BLEND',
    name: 'Long Blend',
    trigger: 'Longue partie instrumentale du sortant (mix harmonique confortable)',
    duration_bars: 24,
    compatible_transition_types: ['A', 'B'],
    bpm_range: [70, 160],
    energy_before: 'any', energy_after: 'any',
    vocal_condition: 'instrumental', phrase_condition: 'any',
    effects: ['crossfade', 'eq', 'reverb'],
    effect_parameters: { blend_bars: 24 },
    steps: [
      { atBeats: -48, action: 'playIn', target: 'in', label: 'Deck B lancé tôt (ambiance)' },
      { atBeats: -48, action: 'crossfade', target: 'master', params: { to: 0.3 }, label: 'Fondu doux entamé' },
      { atBeats: -32, action: 'reverbOn', target: 'out', params: { wet: 0.2 }, label: 'Reverb subtile sur A' },
      { atBeats: -32, action: 'crossfade', target: 'master', params: { to: 0.6 }, label: 'Les deux morceaux respirent ensemble' },
      { atBeats: -16, action: 'eqLow', target: 'out', params: { db: -16 }, label: 'Basses de A en retrait' },
      { atBeats: -8, action: 'eqLow', target: 'in', params: { db: 0 }, label: 'Basses de B en place' },
      { atBeats: 0, action: 'volume', target: 'out', params: { to: 0 }, label: 'A s\'éteint doucement' }
    ],
    automation: [{ param: 'xf', from: 0.2, to: 1, overBeats: 48 }],
    style_weights: { safe: 1.3, creative: 0.8, club: 0.8, aggressive: 0.2 },
    personality_affinity: { smooth: 1.6, groovy: 1.2, dynamic: 0.8, afroclub: 0.9, technical: 0.9, hype: 0.4, showman: 0.5 },
    ref_frequency: 0.15
  },

  // ---- MOVE_14 — PITCH BRIDGE ---------------------------------------------
  {
    id: 'PITCH_BRIDGE',
    name: 'Pitch Bridge',
    trigger: 'Écart de BPM important — le pitch fait le pont, l\'echo masque la jointure',
    duration_bars: 8,
    compatible_transition_types: ['E', 'F', 'H'],
    bpm_range: [70, 190],
    energy_before: 'any', energy_after: 'any',
    vocal_condition: 'any', phrase_condition: 'phraseEnd',
    effects: ['pitchRamp', 'echo', 'cut'],
    effect_parameters: { ramp_beats: 8 },
    steps: [
      { atBeats: -16, action: 'echoOn', target: 'out', params: { div: 1, feedback: 0.55, wet: 0.3 }, label: 'Echo discret posé' },
      { atBeats: -8, action: 'pitchRamp', target: 'out', params: { toPct: 5, beats: 6 }, label: 'Le pitch de A glisse (accélération musicale)' },
      { atBeats: -8, action: 'playIn', target: 'in', label: 'B entre au nouveau tempo' },
      { atBeats: -4, action: 'volume', target: 'out', params: { to: 0.4 }, label: 'A baisse' },
      { atBeats: 0, action: 'hardCut', target: 'out', label: 'Cut — jointure masquée par l\'écho' },
      { atBeats: 0, action: 'crossfade', target: 'master', params: { to: 1 }, label: 'Entrant seul' }
    ],
    automation: [{ param: 'out_pitch', from: 0, to: 5, overBeats: 6 }],
    style_weights: { safe: 0.5, creative: 1.0, club: 1.0, aggressive: 0.7 },
    personality_affinity: { technical: 1.4, smooth: 0.9, dynamic: 1.0, afroclub: 0.9, groovy: 0.9, hype: 0.8, showman: 0.8 },
    ref_frequency: 0.06
  }
];

/** Accès rapide par id. */
export const MOVE_BY_ID: Record<string, DjMove> =
  Object.fromEntries(DJ_MOVE_LIBRARY.map(m => [m.id, m]));

// ============================ OUTILS ============================

/** Générateur pseudo-aléatoire déterministe (mulberry32) — même plan + même seed = même performance. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Transformation en mesures selon la personnalité (blends plus ou moins longs). */
export const PERSONALITY_BLEND_FACTOR: Record<DjPersonality, number> = {
  smooth: 1.25, groovy: 1.1, afroclub: 1.0, hype: 0.75,
  dynamic: 1.0, technical: 0.9, showman: 0.85
};

/** Densité d'effets par personnalité (multiplicateur du nombre d'actions gardées). */
export const PERSONALITY_FX_DENSITY: Record<DjPersonality, number> = {
  smooth: 0.7, groovy: 0.85, afroclub: 1.0, hype: 1.15,
  dynamic: 1.0, technical: 1.1, showman: 1.25
};
