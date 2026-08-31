package com.yamdj.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.yamdj.dto.PaymentDtos.TipResponse;
import com.yamdj.service.TipService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Webhook FedaPay : notification d'evenements de paiement (transaction
 * approuvee, refusee, annulee...). Endpoint PUBLIC (FedaPay appelle le
 * serveur, sans authentification). Securise par double-verification via
 * l'API FedaPay (GET /v1/transactions/{id}) avant toute creditation.
 *
 * Configuration : dashboard FedaPay > Parametres > Webhooks > URL
 * https://yam-dj.onrender.com/api/webhook/fedapay
 * Evenements recommandes : transaction.approved, transaction.declined,
 * transaction.canceled.
 */
@RestController
@RequestMapping("/api/webhook")
public class WebhookController {

    private static final Logger log = LoggerFactory.getLogger(WebhookController.class);

    private final TipService tipService;

    public WebhookController(TipService tipService) {
        this.tipService = tipService;
    }

    @PostMapping("/fedapay")
    public ResponseEntity<Map<String, String>> fedapayWebhook(@RequestBody JsonNode payload) {
        // Formats acceptes : {"name":"transaction.approved","entity":{...}},
        // {"event":{...,"object":{...}}}, ou {"transaction":{"id":123}}.
        String event = payload.path("name").asText(payload.path("event").asText(""));
        JsonNode source = payload.has("entity") ? payload.get("entity")
                : payload.has("object") ? payload.get("object")
                : payload.has("transaction") ? payload.get("transaction")
                : payload.has("data") ? payload.get("data") : payload;

        long txnId = source.path("id").asLong(0);
        if (txnId <= 0) {
            log.warn("Webhook FedaPay sans identifiant de transaction : {}",
                    payload.toString().length() > 400 ? payload.toString().substring(0, 400) : payload);
            return ResponseEntity.badRequest().body(Map.of("error", "id de transaction manquant"));
        }

        log.info("Webhook FedaPay recu : evenement={}, transaction={}", event, txnId);
        try {
            TipResponse result = tipService.confirmTipByTransaction(txnId);
            return ResponseEntity.ok(Map.of(
                    "transaction", String.valueOf(txnId),
                    "status", result.status()));
        } catch (Exception e) {
            // Tip inconnu chez nous : 200 quand meme pour eviter les retries infinis
            log.warn("Webhook FedaPay : tip introuvable pour la transaction {} : {}", txnId, e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "transaction", String.valueOf(txnId),
                    "status", "UNKNOWN"));
        }
    }
}
