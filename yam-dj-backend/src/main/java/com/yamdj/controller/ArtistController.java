package com.yamdj.controller;

import com.yamdj.dto.PaymentDtos.ArtistStatsResponse;
import com.yamdj.dto.PaymentDtos.TipHistoryResponse;
import com.yamdj.dto.RoyaltyDtos;
import com.yamdj.dto.WithdrawalDtos.WithdrawalCreateRequest;
import com.yamdj.dto.WithdrawalDtos.WithdrawalResponse;
import com.yamdj.service.RoyaltyService;
import com.yamdj.service.TipService;
import com.yamdj.service.TrackService;
import com.yamdj.service.WithdrawalService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Espace artiste : statistiques, historique des tips, retraits mobile money,
 * releve des redevances d'ecoute.
 */
@RestController
@RequestMapping("/api/artist")
public class ArtistController {

    private final TipService tipService;
    private final TrackService trackService;
    private final WithdrawalService withdrawalService;
    private final RoyaltyService royaltyService;

    public ArtistController(TipService tipService,
                            TrackService trackService,
                            WithdrawalService withdrawalService,
                            RoyaltyService royaltyService) {
        this.tipService = tipService;
        this.trackService = trackService;
        this.withdrawalService = withdrawalService;
        this.royaltyService = royaltyService;
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

    // ============ REDEVANCES D'ECOUTE (Phase 3.3) ============

    /** Releve mensuel des redevances creditees a l'artiste connecte. */
    @GetMapping("/me/royalties")
    public ResponseEntity<RoyaltyDtos.ArtistRoyalties> myRoyalties() {
        UUID artistId = trackService.currentUser().getId();
        return ResponseEntity.ok(royaltyService.artistStatement(artistId));
    }

    // ==================== RETRAITS (Phase 3.2) ====================

    /** Demande de retrait du solde vers mobile money (min 5 000 F). */
    @PostMapping("/withdrawals")
    public ResponseEntity<WithdrawalResponse> createWithdrawal(
            @Valid @RequestBody WithdrawalCreateRequest request) {
        return ResponseEntity.ok(withdrawalService.create(
                trackService.currentUser(),
                request.amountXof() == null ? 0 : request.amountXof(),
                request.operator(),
                request.phone()));
    }

    /** Historique des demandes de retrait de l'artiste connecte. */
    @GetMapping("/withdrawals/mine")
    public ResponseEntity<List<WithdrawalResponse>> myWithdrawals() {
        return ResponseEntity.ok(withdrawalService.mine(trackService.currentUser().getId()));
    }
}
