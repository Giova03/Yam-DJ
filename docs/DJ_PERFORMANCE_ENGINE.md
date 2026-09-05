# YAM DJ — DJ PERFORMANCE ENGINE (V2.4)

> « Le moteur ne doit jamais chercher un endroit où mettre un effet.
> Il doit chercher ce que la musique demande, puis choisir le geste DJ qui y répond. »

## 1. Ce que c'est

Une couche de **PERFORMANCE DJ LIVE** posée sur le moteur de mix existant
(sélection, beatmatch, courbe d'énergie, tonalités — inchangés). Le résultat
n'est plus une playlist enchaînée : c'est un **DJ virtuel derrière deux
platines**, qui écoute, anticipe les phrases, manipule les contrôles et
choisit ses effets au bon moment — en mesures, pas en secondes.

```
MUSIC → PHRASE → ENERGY → STRUCTURE → DJ MOVE → FX   (jamais l'inverse)
```

Fichiers :
| Fichier | Rôle |
|---|---|
| `dj-moves.ts` | Bibliothèque de 14 DJ Moves structurés + profil comportemental du mix de référence |
| `performance-engine.ts` | Décision : événements musicaux, scores de compatibilité, personnalité, variation, QC |
| `performance-player.ts` | Exécution temps réel : le scheduler des gestes sur les 2 decks (FX rack complet) |
| `dj-engine.ts` | (étendu) boucles explicites, spinback, vinyl brake, tape stop, gate/stutter, bus FX one-shots |
| `mix-analyzer.ts` | (étendu) proxy vocal (bande 300–3400 Hz) pour VOCAL_END / extraits teasables |

## 2. Analyse du mix de référence (déconstruction comportementale)

Source : **AFROBEAT ALL TIME BEST VIDEO MIX (26, 25, 24, 23) — AYRA STARR,
REMA, FIREBOY, ASAKE, BURNA BOY, WIZKID, KIZZ DANIEL**.

Méthode : **aucun audio, mélodie, voix ni transition exacte n'est copié.**
Seuls les *patterns de comportement* sont extraits (quand, combien de
mesures, quels effets, quel ordre, quels paramètres) afin d'être reproduits
avec n'importe quels morceaux. Conventions croisées avec les standards du
métier (phrase 8/16/32 mesures, queue d'écho 4–8 temps, rolls 4→2→1→½)
et les pratiques observées des mixes vidéo Naija/Afrobeats (zone 88–118 BPM,
transition tous les 95–150 s).

| Pattern observé | Traduction moteur |
|---|---|
| Les deux morceaux jouent ensemble 8–24 mesures (moy. ~16) | `blend_length` → durée paramétrique par move + personnalité |
| Echo sur fin de phrase vocale, queue 4–8 temps, feedback 55–75 % | `VOCAL_ECHO_EXIT` (echo 1/2 temps synchro BPM) |
| Kill de basses A (-20/-26 dB) juste avant le « 1 », relais B sur le « 1 » | `BASS_SWAP` / garde-fou anti-collision |
| Roll décroissant 4→2→1→½ temps + filtre + riser avant un drop | `LOOP_BUILD` (loopRoll à ancre fixe) |
| Backspin + 1 temps de silence + entrée pile sur le « 1 » | `BACKSPIN_IMPACT` (buffer inversé accéléré) |
| Extrait vocal de l'entrant teasé pendant un break | `VOCAL_TEASE` (proxy vocal → boucle 1–2 temps) |
| HPF montant 8–16 mesures, basses retirées, ouverture au drop | `FILTER_DROP` (sweep automatisé) |
| Coupure master d'exactement 1 temps au peak | `SILENCE_IMPACT` |
| Jamais le même enchaînement deux fois de suite | historique + pénalités de répétition + RNG déterministe |
| Énergie en vagues, hit majeur au pic | `RISER_DROP`/`DOUBLE_DROP` pondérés par position dans le mix |

Le profil chiffré complet vit dans `REFERENCE_ANALYSIS` (`dj-moves.ts`).

## 3. Les DJ Moves (bibliothèque réutilisable)

`VOCAL_ECHO_EXIT` · `BASS_SWAP` · `LOOP_BUILD` · `FILTER_DROP` ·
`BACKSPIN_IMPACT` · `VOCAL_TEASE` · `DOUBLE_DROP` · `STUTTER_EXIT` ·
`EQ_PERC_RELAY` · `REVERSE_BRAKE` · `RISER_DROP` · `SILENCE_IMPACT` ·
`LONG_BLEND` · `PITCH_BRIDGE`

Chaque move est stocké sous forme structurée :
```ts
{
  id, name, trigger, duration_bars,
  compatible_transition_types, bpm_range,
  energy_before, energy_after, vocal_condition, phrase_condition,
  effects[], effect_parameters{},
  steps[{ atBeats, action, target, params, label }],   // le geste, en TEMPS MUSICAL
  automation[], style_weights{safe,creative,club,aggressive},
  personality_affinity{}, ref_frequency
}
```

## 4. Le decision making

Pour chaque transition A→B, le moteur calcule :

```
transition_score = BPM + phrase + harmonique + énergie + vocal
                 + structure + drop_proximity + opportunité + fx_suitability
```

Poids modulés par : **style d'audace** (Safe/Creative/Club/Aggressive),
**personnalité** (Smooth/Groovy/Afroclub/Hype/Dynamic/Technical/Showman),
**variation** (pénalité −1.4 si répétition immédiate, plafond par fréquence
de référence), **position dans le mix** (early = posé, peak = percutant) et
un **RNG déterministe** → deux générations sur les mêmes morceaux ne
produisent pas le même mix.

**Règle de rejet** : si le meilleur score est trop faible (transition qui
paraîtrait « automatique »), la stratégie est rejetée et la 2e meilleure
approche est choisie.

## 5. Le raisonnement musical

Tout est positionné en **beats/mesures depuis le « 1 » de coupe**
(`atBeats` négatif = avant la coupe). Le moteur détecte :
`PHRASE_END` (grille 8/16/32), `VOCAL_END/START` (proxy vocal),
`DROP_INCOMING`, `BUILD_UP`, `BREAK`, `ENERGY_RISE/DROP`,
`DRUM_SECTION`, `INSTRUMENTAL_SECTION`, `OUTRO`. Les gestes sont
convertis en temps réel sur la **grille réelle du deck** (position mesurée,
BPM effectif, pitch d'asservissement).

## 6. Le rack FX exécutable

Echo (1/4, 1/2, 1, 2 temps, feedback, wet), reverb, filtre HP/LP avec sweep,
EQ/bass swap 3 bandes, flanger, gate/stutter (grille 1/16), loop, loop roll
(4→2→1→½→¼, ancre fixe), beat repeat, cut, hard cut, drop switch, vocal
loop, vocal tease, spinback (buffer inversé accéléré), vinyl brake, tape
stop, pitch ramp, riser, noise sweep, impact, siren, reverse hit, beat
jump, silence master — plus les one-shots **synthétisés procéduralement**
(aucun audio copié, bus FX → master → enregistrement).

## 7. Timeline de performance (les gestes du DJ)

Chaque geste exécuté est journalisé en direct :
```
0:44  DECK B   Deck B calé sur le même « 1 »
0:44  DECK B   Basses de B neutralisées
0:44  MASTER   Les deux morceaux frappent ensemble
0:53  DECK A   Basses de A en retrait
0:58  DECK B   B coupé 1 temps (suspense)
0:59  DECK B   Basses B reviennent
1:03  MASTER   DOUBLE DROP — les deux hits ensemble
```
Chaque action porte : horodatage, deck, action, paramètres, durée, courbe,
raison. Le plan de mix affiche les moves choisis (nom, mesures, score, raison)
et le rapport QC.

## 8. Contrôle qualité (avant lecture)

Transitions sur phrases · aucune répétition immédiate · effets non
surutilisés (≤ 14 gestes/transition) · aucune collision de basses (kill de
sécurité si blend long sans relais) · drops préparés · courbe d'énergie
cohérente. Un garde-fou anti-collision de basses est posé à l'exécution
même si le plan l'avait omis.

## 9. Enregistrement + écoute hors ligne

- L'enregistrement du mix est **actif par défaut** (MediaRecorder, master
  complet avec les FX).
- À la fin du mix, le fichier est **sauvegardé automatiquement** dans
  IndexedDB (`yam-mixes`) → section **« Mes mixes hors ligne »** du studio :
  lecture hors ligne (MediaSession), **téléchargement** du fichier audio
  (lecture sur n'importe quel appareil), suppression.
- La publication en mixtape reste disponible comme avant.
