package com.yamdj.controller;

import com.yamdj.service.AnalyticsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Analytics produit (V1.1) : funnel artiste + KPI North Star.
 * POST public (liste blanche stricte des evenements, userId optionnel) —
 * les visiteurs non connectes comptent aussi (landing_view, plays...).
 */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    /** Enregistrement d'un evenement du funnel (fire-and-forget cote client). */
    @PostMapping("/event")
    public ResponseEntity<Void> event(@RequestBody EventRequest body) {
        UUID userId = null;
        try {
            userId = analyticsService.currentUserOpt();
        } catch (Exception ignored) {
            // Anonyme : compte quand meme
        }
        analyticsService.record(body.name(), userId, body.metadata());
        return ResponseEntity.ok().build();
    }

    public record EventRequest(String name, String metadata) {}
}
