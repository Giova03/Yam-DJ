package com.yamdj.controller;

import com.yamdj.dto.PaymentDtos.TipWebhookPayload;
import com.yamdj.service.TipService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Webhook CinetPay : notification de fin de paiement (Orange Money...).
 * Endpoint PUBLIC (aucune authentification : CinetPay appelle le serveur).
 * Securise par double-verification via l'API check de CinetPay.
 */
@RestController
@RequestMapping("/api/webhook")
public class WebhookController {

    private final TipService tipService;

    public WebhookController(TipService tipService) {
        this.tipService = tipService;
    }

    @PostMapping("/cinetpay")
    public ResponseEntity<Map<String, String>> cinetpayWebhook(
            @RequestBody(required = false) TipWebhookPayload payload,
            @RequestParam(required = false) String payment_token) {

        // Le token peut arriver dans le body OU en query param selon la version API
        String token = null;
        if (payload != null && payload.payment_token() != null && !payload.payment_token().isBlank()) {
            token = payload.payment_token();
        } else if (payment_token != null && !payment_token.isBlank()) {
            token = payment_token;
        }

        if (token == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "payment_token manquant"));
        }

        com.yamdj.dto.PaymentDtos.TipResponse result = tipService.confirmTip(token);
        return ResponseEntity.ok(Map.of(
                "paymentToken", result.paymentToken() == null ? token : result.paymentToken(),
                "status", result.status()));
    }
}
