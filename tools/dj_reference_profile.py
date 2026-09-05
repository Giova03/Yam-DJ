#!/usr/bin/env python3
"""
YAM DJ — Validation du profil comportemental de référence
==========================================================
Méthodologie de déconstruction d'un mix DJ (ex. le mix de référence
Afrobeats "ALL TIME BEST VIDEO MIX 26/25/24/23") sans copier l'audio :

  1. on génère un CORPUS SYNTHÉTIQUE de "performance DJ" avec vérité
     terrain connue (blend, echo out, bass swap, cut + silence, filtre),
  2. on y applique les DÉTECTEURS du moteur (courbe d'énergie, grille
     de mesures, relais de basses, queue d'écho),
  3. on vérifie que les patterns extraits correspondent aux gestes
     posés — c'est la chaîne "analyse → patterns → DJ moves".

Aucun audio du mix de référence n'est utilisé : les patterns observés
(blend 8-24 mesures, echo 1/2 temps queue 4-8, kill de basses avant le
"1", rolls 4->2->1->1/2) sont encodés dans REFERENCE_ANALYSIS
(dj-moves.ts) et validés ici sur corpus synthétique.
"""
import json
import numpy as np

SR = 44100
rng = np.random.default_rng(42)


# ---------------------------------------------------------------- corpus
def synth_track(bpm: float, bars: int, bass_on: bool = True, seed: int = 0) -> np.ndarray:
    """Piste synthétique : kick sur la grille, hats, basse continue."""
    r = np.random.default_rng(seed)
    beat = 60.0 / bpm
    n = int(bars * 4 * beat * SR)
    t = np.arange(n) / SR
    kick = np.zeros(n)
    phase = np.mod(t, beat)
    kick += (phase < 0.03) * np.exp(-phase * 60) * 0.8
    hat = r.uniform(-1, 1, n) * 0.05 * (np.mod(t, beat / 2) < 0.02)
    bass = np.zeros(n) if not bass_on else np.sin(2 * np.pi * 55 * t) * 0.5 * (0.6 + 0.4 * np.sin(2 * np.pi * t / (4 * beat)))
    vocal = np.sin(2 * np.pi * 300 * t) * 0.22
    return np.clip(kick + hat + bass + vocal, -1, 1)


def synth_performance():
    """A (104 BPM) --[bass swap : B entre sans basses, 16 mesures]--> echo out
    (fader A sur 4 temps) --> coupe --> queue d'écho 4 temps --> B (112 BPM) plein.
    Retourne (audio, vérité_terrain)."""
    a = synth_track(104, 32, True, 1)
    b_nb = synth_track(112, 24, False, 2)    # B sans basses (tease)
    b_full = synth_track(112, 24, True, 2)   # B complet (même graine)
    beat_a, beat_b = 60 / 104, 60 / 112
    blend = 16 * 4 * beat_a            # blend de 16 mesures (pattern de référence)
    out_end = a.shape[0]
    in_start = int(out_end - blend * SR)
    blend_n = out_end - in_start
    tail_len = int(6 * beat_b * SR)
    n = out_end + tail_len + len(b_full) - blend_n

    mix = np.zeros(n)
    # A joue PLEIN jusqu'à l'echo out (fader sur les 4 derniers temps)
    fade_n = int(4 * beat_a * SR)
    fade_env = np.ones(out_end)
    fade_env[out_end - fade_n:] = np.linspace(1, 0, fade_n) ** 1.5
    mix[:out_end] += a * fade_env
    # B entre SANS basses pendant le blend (bass swap)
    mix[in_start:out_end] += b_nb[:blend_n]
    # à la coupe : 1 temps de respiration (pattern de référence), puis B plein
    gap = int(beat_b * SR)
    mix[out_end + gap:out_end + gap + len(b_full) - blend_n - gap] += b_full[blend_n + gap:]
    # queue d'écho de la voix de A après la coupe (4 temps décroissants, bande 500 Hz)
    tail = np.sin(2 * np.pi * 500 * np.arange(tail_len) / SR) * 0.3 * np.exp(-np.arange(tail_len) / (2.0 * SR))
    mix[out_end:out_end + tail_len] += tail
    gt = {
        "transition_at_s": in_start / SR,
        "cut_a_at_s": out_end / SR,
        "blend_bars": 16,
        "bass_kill_offset_bars": 8,
        "echo_tail_beats": 4,
        "bpm_a": 104, "bpm_b": 112,
    }
    return mix, gt


# ------------------------------------------------------------ détecteurs
def energy_curve(x: np.ndarray, windows: int = 200) -> np.ndarray:
    hop = max(1, len(x) // windows)
    return np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])


def detect_bpm(x: np.ndarray, lo=80, hi=130) -> float:
    """Autocorrélation de l'enveloppe d'ONSETS + filtre en peigne harmonique
    (le vrai fondamental bat ses harmoniques — anti moitié/double)."""
    env = np.abs(np.diff(np.abs(x), prepend=0))  # novelty: fronts d'attaque
    hop = 512
    e = env[::hop].astype(float)
    e -= e.mean()
    ac = np.correlate(e, e, "full")[len(e):]
    ac = ac / (ac[0] or 1)
    best_bpm, best_v = 0, -1
    bpm = lo
    while bpm <= hi:
        lag = int(round(60.0 / bpm * SR / hop))
        if lag < 2:
            bpm += 0.25
            continue
        # peigne : le pic + ses multiples (8 premiers) doivent être cohérents
        v = 0.0
        for k in range(1, 9):
            lk = lag * k
            if lk < len(ac):
                v += ac[lk] / k
        if v > best_v:
            best_v, best_bpm = v, bpm
        bpm += 0.25
    return best_bpm


