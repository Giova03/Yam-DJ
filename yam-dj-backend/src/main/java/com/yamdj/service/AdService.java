package com.yamdj.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Publicite non intrusive (Phase 3.5) : un jingle sponsorise court
 * (15 s max) diffuse entre les pistes pour les auditeurs NON premium.
 *
 * Regles cahier des charges :
 *   - jamais pour les abonnes Premium Fan
 *   - frequence limitee (1 pub toutes les N pistes, pas en boucle)
 *   - pas de coupure au milieu d'un morceau (uniquement entre 2 pistes)
 *   - le Data-Lite met la pub en pause automatique cote lecteur
 *
 * Configuration par variables d'environnement (feature flag simple) :
 *   yamdj.ads.enabled (defaut true), yamdj.ads.interval-tracks (defaut 3),
 *   yamdj.ads.max-duration-sec (defaut 15).
 * Le fichier audio du jingle est un asset frontend
 * (assets/audio/ad-jingle.mp3, remplaçable par un vrai sponsor).
 */
@Service
public class AdService {

    @Value("${yamdj.ads.enabled:true}")
    private boolean enabled;

    @Value("${yamdj.ads.interval-tracks:3}")
    private int intervalTracks;

    @Value("${yamdj.ads.max-duration-sec:15}")
    private int maxDurationSec;

    @Value("${yamdj.ads.text:Ecoute offerte par un sponsor — passe Premium pour zero pub}")
    private String text;

    /** Configuration consommee par le lecteur frontend (endpoint public). */
    public Map<String, Object> config() {
        return Map.of(
                "enabled", enabled,
                "intervalTracks", Math.max(1, intervalTracks),
                "maxDurationSec", Math.max(5, Math.min(30, maxDurationSec)),
                "text", text,
                "audioUrl", "/assets/audio/ad-jingle.mp3"
        );
    }

    public boolean enabled() {
        return enabled;
    }
}
