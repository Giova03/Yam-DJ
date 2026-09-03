package com.yamdj.service;

import com.yamdj.entity.AnalyticsEvent;
import com.yamdj.repository.AnalyticsEventRepository;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Analytics produit (V1.1) — directive marketing/data de l'equipe.
 *
 * Repond avec des chiffres a : "Pourquoi les artistes ne publient-ils pas ?"
 * Funnel : landing_view -> artist_cta_click -> signup_started ->
 * signup_completed -> upload_started -> upload_completed -> track_published.
 *
 * KPI North Star : Published Artists (artistes avec >= 1 piste APPROVED),
 * pas le nombre d'inscriptions.
 */
@Service
public class AnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsService.class);

    /** Liste blanche stricte : la table n'est pas un journal libre. */
    private static final Set<String> ALLOWED = Set.of(
            "landing_view", "artist_cta_click",
            "signup_started", "signup_completed", "email_verified",
            "artist_profile_created",
            "upload_started", "upload_completed", "processing_started",
            "processing_completed", "track_published", "track_failed",
            "track_played", "track_shared", "artist_followed",
            "mixtape_created", "playlist_created", "premium_subscribed"
    );

    private final AnalyticsEventRepository eventRepository;
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;

    public AnalyticsService(AnalyticsEventRepository eventRepository,
                            TrackRepository trackRepository,
                            UserRepository userRepository) {
        this.eventRepository = eventRepository;
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
    }

    /** Enregistre un evenement (anonyme ou connecte). Ignore les noms inconnus. */
    @Transactional
    public void record(String eventName, UUID userId, String metadata) {
        if (eventName == null || !ALLOWED.contains(eventName)) {
            log.debug("Evenement analytics rejete (hors liste blanche) : {}", eventName);
            return;
        }
        eventRepository.save(AnalyticsEvent.builder()
                .eventName(eventName)
                .userId(userId)
                .metadata(metadata != null && metadata.length() > 300
                        ? metadata.substring(0, 300) : metadata)
                .build());
    }

    /** Utilisateur connecte (null si anonyme). */
    public UUID currentUserOpt() {
        try {
            var auth = org.springframework.security.core.context.SecurityContextHolder
                    .getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated()
                    || "anonymousUser".equals(auth.getPrincipal())) {
                return null;
            }
            return userRepository.findByEmailIgnoreCase(auth.getName())
                    .map(com.yamdj.entity.User::getId).orElse(null);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Tableau de bord admin : funnel + KPI North Star (30 derniers jours).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> summary() {
        LocalDateTime since = LocalDateTime.now().minusDays(30);

        Map<String, Object> funnel = new HashMap<>();
        for (Object[] row : eventRepository.countsSince(since)) {
            funnel.put((String) row[0], row[1]);
        }

        // KPI North Star : artistes distincts avec >= 1 piste APPROVED
        long publishedArtists = trackRepository.countPublishedArtists();
        long totalUsers = userRepository.count();

        Map<String, Object> result = new HashMap<>();
        result.put("northStar", Map.of(
                "publishedArtists", publishedArtists,
                "definition", "Artistes avec au moins 1 piste APPROVED"
        ));
        result.put("last30Days", funnel);
        result.put("totalUsers", totalUsers);
        result.put("activeListeners30d", eventRepository.activeListenersSince(since));
        return result;
    }
}
