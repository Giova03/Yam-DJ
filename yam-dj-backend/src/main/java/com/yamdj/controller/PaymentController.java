package com.yamdj.controller;

import com.yamdj.dto.PaymentDtos.MixtapePurchaseResponse;
import com.yamdj.dto.PaymentDtos.PremiumResponse;
import com.yamdj.dto.PaymentDtos.TipRequest;
import com.yamdj.dto.PaymentDtos.TipResponse;
import com.yamdj.service.MixtapeStoreService;
import com.yamdj.service.PremiumService;
import com.yamdj.service.TipService;
import com.yamdj.service.TrackService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Paiements : initiation des YAM Tips, de l'abonnement Premium Fan et
 * des achats de mixtapes payantes (FedaPay : Orange Money, Moov, MTN,
 * Wave).
 */
@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private final TipService tipService;
    private final PremiumService premiumService;
    private final TrackService trackService;
    private final MixtapeStoreService mixtapeStore;

    public PaymentController(TipService tipService,
                             PremiumService premiumService,
                             TrackService trackService,
                             MixtapeStoreService mixtapeStore) {
        this.tipService = tipService;
        this.premiumService = premiumService;
        this.trackService = trackService;
        this.mixtapeStore = mixtapeStore;
    }

    @PostMapping("/tip")
    public ResponseEntity<TipResponse> createTip(@Valid @RequestBody TipRequest request) {
        return ResponseEntity.ok(tipService.createTip(request));
    }

    /** Verification du statut d'un tip (fallback si le webhook echoue). */
    @PostMapping("/tip/verify")
    public ResponseEntity<TipResponse> verifyTip(@RequestBody Map<String, String> body) {
        String token = body.get("paymentToken");
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("paymentToken requis");
        }
        return ResponseEntity.ok(tipService.confirmTip(token));
    }

    // ==================== PREMIUM FAN (Phase 3.1) ====================

    /** Initiation de l'abonnement Premium (500 F / 30 jours). */
    @PostMapping("/premium")
    public ResponseEntity<PremiumResponse> initPremium() {
        return ResponseEntity.ok(premiumService.initPremium(trackService.currentUser()));
    }

    /** Verification post-paiement (page de retour /premium/success). */
    @PostMapping("/premium/verify")
    public ResponseEntity<PremiumResponse> verifyPremium(@RequestBody Map<String, String> body) {
        String token = body.get("paymentToken");
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("paymentToken requis");
        }
        return ResponseEntity.ok(premiumService.confirmByToken(token));
    }

    // ============= BOUTIQUE DE MIXTAPES (Phase 3.4, 70/30) =============

    /** Initiation de l'achat d'une mixtape payante. */
    @PostMapping("/mixtape/{mixtapeId}")
    public ResponseEntity<MixtapePurchaseResponse> initMixtapePurchase(
            @PathVariable UUID mixtapeId) {
        return ResponseEntity.ok(mixtapeStore.initPurchase(trackService.currentUser(), mixtapeId));
    }

    /** Verification post-paiement d'un achat de mixtape. */
    @PostMapping("/mixtape/verify")
    public ResponseEntity<MixtapePurchaseResponse> verifyMixtapePurchase(
            @RequestBody Map<String, String> body) {
        String token = body.get("paymentToken");
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("paymentToken requis");
        }
        return ResponseEntity.ok(mixtapeStore.confirmByToken(token));
    }
}
