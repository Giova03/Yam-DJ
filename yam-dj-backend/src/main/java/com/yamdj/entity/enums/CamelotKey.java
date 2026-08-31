package com.yamdj.entity.enums;

/**
 * Camelot Wheel : compatibilite harmonique pour l'Auto-Mix IA.
 * Deux pistes sont harmoniquement compatibles si leurs codes Camelot
 * sont identiques, adjacents (+-1 meme lettre) ou memes chiffres lettres voisines.
 */
public enum CamelotKey {
    C1A("1A"), C1B("1B"), C2A("2A"), C2B("2B"), C3A("3A"), C3B("3B"),
    C4A("4A"), C4B("4B"), C5A("5A"), C5B("5B"), C6A("6A"), C6B("6B"),
    C7A("7A"), C7B("7B"), C8A("8A"), C8B("8B"), C9A("9A"), C9B("9B"),
    C10A("10A"), C10B("10B"), C11A("11A"), C11B("11B"), C12A("12A"), C12B("12B");

    private final String code;

    CamelotKey(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static CamelotKey fromCode(String code) {
        if (code == null || code.isBlank()) return null;
        String normalized = code.trim().toUpperCase();
        for (CamelotKey k : values()) {
            if (k.code.equals(normalized)) return k;
        }
        return null;
    }

    /** Nombre du code Camelot (1 a 12). */
    public int number() {
        return Integer.parseInt(code.replaceAll("[AB]", ""));
    }

    /** Lettre du code Camelot (A = mineur, B = majeur). */
    public char letter() {
        return code.charAt(code.length() - 1);
    }
}
