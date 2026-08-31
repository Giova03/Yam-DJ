package com.yamdj.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Integration FedaPay : paiement mobile money (Orange Money, Moov Money,
 * MTN, Wave...) pour les YAM Tips. API v1 (api.fedapay.com).
 *
 * Flux : POST /v1/transactions (creation, retourne payment_url sur
 * process.fedapay.com) -> le fan paie -> retour sur la page frontend
 * /tip/success?token=... -> verification GET /v1/transactions/{id}
 * (double-verification anti-fraude, aussi utilisee par le webhook).
 */
@Service
public class FedaPayService {

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${yamdj.fedapay.secret-key}")
    private String secretKey;

    @Value("${yamdj.fedapay.base-url}")
    private String baseUrl;

    @Value("${yamdj.app.frontend-url}")
    private String frontendUrl;

    public record PaymentInitiation(String paymentUrl, String paymentToken, Long providerTxnId) {}

    public record PaymentCheck(String status, String providerTxnId, String paymentMethod, Double amount) {}

    /**
     * Initie un paiement : retourne l'URL de la page de paiement FedaPay
     * (l'utilisateur choisit Orange Money / Moov / MTN / Wave...) et
     * l'identifiant de transaction FedaPay pour la verification ulterieure.
     */
    public PaymentInitiation initiatePayment(int amountXof, String description,
                                             String customerEmail, String customerName) {
        String token = "YAM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        String safeEmail = customerEmail == null || customerEmail.isBlank()
                ? "fan@yamdj.africa" : customerEmail;
        String safeName = customerName == null || customerName.isBlank()
                ? "Fan YAM DJ" : customerName.replaceAll("[^\\p{L}\\p{N} ' -]", "").trim();
        if (safeName.isBlank()) safeName = "Fan YAM DJ";

        Map<String, Object> customer = new HashMap<>();
        String[] parts = safeName.contains(" ") ? safeName.split(" ", 2)
                : new String[]{safeName, "YAM DJ"};
        customer.put("firstname", parts[0]);
        customer.put("lastname", parts[1]);
        customer.put("email", safeEmail);

        Map<String, Object> body = new HashMap<>();
        body.put("description", description == null ? "YAM Tip" : description);
        body.put("amount", (double) amountXof);
        body.put("currency", Map.of("iso", "XOF"));
        body.put("callback_url", stripSlash(frontendUrl) + "/tip/success?token=" + token);
        body.put("customer", customer);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));
        headers.setBearerAuth(secretKey);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    stripSlash(baseUrl) + "/v1/transactions", request, String.class);
            JsonNode txn = objectMapper.readTree(response.getBody()).path("v1/transaction");

            String paymentUrl = txn.path("payment_url").asText(null);
            long txnId = txn.path("id").asLong(0);
            if (paymentUrl == null || paymentUrl.isBlank() || txnId == 0) {
                throw new IllegalStateException("Reponse FedaPay invalide (payment_url/id manquants)");
            }
            return new PaymentInitiation(paymentUrl, token, txnId);
        } catch (org.springframework.web.client.RestClientException e) {
            throw new IllegalStateException("FedaPay injoignable : " + e.getMessage(), e);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Erreur d'initiation du paiement : " + e.getMessage(), e);
        }
    }

    /**
     * Verifie le statut reel d'une transaction FedaPay (utilise par la page
     * de retour et le webhook). Mappe les statuts FedaPay vers nos statuts :
     * approved -> COMPLETED, declined/canceled -> FAILED, sinon PENDING.
     */
    public PaymentCheck checkTransaction(Long providerTxnId) {
        if (providerTxnId == null || providerTxnId <= 0) {
            return new PaymentCheck("UNKNOWN", null, null, null);
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));
            headers.setBearerAuth(secretKey);
            ResponseEntity<String> response = restTemplate.exchange(
                    stripSlash(baseUrl) + "/v1/transactions/" + providerTxnId,
                    HttpMethod.GET, new HttpEntity<>(headers), String.class);
            JsonNode txn = objectMapper.readTree(response.getBody()).path("v1/transaction");

            String raw = txn.path("status").asText("pending");
            String status = switch (raw.toLowerCase()) {
                case "approved" -> "COMPLETED";
                case "declined", "canceled", "cancelled", "failed", "refunded" -> "FAILED";
                case "pending" -> "PENDING";
                default -> raw.toUpperCase();
            };
            String method = txn.path("payment_method").path("short_name").asText(null);
            if (method == null || method.isBlank()) {
                method = txn.path("mode").asText("MOBILE_MONEY");
            }
            double amount = txn.path("amount").asDouble(0);
            return new PaymentCheck(status, String.valueOf(providerTxnId), method, amount);
        } catch (Exception e) {
            return new PaymentCheck("UNKNOWN", String.valueOf(providerTxnId), null, null);
        }
    }

    private static String stripSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
