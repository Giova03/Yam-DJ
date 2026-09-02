package com.yamdj.controller;

import com.yamdj.entity.User;
import com.yamdj.repository.UserRepository;
import com.yamdj.service.TrackService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Profil utilisateur courant (interne). Retourne pseudo, role, country.
 */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final TrackService trackService;
    private final UserRepository userRepository;

    public MeController(TrackService trackService, UserRepository userRepository) {
        this.trackService = trackService;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> me() {
        User user = trackService.currentUser();
        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "pseudo", user.getPseudo(),
                "role", user.getRole().name(),
                "country", user.getCountry(),
                "avatarUrl", user.getAvatarUrl() == null ? "" : user.getAvatarUrl(),
                "emailVerified", user.isEmailVerified(),
                "premium", com.yamdj.service.PremiumService.isPremium(user),
                "premiumUntil", user.getPremiumUntil() == null ? "" : user.getPremiumUntil().toString()));
    }

    /** Pistes aimees par l'utilisateur connecte (plus recentes d'abord). */
    @GetMapping("/likes")
    public ResponseEntity<List<com.yamdj.dto.TrackDtos.TrackResponse>> myLikes(
            @RequestParam(defaultValue = "50") int limit) {
        User user = trackService.currentUser();
        return ResponseEntity.ok(trackService.likedTracks(user.getId(), Math.min(limit, 100)));
    }

    // ============= VAGUE 2 : sync hors ligne, reprise, partages recus =============

    /** SYNC HORS LIGNE : applique les ecoutes accumulees sans reseau. */
    @PostMapping("/plays/sync")
    public ResponseEntity<Map<String, Object>> syncPlays(
            @RequestBody com.yamdj.dto.CommonDtos.PlaySyncRequest request) {
        User user = trackService.currentUser();
        int synced = trackService.syncPlays(user.getId(),
                request == null ? null : request.plays());
        return ResponseEntity.ok(Map.of("synced", synced));
    }

    /** REPRISE DE LECTURE : sauvegarde la position de la piste en cours. */
    @PostMapping("/progress")
    public ResponseEntity<Void> saveProgress(
            @RequestBody com.yamdj.dto.CommonDtos.ProgressRequest body) {
        if (body == null || body.trackId() == null) {
            return ResponseEntity.badRequest().build();
        }
        User user = trackService.currentUser();
        trackService.saveProgress(user.getId(), body.trackId(),
                body.positionSec() == null ? 0 : body.positionSec(),
                body.durationSec());
        return ResponseEntity.ok().build();
    }

    /** REPRISE DE LECTURE : positions enregistrees (toutes pistes). */
    @GetMapping("/progress")
    public ResponseEntity<List<Map<String, Object>>> listProgress() {
        User user = trackService.currentUser();
        return ResponseEntity.ok(trackService.listProgress(user.getId()));
    }

    /** PARTAGES : sons recus d'autres utilisateurs YAM DJ. */
    @GetMapping("/shares")
    public ResponseEntity<List<Map<String, Object>>> myShares(
            @RequestParam(defaultValue = "30") int limit) {
        User user = trackService.currentUser();
        return ResponseEntity.ok(trackService.receivedShares(user.getId(), limit));
    }
}
