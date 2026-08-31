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
                "emailVerified", user.isEmailVerified()));
    }

    /** Pistes aimees par l'utilisateur connecte (plus recentes d'abord). */
    @GetMapping("/likes")
    public ResponseEntity<List<com.yamdj.dto.TrackDtos.TrackResponse>> myLikes(
            @RequestParam(defaultValue = "50") int limit) {
        User user = trackService.currentUser();
        return ResponseEntity.ok(trackService.likedTracks(user.getId(), Math.min(limit, 100)));
    }
}
