package com.yamdj.controller;

import com.yamdj.dto.PaymentDtos.TipRequest;
import com.yamdj.dto.PaymentDtos.TipResponse;
import com.yamdj.service.TipService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Paiements : initiation des YAM Tips (CinetPay / Orange Money).
 */
@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private final TipService tipService;

    public PaymentController(TipService tipService) {
        this.tipService = tipService;
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
}
