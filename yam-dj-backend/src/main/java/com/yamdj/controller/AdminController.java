package com.yamdj.controller;

import com.yamdj.dto.RoyaltyDtos;
import com.yamdj.dto.TrackDtos;
import com.yamdj.dto.TrackDtos.TrackResponse;
import com.yamdj.dto.WithdrawalDtos.RejectRequest;
import com.yamdj.dto.WithdrawalDtos.WithdrawalResponse;
import com.yamdj.entity.Track;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserFollowRepository;
import com.yamdj.service.BrevoEmailService;
import com.yamdj.service.NotificationService;
import com.yamdj.service.RoyaltyService;
import com.yamdj.service.TrackService;
import com.yamdj.service.UserRepositoryHolder;
import com.yamdj.service.WithdrawalService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Moderation : validation des pistes avant publication, gestion des
 * demandes de retrait artistes (Phase 3.2).
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final TrackRepository trackRepository;
    private final TrackService trackService;
    private final BrevoEmailService emailService;
    private final UserRepositoryHolder userHolder;
    private final WithdrawalService withdrawalService;
    private final NotificationService notificationService;
    private final UserFollowRepository followRepository;
    private final RoyaltyService royaltyService;
    private final com.yamdj.service.AnalyticsService analyticsService;
    private final com.yamdj.service.TrackProcessingService trackProcessingService;

    public AdminController(TrackRepository trackRepository,
                           TrackService trackService,
                           BrevoEmailService emailService,
                           UserRepositoryHolder userHolder,
                           WithdrawalService withdrawalService,
                           NotificationService notificationService,
                           UserFollowRepository followRepository,
                           RoyaltyService royaltyService,
                           com.yamdj.service.AnalyticsService analyticsService,
                           com.yamdj.service.TrackProcessingService trackProcessingService) {
        this.trackRepository = trackRepository;
        this.trackService = trackService;
        this.emailService = emailService;
        this.userHolder = userHolder;
        this.withdrawalService = withdrawalService;
        this.notificationService = notificationService;
        this.followRepository = followRepository;
        this.royaltyService = royaltyService;
        this.analyticsService = analyticsService;
        this.trackProcessingService = trackProcessingService;
    }

    /**
     * Mode de moderation actif : autoApprove=true (publication immediate,
     * recommande en lancement) ou strict (PENDING -> validation admin via
     * /validate-tracks). Bascule : variable YAMDJ_MODERATION_AUTO_APPROVE.
     */
    @GetMapping("/moderation-mode")
    public ResponseEntity<Map<String, Object>> moderationMode() {
        return ResponseEntity.ok(Map.of(
                "autoApprove", trackProcessingService.isAutoApprove(),
                "mode", trackProcessingService.isAutoApprove() ? "AUTO" : "STRICT"));
    }

    /** File de moderation : pistes en attente. */
    @GetMapping("/validate-tracks")
    public ResponseEntity<Map<String, Object>> pendingTracks(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        Page<Track> result = trackRepository.findByStatus(TrackStatus.PENDING, PageRequest.of(page, size));
        List<TrackResponse> content = result.getContent().stream()
                .map(t -> TrackDtos.from(t, "—", "—"))
                .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of(
                "tracks", content,
                "page", result.getNumber(),
                "totalElements", result.getTotalElements()));
    }

    @PostMapping("/validate-tracks/{id}/approve")
    public ResponseEntity<Map<String, String>> approve(@PathVariable UUID id) {
        Track track = trackRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Piste introuvable"));
        track.setStatus(TrackStatus.APPROVED);
        trackRepository.save(track);
        userHolder.emailOf(track.getArtistId())
                .ifPresent(email -> emailService.sendTrackApprovedEmail(email, track.getTitle()));

        // Notifications (Phase 2.4) : l'artiste + tous ses abonnes
        notificationService.notifyUser(track.getArtistId(), "TRACK_APPROVED",
                "Piste approuvee",
                "\"" + track.getTitle() + "\" est desormais en ligne sur YAM DJ !",
                "/track/" + track.getId());
        String artistName = userHolder.pseudoOf(track.getArtistId());
        for (var follow : followRepository.findTop500ByArtistIdOrderByCreatedAtDesc(track.getArtistId())) {
            notificationService.notifyUser(follow.getFollowerId(), "NEW_TRACK",
                    "Nouveau son de " + artistName,
                    "\"" + track.getTitle() + "\" vient de sortir sur YAM DJ. Viens l'ecouter !",
                    "/track/" + track.getId());
        }
        return ResponseEntity.ok(Map.of("status", "APPROVED"));
    }

    @PostMapping("/validate-tracks/{id}/reject")
    public ResponseEntity<Map<String, String>> reject(@PathVariable UUID id) {
        Track track = trackRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Piste introuvable"));
        track.setStatus(TrackStatus.REJECTED);
        trackRepository.save(track);
        notificationService.notifyUser(track.getArtistId(), "TRACK_REJECTED",
                "Piste refusee",
                "\"" + track.getTitle() + "\" n'a pas passe la moderation. Verifie la qualite audio.",
                "/dashboard");
        return ResponseEntity.ok(Map.of("status", "REJECTED"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Long>> stats() {
        long total = trackRepository.count();
        long pending = trackRepository.findByStatus(TrackStatus.PENDING, PageRequest.of(0, 1))
                .getTotalElements();
        return ResponseEntity.ok(Map.of(
                "totalTracks", total,
                "pendingTracks", pending));
    }

    /**
     * ANALYTICS PRODUIT (V1.1) : funnel 30 jours + KPI North Star
     * "Published Artists" — repond a "pourquoi les artistes ne publient pas ?"
     */
    @GetMapping("/analytics/summary")
    public ResponseEntity<Map<String, Object>> analyticsSummary() {
        return ResponseEntity.ok(analyticsService.summary());
    }

    // ==================== RETRAITS ARTISTES (Phase 3.2) ====================

    /** File des demandes de retrait (statut optionnel). */
    @GetMapping("/withdrawals")
    public ResponseEntity<List<WithdrawalResponse>> withdrawals(
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(withdrawalService.all(status));
    }

    /** Valide une demande : debit du solde + email + notification. */
    @PostMapping("/withdrawals/{id}/approve")
    public ResponseEntity<WithdrawalResponse> approveWithdrawal(@PathVariable UUID id) {
        return ResponseEntity.ok(withdrawalService.approve(id));
    }

    /** Rejette une demande avec note admin. */
    @PostMapping("/withdrawals/{id}/reject")
    public ResponseEntity<WithdrawalResponse> rejectWithdrawal(
            @PathVariable UUID id,
            @RequestBody(required = false) RejectRequest body) {
        return ResponseEntity.ok(withdrawalService.reject(id, body == null ? null : body.note()));
    }

    // ============ REDEVANCES D'ECOUTE (Phase 3.3) ============

    /** Historique des pools mensuels repartis. */
    @GetMapping("/royalties")
    public ResponseEntity<List<RoyaltyDtos.PoolSummary>> royaltyPools() {
        return ResponseEntity.ok(royaltyService.allPools());
    }

    /** Declenche manuellement la repartition d'un mois (defaut : mois precedent). */
    @PostMapping("/royalties/run")
    public ResponseEntity<Map<String, Object>> runRoyalties(
            @RequestBody(required = false) Map<String, String> body) {
        String period = body == null ? null : body.get("period");
        java.time.YearMonth month;
        try {
            month = (period == null || period.isBlank())
                    ? royaltyService.defaultPeriod()
                    : java.time.YearMonth.parse(period);
        } catch (Exception e) {
            throw new IllegalArgumentException("Periode invalide, format attendu : yyyy-MM");
        }
        var pool = royaltyService.runDistribution(month);
        return ResponseEntity.ok(Map.of(
                "period", pool.getPeriodMonth(),
                "poolAmountXof", pool.getPoolAmountXof(),
                "artistCount", pool.getArtistCount(),
                "totalPlays", pool.getTotalPlays(),
                "status", pool.getStatus()));
    }
}
