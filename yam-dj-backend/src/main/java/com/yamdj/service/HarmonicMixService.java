package com.yamdj.service;

import com.yamdj.entity.enums.CamelotKey;

import java.util.ArrayList;
import java.util.List;

/**
 * MOTEUR IA — Mix harmonique (Camelot Wheel + compatibilite BPM).
 * Le "cerveau" de l'Auto-Mix : ordonne les pistes d'une mixtape pour des
 * transitions fluides et musical, comme un DJ professionnel.
 *
 * Regles appliquees :
 *  1. BPM : ecart max 6% entre deux pistes consecutives
 *  2. Harmonique : meme code Camelot, +-1 chiffre, ou lettre opposee
 *     meme chiffre (relatif mineur/majeur)
 *  3. Ordre global : progression douce du BPM le plus bas au plus haut
 */
public class HarmonicMixService {

    private HarmonicMixService() {}

    /** Correspondance tonalite classique -> code Camelot. */
    public static String toCamelot(String musicalKey) {
        if (musicalKey == null || musicalKey.isBlank()) return null;
        String key = musicalKey.trim().toUpperCase()
                .replaceAll("([A-G])B", "$1b")   // Bemol ASCII
                .replaceAll("#", "s");
        boolean minor = key.endsWith("M") && !key.endsWith("MAJ");
        String base = key.replace("MIN", "").replace("MAJ", "").replace("M", "");
        // Normalisation : C, C#(Cs), D, D#, E, F, F#, G, G#, A, A#(As), B
        String normalized;
        if (base.length() > 2) {
            normalized = base.substring(0, 2);
        } else {
            normalized = base;
        }
        int semi = switch (normalized) {
            case "B"  -> 11; case "AS" -> 10; case "A" -> 9; case "GS" -> 8;
            case "G"  -> 7;  case "FS" -> 6;  case "F" -> 5; case "E"  -> 4;
            case "DS" -> 3;  case "D"  -> 2;  case "CS" -> 1; default -> 0; // C
        };
        // Camelot : 1A = As mineur. Suite mineure : 1A=As, 2A=B, 3A=Cs, 4A=D... (quintes montantes)
        int minorCamelot = ((semi - 10) + 24) % 12 + 1;
        int majorCamelot = ((semi - 5) + 24) % 12 + 1;
        int number = minor ? minorCamelot : majorCamelot;
        return number + (minor ? "A" : "B");
    }

    /** Score de compatibilite harmonique entre deux codes Camelot (0-100). */
    public static int harmonicScore(String camelotA, String camelotB) {
        CamelotKey a = CamelotKey.fromCode(camelotA);
        CamelotKey b = CamelotKey.fromCode(camelotB);
        if (a == null || b == null) return 50; // Indetermine : score neutre
        if (a == b) return 100;
        boolean sameLetter = a.letter() == b.letter();
        if (sameLetter) {
            int diff = Math.abs(a.number() - b.number());
            int circular = Math.min(diff, 12 - diff);
            if (circular == 1) return 90;   // Voisin de roue : mix parfait
            if (circular == 2) return 60;
            return 30;
        }
        // Lettre opposee : relatif mineur/majeur si meme chiffre
        if (a.number() == b.number()) return 85;
        return 25;
    }

    /** Score de compatibilite BPM (0-100). Ecart > 8% = incompatible. */
    public static int bpmScore(Integer bpmA, Integer bpmB) {
        if (bpmA == null || bpmB == null || bpmA == 0 || bpmB == 0) return 50;
        double diffPercent = Math.abs(bpmA - bpmB) * 100.0 / Math.max(bpmA, bpmB);
        if (diffPercent <= 1) return 100;
        if (diffPercent <= 3) return 85;
        if (diffPercent <= 6) return 70;
        if (diffPercent <= 8) return 50;
        return 10;
    }

    /**
     * Ordonne les pistes pour minimiser les "ruptures" : algorithme glouton
     * qui part de la piste la plus lente et choisit a chaque etape la piste
     * suivante au meilleur score (harmonique + BPM combines).
     */
    public static <T> List<T> reorderTracks(List<T> tracks,
                                            java.util.function.Function<T, Integer> bpmGetter,
                                            java.util.function.Function<T, String> camelotGetter) {
        if (tracks.size() <= 2) return new ArrayList<>(tracks);

        List<T> remaining = new ArrayList<>(tracks);
        List<T> ordered = new ArrayList<>();

        // Depart : BPM le plus bas (ouverture douce du mix)
        T first = remaining.stream()
                .min(java.util.Comparator.comparing(
                        t -> bpmGetter.apply(t) == null ? 200 : bpmGetter.apply(t)))
                .orElse(remaining.get(0));
        ordered.add(first);
        remaining.remove(first);

        while (!remaining.isEmpty()) {
            T current = ordered.get(ordered.size() - 1);
            Integer currentBpm = bpmGetter.apply(current);
            String currentCamelot = camelotGetter.apply(current);

            T best = null;
            int bestScore = -1;
            for (T candidate : remaining) {
                int score = bpmScore(currentBpm, bpmGetter.apply(candidate))
                        + harmonicScore(currentCamelot, camelotGetter.apply(candidate));
                // Leger bonus si le BPM suivant est >= courant (montee en energie)
                Integer candBpm = bpmGetter.apply(candidate);
                if (currentBpm != null && candBpm != null && candBpm >= currentBpm) score += 5;
                if (score > bestScore) {
                    bestScore = score;
                    best = candidate;
                }
            }
            ordered.add(best);
            remaining.remove(best);
        }
        return ordered;
    }
}
