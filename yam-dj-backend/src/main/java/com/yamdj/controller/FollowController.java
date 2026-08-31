package com.yamdj.controller;

import com.yamdj.dto.TrackDtos.TrackResponse;
import com.yamdj.service.FollowService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Abonnements fans -> artistes.
 * Follow/unfollow : utilisateur authentifie. Statut public (compteur fans).
 */
@RestController
public class FollowController {

    private final FollowService followService;

    public FollowController(FollowService followService) {
        this.followService = followService;
    }

    @PostMapping("/api/artists/{id}/follow")
    public ResponseEntity<Map<String, Object>> follow(@PathVariable UUID id) {
        boolean created = followService.follow(id);
        return ResponseEntity.ok(Map.of(
                "following", true,
                "created", created,
                "followers", followService.status(id).followers()));
    }

    @DeleteMapping("/api/artists/{id}/follow")
    public ResponseEntity<Map<String, Object>> unfollow(@PathVariable UUID id) {
        boolean removed = followService.unfollow(id);
        return ResponseEntity.ok(Map.of(
                "following", false,
                "removed", removed,
                "followers", followService.status(id).followers()));
    }

    @GetMapping("/api/artists/{id}/follow-status")
    public ResponseEntity<Map<String, Object>> status(@PathVariable UUID id) {
        FollowService.FollowStatus s = followService.status(id);
        return ResponseEntity.ok(Map.of(
                "following", s.following(),
                "followers", s.followers()));
    }

    @GetMapping("/api/follow/my-artists")
    public ResponseEntity<List<FollowService.FollowedArtist>> myFollowing() {
        return ResponseEntity.ok(followService.myFollowing());
    }

    @GetMapping("/api/follow/feed")
    public ResponseEntity<List<TrackResponse>> feed(@RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(followService.followedFeed(Math.min(Math.max(limit, 1), 50)));
    }
}
