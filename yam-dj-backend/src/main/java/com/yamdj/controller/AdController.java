package com.yamdj.controller;

import com.yamdj.service.AdService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Publicite non intrusive (Phase 3.5) : configuration publique consommee
 * par le lecteur frontend. Le lecteur applique lui-meme les regles :
 * jamais pour les Premium, 1 jingle toutes les N pistes, jamais au
 * milieu d'un morceau, pause auto en mode Data-Lite.
 */
@RestController
@RequestMapping("/api/ads")
public class AdController {

    private final AdService adService;

    public AdController(AdService adService) {
        this.adService = adService;
    }

    @GetMapping("/config")
    public ResponseEntity<Map<String, Object>> config() {
        return ResponseEntity.ok(adService.config());
    }
}
