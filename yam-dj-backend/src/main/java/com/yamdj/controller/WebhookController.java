package com.yamdj.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.yamdj.dto.PaymentDtos.TipResponse;
import com.yamdj.service.PremiumService;
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
 * Routage : transaction d'un YAM Tip -> tipService ; transaction d'un
 * ordre Premium Fan -> premiumService.
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
    private final PremiumService premiumService;

    public WebhookController(TipService tipService, PremiumService premiumService) {
        this.tipService = tipService;
        this.premiumService = premiumService;
    }

    @PostMapping("/fedapay")
    public ResponseEntity<Map<String, String>> fedapayWebhook(@RequestBody JsonNode payload) {
        // Formats acceptes : {"name":"transaction.approved","entity":{"object":{"id":123}}},
        // {"event":{...,"object":{...}}}, ou {"transaction":{"id":123}}.
        String event = payload.path("name").asText(payload.path("event").asText(""));
        JsonNode source = payload.has("entity") ? payload.get("entity")
                : payload.has("object") ? payload.get("object")
                : payload.has("transaction") ? payload.get("transaction")
                : payload.has("data") ? payload.get("data") : payload;

        // L'id peut etre direct (entity.id) ou imbrique (entity.object.id,
        // format reel des webhooks FedaPay)
        long txnId = source.path("id").asLong(0);
        if (txnId <= 0 && source.has("object")) {
            txnId = source.path("object").path("id").asLong(0);
        }
        if (txnId <= 0) {
            log.warn("Webhook FedaPay sans identifiant de transaction : {}",
                    payload.toString().length() > 400 ? payload.toString().substring(0, 400) : payload);
            return ResponseEntity.badRequest().body(Map.of("error", "id de transaction manquant"));
        }

        log.info("Webhook FedaPay recu : evenement={}, transaction={}", event, txnId);
        try {
            // 1. Tip classique (YAM Tips artistes)
            TipResponse result = tipService.confirmTipByTransaction(txnId);
            return ResponseEntity.ok(Map.of(
                    "transaction", String.valueOf(txnId),
                    "status", result.status()));
        } catch (Exception tipNotFound) {
            // 2. Ordre Premium Fan (abonnement 500 F / 30 jours)
            try {
                var premium = premiumService.confirmByTransaction(txnId);
                return ResponseEntity.ok(Map.of(
                        "transaction", String.valueOf(txnId),
                        "status", premium.status()));
            } catch (Exception premiumNotFound) {
                // Paiement inconnu chez nous : 200 quand meme pour eviter
                // les retries infinis de FedaPay
                log.warn("Webhook FedaPay : paiement introuvable pour la transaction {} : {}",
                        txnId, premiumNotFound.getMessage());
                return ResponseEntity.ok(Map.of(
                        "transaction", String.valueOf(txnId),
                        "status", "UNKNOWN"));
            }
        }
    }
}