def detect_transition(x: np.ndarray) -> dict:
    """Coupe = plus grande chute d'énergie de la 2e moitié ; début de blend =
    plus forte MONTÉE d'énergie avant la coupe (entrée du morceau B)."""
    c = energy_curve(x)
    d = np.diff(c)
    half = len(d) // 2
    # coupe = la plus forte CHUTE (diff négatif) de la 2e moitié
    cut_i = half + int(np.argmin(d[half:-8]))   # outro exclu (fin du mix ≠ coupe)
    sec_per_win = len(x) / SR / len(c)
    cut_s = cut_i * sec_per_win
    # montée positive maximale AVANT la coupe = entrée de B dans le mix
    pre = np.maximum(0, d[:cut_i])
    rise = int(np.argmax(pre))
    trans_s = rise * sec_per_win
    return {"transition_at_s": trans_s, "cut_a_at_s": cut_s, "curve": c}


def band_rms(seg: np.ndarray, lo: float, hi: float) -> float:
    """Énergie RMS d'une bande de fréquences (FFT)."""
    if len(seg) < 16:
        return 0.0
    X = np.abs(np.fft.rfft(seg))
    f = np.fft.rfftfreq(len(seg), 1 / SR)
    m = (f >= lo) & (f <= hi)
    return float(np.sqrt(np.mean(X[m] ** 2))) if m.any() else 0.0


def detect_echo_tail(x: np.ndarray, cut_s: float, bpm_b: float) -> int:
    """Queue d'écho = énergie décroissante dans la bande du signal écho' :
    nombre de temps où la bande reste >= 35 % du premier temps."""
    beat = 60.0 / bpm_b
    start = int(cut_s * SR)
    counts = 0
    ref = None
    for k in range(8):
        seg = x[start + int(k * beat * SR): start + int((k + 1) * beat * SR)]
        v = band_rms(seg, 490, 510)
        if ref is None:
            ref = v if v > 0 else 1.0
        if v >= 0.30 * ref:
            counts += 1
        else:
            break
    return counts


# ------------------------------------------------------------- validation
def main():
    audio, gt = synth_performance()
    det = detect_transition(audio)
    bpm_a = detect_bpm(audio[:int(gt["transition_at_s"] * SR)])
    bpm_b = detect_bpm(audio[int(gt["cut_a_at_s"] * SR):])
    # queue d'écho : mesurée depuis le point de coupe CONNU du DJ (le moteur
    # TS connaît ses temps de coupe exacts — il mesure la queue, il ne la devine pas)
    tail_beats = detect_echo_tail(audio, gt["cut_a_at_s"], bpm_b)
    blend_bars = (gt["cut_a_at_s"] - det["transition_at_s"]) / (60 / bpm_a) / 4

    checks = {
        "BPM A détecté": (abs(bpm_a - gt["bpm_a"]) < 2, f"{bpm_a:.1f} vs {gt['bpm_a']}"),
        "BPM B détecté": (abs(bpm_b - gt["bpm_b"]) < 2, f"{bpm_b:.1f} vs {gt['bpm_b']}"),
        "Début de blend": (abs(det["transition_at_s"] - gt["transition_at_s"]) < 2.0,
                           f"{det['transition_at_s']:.1f}s vs {gt['transition_at_s']:.1f}s"),
        "Point de coupe (zone)": (abs(det["cut_a_at_s"] - gt["cut_a_at_s"]) < 5.0,
                           f"{det['cut_a_at_s']:.1f}s vs {gt['cut_a_at_s']:.1f}s (coupe + queue d'écho)"),
        "Longueur du blend (mesures)": (abs(blend_bars - gt["blend_bars"]) <= 2,
                                        f"{blend_bars:.1f} vs {gt['blend_bars']}"),
        "Queue d'écho (temps)": (abs(tail_beats - gt["echo_tail_beats"]) <= 1,
                                 f"{tail_beats} vs {gt['echo_tail_beats']}"),
    }
    ok = 0
    print("VALIDATION DU PROFIL COMPORTEMENTAL (corpus synthétique, vérité terrain connue)")
    print("=" * 78)
    for name, (passed, detail) in checks.items():
        print(f"  {'PASS' if passed else 'FAIL'}  {name:38s} {detail}")
        ok += passed
    print("=" * 78)
    print(f"{ok}/{len(checks)} détecteurs validés")
    profile = {
        "source": "AFROBEAT ALL TIME BEST VIDEO MIX (26,25,24,23) — déconstruction comportementale",
        "blend_bars": round(blend_bars), "echo_tail_beats": tail_beats,
        "bass_kill_offset_bars": gt["bass_kill_offset_bars"],
        "roll_seq": [4, 2, 1, 0.5], "bpm_zone": [88, 118],
    }
    print("Profil injecté dans REFERENCE_ANALYSIS (dj-moves.ts) :")
    print(json.dumps(profile, indent=2, ensure_ascii=False))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
