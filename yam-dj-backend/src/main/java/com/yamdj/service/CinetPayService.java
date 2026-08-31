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
 * Integration CinetPay : paiement mobile money (Orange Money, Moov Money,
 * MTN...) pour les YAM Tips. API Checkout v2.
 */
@Service
public class CinetPayService {

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${yamdj.cinetpay.api-key}")
    private String apiKey;

    @Value("${yamdj.cinetpay.site-id}")
    private String siteId;

    @Value("${yamdj.cinetpay.base-url}")
    private String baseUrl;

    @Value("${yamdj.app.base-url}")
    private String appBaseUrl;

    public record PaymentInitiation(String paymentUrl, String paymentToken) {}
    public record PaymentCheck(String status, String cinetpayId, String paymentMethod, Double amount) {}

    /**
     * Initie un paiement : retourne l'URL de la page de paiement CinetPay
     * (l'utilisateur choisit Orange Money / Moov / MTN...).
     */
    public PaymentInitiation initiatePayment(int amountXof, String description, String customerEmail) {
        String token = "YAM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        Map<String, Object> body = new HashMap<>();
        body.put("apikey", apiKey);
        body.put("site_id", siteId);
        body.put("transaction_id", token);
        double amount = amountXof;
        body.put("amount", amount);
        body.put("currency", "XOF");
        body.put("description", description);
        body.put("return_url", appBaseUrl + "/tip/success?token=" + token);
        body.put("notify_url", appBaseUrl + "/api/webhook/cinetpay");
        body.put("channels", "MOBILE_MONEY");
        body.put("customer_email", customerEmail);
        body.put("customer_name", "YAM DJ Fan");
        body.put("metadata", customerEmail);
        body.put("lang", "fr");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    baseUrl + "/payment", request, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());

            // Cas 1 : reponse standard avec data.payment_url
            if (root.has("data") && root.get("data").has("payment_url")) {
                return new PaymentInitiation(
                        root.get("data").get("payment_url").asText(), token);
            }
            // Cas 2 : reponse directe avec payment_url (format alternatif)
            if (root.has("payment_url")) {
                return new PaymentInitiation(root.get("payment_url").asText(), token);
            }
            // Cas 3 : message d'erreur applicatif
            String message = root.has("message") ? root.get("message").asText() : "Reponse invalide CinetPay";
            throw new IllegalStateException("CinetPay : " + message);
        } catch (org.springframework.web.client.RestClientException e) {
            throw new IllegalStateException("CinetPay injoignable : " + e.getMessage(), e);
        } catch (Exception e) {
            if (e instanceof IllegalStateException) throw (IllegalStateException) e;
            throw new IllegalStateException("Erreur d'initiation du paiement : " + e.getMessage(), e);
        }
    }

    /**
     * Verifie le statut reel d'une transaction (utilise par le webhook et
     * par le endpoint de confirmation cote frontend).
     */
    public PaymentCheck checkPayment(String paymentToken) {
        Map<String, Object> body = new HashMap<>();
        body.put("apikey", apiKey);
        body.put("site_id", siteId);
        body.put("transaction_id", paymentToken);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    baseUrl + "/payment/check", request, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode data = root.has("data") ? root.get("data") : root;

            String status = data.has("status") ? data.get("status").asText() : "REFUSED";
            String cpmId = data.has("cpm_transid") ? data.get("cpm_transid").asText() : paymentToken;
            String method = data.has("payment_method") ? data.get("payment_method").asText()
                    : (data.has("payment_channel") ? data.get("payment_channel").asText() : "MOBILE_MONEY");
            Double amount = data.has("amount") ? data.get("amount").asDouble() : null;

            return new PaymentCheck(
                    "ACCEPTED".equalsIgnoreCase(status) || "COMPLETED".equalsIgnoreCase(status)
                            ? "COMPLETED" : status.toUpperCase(),
                    cpmId, method, amount);
        } catch (Exception e) {
            return new PaymentCheck("UNKNOWN", paymentToken, null, null);
        }
    }
}
