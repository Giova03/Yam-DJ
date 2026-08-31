package com.yamdj.controller;

import com.yamdj.dto.PaymentDtos.ArtistStatsResponse;
import com.yamdj.dto.PaymentDtos.TipHistoryResponse;
import com.yamdj.service.TipService;
import com.yamdj.service.TrackService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Espace artiste : statistiques, historique des tips.
 */
@RestController
@RequestMapping("/api/artist")
public class ArtistController {

    private final TipService tipService;
    private final TrackService trackService;

    public ArtistController(TipService tipService, TrackService trackService) {
        this.tipService = tipService;
        this.trackService = trackService;
    }

    @GetMapping("/me/stats")
    public ResponseEntity<ArtistStatsResponse> myStats() {
        UUID artistId = trackService.currentUser().getId();
        return ResponseEntity.ok(tipService.artistStats(artistId));
    }

    @GetMapping("/me/tips")
    public ResponseEntity<List<TipHistoryResponse>> myTips(@RequestParam(defaultValue = "50") int limit) {
        UUID artistId = trackService.currentUser().getId();
        return ResponseEntity.ok(tipService.tipsReceived(artistId, limit));
    }

    @GetMapping("/me/tracks")
    public ResponseEntity<?> myTracks() {
        UUID artistId = trackService.currentUser().getId();
        return ResponseEntity.ok(Map.of("tracks", trackService.byArtist(artistId)));
    }
}
