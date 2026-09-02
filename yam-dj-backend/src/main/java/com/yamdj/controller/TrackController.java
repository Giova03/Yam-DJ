package com.yamdj.controller;

import com.yamdj.dto.TrackDtos.*;
import com.yamdj.dto.CommonDtos;
import com.yamdj.entity.User;
import com.yamdj.service.TrackService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Pistes : feed, recherche, streaming, upload (artistes), plays, likes.
 */
@RestController
@RequestMapping("/api/tracks")
public class TrackController {

    private final TrackService trackService;

    public TrackController(TrackService trackService) {
        this.trackService = trackService;
    }

    @GetMapping
    public ResponseEntity<TrackPageResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false, defaultValue = "all") String genre,
            @RequestParam(required = false, defaultValue = "all") String country,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(trackService.search(q, genre, country, page, size));
    }

    @GetMapping("/feed")
    public ResponseEntity<List<TrackResponse>> feed(@RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(trackService.feed(limit));
    }

    @GetMapping("/trending")
    public ResponseEntity<List<TrackResponse>> trending(@RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(trackService.trending(limit));
    }

    @GetMapping("/latest")
    public ResponseEntity<List<TrackResponse>> latest(@RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(trackService.latest(limit));
    }

    @GetMapping("/for-you")
    public ResponseEntity<List<TrackResponse>> forYou(@RequestParam(defaultValue = "20") int limit) {
        Authentication auth = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        String email = (auth != null && auth.isAuthenticated()
                && !auth.getPrincipal().equals("anonymousUser")) ? auth.getName() : null;
        if (email == null) {
            return ResponseEntity.ok(trackService.feed(limit));
        }
        UUID userId = trackService.currentUser().getId();
        return ResponseEntity.ok(trackService.recommendedForYou(userId, limit));
    }

    @GetMapping("/history")
    public ResponseEntity<List<TrackResponse>> history(@RequestParam(defaultValue = "50") int limit) {
        UUID userId = trackService.currentUser().getId();
        return ResponseEntity.ok(trackService.history(userId, limit));
    }

    /** Pistes de l'artiste connecte (tous statuts : PENDING / APPROVED / REJECTED). */
    @GetMapping("/mine")
    public ResponseEntity<List<TrackResponse>> mine() {
        return ResponseEntity.ok(trackService.myTracks());
    }

    @GetMapping("/{id}")
    public ResponseEntity<TrackResponse> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(trackService.getById(id));
    }

    /** Suppression d'une piste : artiste proprietaire ou administrateur (204). */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        trackService.deleteTrack(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/artist/{artistId}")
    public ResponseEntity<List<TrackResponse>> byArtist(@PathVariable UUID artistId) {
        return ResponseEntity.ok(trackService.byArtist(artistId));
    }

    /** URL de stream selon la qualite (hq | lite) — Mode Data-Lite cote client. */
    @GetMapping("/{id}/stream")
    public ResponseEntity<Map<String, String>> stream(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "hq") String quality) {
        return ResponseEntity.ok(Map.of("url", trackService.streamUrl(id, quality)));
    }

    @PostMapping("/{id}/play")
    public ResponseEntity<Void> play(@PathVariable UUID id,
                                     @Valid @RequestBody(required = false) PlayRequest body) {
        String quality = (body != null && body.quality() != null) ? body.quality() : "hq";
        UUID userId = null;
        try {
            userId = trackService.currentUser().getId();
        } catch (Exception ignored) {
            // Ecoute anonyme autorisee
        }
        trackService.registerPlay(id, userId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/like")
    public ResponseEntity<LikeResponse> like(@PathVariable UUID id, Authentication auth) {
        UUID userId = null;
        if (auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getPrincipal())) {
            userId = trackService.currentUser().getId();
        }
        return ResponseEntity.ok(trackService.like(id, userId));
    }

    @PostMapping("/{id}/download")
    public ResponseEntity<Void> download(@PathVariable UUID id) {
        trackService.incrementDownload(id);
        return ResponseEntity.ok().build();
    }

    // ================== VAGUE 2 : YAM RADIO + PARTAGE IN-APP ==================

    /** YAM RADIO : suite aleatoire infinie par genre et/ou pays. */
    @GetMapping("/radio")
    public ResponseEntity<List<TrackResponse>> radio(
            @RequestParam(required = false, defaultValue = "all") String genre,
            @RequestParam(required = false, defaultValue = "all") String country,
            @RequestParam(defaultValue = "12") int limit) {
        return ResponseEntity.ok(trackService.radio(genre, country, limit));
    }

    /** Envoi d'une piste a un ami YAM DJ (par pseudo) + notification. */
    @PostMapping("/{id}/share")
    public ResponseEntity<Map<String, Object>> share(@PathVariable UUID id,
                                                     @Valid @RequestBody CommonDtos.ShareRequest body) {
        User me = trackService.currentUser();
        trackService.shareTrack(me.getId(), id, body.toPseudo(), body.message());
        return ResponseEntity.ok(Map.of("message",
                "Son envoye a " + body.toPseudo() + " — il recevra une notification"));
    }

    /** Upload d'une piste (artistes uniquement) : audio + pochette. */
    @PostMapping("/upload")
    public ResponseEntity<TrackResponse> upload(
            @RequestParam("title") String title,
            @RequestParam(value = "genre", required = false) String genre,
            @RequestParam(value = "country", required = false) String country,
            @RequestParam(value = "musicalKey", required = false) String musicalKey,
            @RequestParam(value = "bpm", required = false) Integer bpm,
            @RequestParam("audio") MultipartFile audio,
            @RequestParam(value = "cover", required = false) MultipartFile cover) {
        return ResponseEntity.ok(trackService.uploadTrack(
                title, genre, country, musicalKey, audio, cover, bpm));
    }
}
