package com.yamdj.controller;

import com.yamdj.dto.DjDtos.*;
import com.yamdj.service.DjService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Espace DJ : studio, Auto-Mix IA, mixtapes.
 */
@RestController
@RequestMapping("/api/dj")
public class DjController {

    private final DjService djService;

    public DjController(DjService djService) {
        this.djService = djService;
    }

    /** Bibliotheque du studio : pistes approuvees avec BPM/tonalite. */
    @GetMapping("/studio-library")
    public ResponseEntity<List<com.yamdj.dto.TrackDtos.TrackResponse>> studioLibrary(
            @RequestParam(required = false) String genre,
            @RequestParam(required = false) String country,
            @RequestParam(defaultValue = "100") int limit) {
        return ResponseEntity.ok(djService.studioLibrary(genre, country, limit));
    }

    /** Suggestion Auto-Mix IA : ordonnancement Camelot + BPM. */
    @PostMapping("/auto-mix")
    public ResponseEntity<AutoMixSuggestion> autoMix(@RequestBody AutoMixRequest request) {
        List<UUID> trackIds = request.trackIds();
        if (trackIds == null || trackIds.isEmpty()) {
            throw new IllegalArgumentException("Liste trackIds requise");
        }
        return ResponseEntity.ok(djService.suggestAutoMix(trackIds));
    }

    @PostMapping("/create-mixtape")
    public ResponseEntity<MixtapeResponse> createMixtape(@Valid @RequestBody CreateMixtapeRequest request) {
        return ResponseEntity.ok(djService.createMixtape(request));
    }

    /**
     * PUBLICATION D'UN MIX ENREGISTRE EN DIRECT depuis le Studio DJ
     * (MediaRecorder navigateur : webm/opus ou mp4/aac). Le fichier est
     * transcode en MP3 192 kbps cote serveur (compatibilite universelle),
     * stocke de facon durable puis publie comme mixtape du DJ.
     */
    @PostMapping(value = "/mixtapes/upload", consumes = "multipart/form-data")
    public ResponseEntity<MixtapeResponse> uploadMixtape(
            @org.springframework.web.bind.annotation.RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @org.springframework.web.bind.annotation.RequestParam(value = "title", required = false) String title,
            @org.springframework.web.bind.annotation.RequestParam(value = "priceXof", required = false) Integer priceXof,
            @org.springframework.web.bind.annotation.RequestParam(value = "durationSec", defaultValue = "0") int durationSec) {
        return ResponseEntity.ok(djService.uploadMixtape(file, title, priceXof, durationSec));
    }

    @GetMapping("/my-mixtapes")
    public ResponseEntity<List<MixtapeResponse>> myMixtapes() {
        return ResponseEntity.ok(djService.myMixtapes());
    }

    /** Bibliotheque du fan : mixtapes payantes achetees (boutique 3.4). */
    @GetMapping("/mixtapes/purchased")
    public ResponseEntity<List<MixtapeResponse>> myPurchasedMixtapes() {
        return ResponseEntity.ok(djService.myPurchasedMixtapes());
    }

    @GetMapping("/mixtapes/{id}/stream")
    public ResponseEntity<Map<String, String>> streamMixtape(@PathVariable UUID id) {
        return ResponseEntity.ok(Map.of("url", djService.mixtapeStreamUrl(id)));
    }

    @PostMapping("/mixtapes/{id}/play")
    public ResponseEntity<Void> playMixtape(@PathVariable UUID id) {
        djService.registerMixtapePlay(id);
        return ResponseEntity.ok().build();
    }

    /** Supprime une mixtape (DJ proprietaire ou ADMIN). */
    @DeleteMapping("/mixtapes/{id}")
    public ResponseEntity<Void> deleteMixtape(@PathVariable UUID id) {
        djService.deleteMixtape(id);
        return ResponseEntity.noContent().build();
    }
}
