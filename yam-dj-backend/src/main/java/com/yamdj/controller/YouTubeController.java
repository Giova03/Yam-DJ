package com.yamdj.controller;

import com.yamdj.dto.TrackDtos.TrackResponse;
import com.yamdj.service.TrackService;
import com.yamdj.service.YouTubeService;
import com.yamdj.service.YouTubeService.YoutubeVideo;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Integration YouTube : recherche publique + import authentifie.
 * Les pistes importees rejoignent la file d'actualite (statut APPROVED).
 */
@RestController
@RequestMapping("/api/youtube")
public class YouTubeController {

    private final YouTubeService youtubeService;
    private final TrackService trackService;

    public YouTubeController(YouTubeService youtubeService, TrackService trackService) {
        this.youtubeService = youtubeService;
        this.trackService = trackService;
    }

    /** Recherche YouTube (public) : ?q=...&limit=12 */
    @GetMapping("/search")
    public ResponseEntity<List<YoutubeVideo>> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "12") int limit) {
        if (q == null || q.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(youtubeService.search(q.trim(), limit));
    }

    /** Import d'une video dans le catalogue YAM DJ (authentifie). */
    @PostMapping("/import")
    public ResponseEntity<TrackResponse> importVideo(@RequestBody ImportRequest body) {
        TrackResponse track = youtubeService.importVideo(body.videoIdOrUrl());
        return ResponseEntity.ok(track);
    }

    /** Musiques libres d'acces : hymnes + pistes YouTube (lecture gratuite). */
    @GetMapping("/libre")
    public ResponseEntity<List<TrackResponse>> libre(
            @RequestParam(defaultValue = "24") int limit) {
        return ResponseEntity.ok(youtubeService.libre(limit));
    }

    /** Recherche croisee : catalogue YAM DJ + YouTube dans une seule reponse. */
    @GetMapping("/combined")
    public ResponseEntity<Map<String, Object>> combined(
            @RequestParam String q,
            @RequestParam(defaultValue = "12") int limit) {
        return ResponseEntity.ok(Map.of(
                "platform", trackService.search(q, "all", "all", 0, limit).content(),
                "youtube", youtubeService.search(q, limit)));
    }

    public record ImportRequest(@NotBlank String videoIdOrUrl) {}
}
