package com.yamdj.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.ECPrivateKeySpec;
import java.time.Instant;
import java.util.Base64;

/**
 * Envoi de notifications Web Push (RFC 8030) signees VAPID (RFC 8292).
 *
 * Implementation volontairement SANS dependance externe (JCA uniquement) :
 *  - reconstruction des cles P-256 depuis le format base64url VAPID
 *    (public : 65 octets non compresses, prive : scalaire 32 octets) ;
 *  - JWT ES256 a signature RAW r||s (64 octets) imposee par VAPID
 *    (contrairement au JWS classique qui encode en DER) ;
 *  - envoi POST vide (sans payload chiffre) : garanti conforme et
 *    delivre par tous les services push. Le service worker affiche une
 *    notification generique ; le contenu riche vit dans le centre
 *    in-app. L'upgrade V2 (payload aes128gcm, RFC 8291) est documentee.
 *
 * Cle publique servie au frontend via GET /api/notifications/vapid-key.
 */
@Service
public class WebPushService {

    private static final Logger log = LoggerFactory.getLogger(WebPushService.class);

    @Value("${yamdj.push.vapid-public-key:}")
    private String vapidPublicKey;

    @Value("${yamdj.push.vapid-private-key:}")
    private String vapidPrivateKey;

    @Value("${yamdj.push.vapid-subject:mailto:contact@yamdj.africa}")
    private String vapidSubject;

    private static final Base64.Decoder B64URL_DEC = Base64.getUrlDecoder();
    private static final Base64.Encoder B64URL_ENC = Base64.getUrlEncoder().withoutPadding();

    /** Cle publique VAPID exposee au frontend (base64url, 65 octets bruts). */
    public String publicKey() {
        return vapidPublicKey == null ? "" : vapidPublicKey.trim();
    }

    public boolean isConfigured() {
        return publicKey().length() > 40 && vapidPrivateKey != null && !vapidPrivateKey.isBlank();
    }

    /**
     * Envoie un push vide (sans payload) a un abonnement.
     * Retourne true si le service push a accepte (2xx/3xx).
     * 410 Gone : abonnement expire -> a supprimer (signale par exception
     * com.yamdj.service.PushGoneException geree par l'appelant).
     */
    public boolean send(String endpoint) {
        if (!isConfigured()) {
            log.debug("Web Push non configure (cles VAPID absentes) : envoi ignore");
            return false;
        }
        try {
            String jwt = buildVapidJwt(endpoint);
            HttpURLConnection conn = (HttpURLConnection) URI.create(endpoint).toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setDoOutput(true);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("Authorization", "vapid t=" + jwt + ", k=" + publicKey());
            conn.setRequestProperty("TTL", "86400");
            conn.setRequestProperty("Urgency", "normal");
            conn.setRequestProperty("Content-Length", "0");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(new byte[0]);
            }
            int status = conn.getResponseCode();
            conn.disconnect();
            if (status >= 200 && status < 300) {
                return true;
            }
            if (status == 410 || status == 404) {
                throw new PushGoneException("Abonnement expire (HTTP " + status + ")");
            }
            log.warn("Web Push refuse (HTTP {}) pour {}", status, shortEndpoint(endpoint));
            return false;
        } catch (PushGoneException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Echec Web Push vers {} : {}", shortEndpoint(endpoint), e.getMessage());
            return false;
        }
    }

    /** JWT ES256 avec signature raw (format impose par VAPID). */
    private String buildVapidJwt(String endpoint) throws Exception {
        String aud = originOf(endpoint);
        String header = "{\"typ\":\"JWT\",\"alg\":\"ES256\"}";
        long exp = Instant.now().plusSeconds(12 * 3600).getEpochSecond();
        String payload = "{\"aud\":\"" + aud + "\",\"exp\":" + exp + ",\"sub\":\"" + vapidSubject + "\"}";

        String signingInput = B64URL_ENC.encodeToString(header.getBytes(StandardCharsets.UTF_8))
                + "." + B64URL_ENC.encodeToString(payload.getBytes(StandardCharsets.UTF_8));

        byte[] rawSig = signEs256Raw(signingInput.getBytes(StandardCharsets.UTF_8));
        return signingInput + "." + B64URL_ENC.encodeToString(rawSig);
    }

    /** Signature ECDSA P-256/SHA-256 en raw r||s (64 octets). */
    private byte[] signEs256Raw(byte[] input) throws Exception {
        PrivateKey key = loadPrivateKey();
        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign(key);
        sig.update(input);
        byte[] der = sig.sign();
        return derToRaw(der);
    }

    private PrivateKey loadPrivateKey() throws Exception {
        byte[] d = B64URL_DEC.decode(vapidPrivateKey.trim());
        BigInteger s = new BigInteger(1, d);
        ECParameterSpec spec = p256Spec();
        return KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(s, spec));
    }

    /** Reconstruit la cle publique depuis la cle publique VAPID (verification). */
    PublicKey loadPublicKey() throws Exception {
        byte[] raw = B64URL_DEC.decode(publicKey());
        if (raw.length != 65 || raw[0] != 0x04) {
            throw new IllegalArgumentException("Cle VAPID publique invalide (65 octets attendus)");
        }
        byte[] x = new byte[32];
        byte[] y = new byte[32];
        System.arraycopy(raw, 1, x, 0, 32);
        System.arraycopy(raw, 33, y, 0, 32);
        ECPoint point = new ECPoint(new BigInteger(1, x), new BigInteger(1, y));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, p256Spec()));
    }

    private ECParameterSpec p256Spec() throws Exception {
        java.security.AlgorithmParameters params = java.security.AlgorithmParameters.getInstance("EC");
        params.init(new ECGenParameterSpec("secp256r1"));
        return params.getParameterSpec(ECParameterSpec.class);
    }

    /** Convertit une signature DER SEQUENCE en raw r||s (32+32 octets). */
    private static byte[] derToRaw(byte[] der) {
        // DER: 0x30 totalLen 0x02 rLen r 0x02 sLen s
        int offset = 2; // saute 0x30 + longueur totale (court en pratique)
        if ((der[1] & 0x80) != 0) offset = 3; // longueur long-form
        int rLen = der[offset + 1];
        byte[] r = stripLeadingZeros(java.util.Arrays.copyOfRange(der, offset + 2, offset + 2 + rLen));
        int sOffset = offset + 2 + rLen;
        int sLen = der[sOffset + 1];
        byte[] s = stripLeadingZeros(java.util.Arrays.copyOfRange(der, sOffset + 2, sOffset + 2 + sLen));
        byte[] raw = new byte[64];
        System.arraycopy(r, 0, raw, 32 - r.length, r.length);
        System.arraycopy(s, 0, raw, 64 - s.length, s.length);
        return raw;
    }

    private static byte[] stripLeadingZeros(byte[] in) {
        int i = 0;
        while (i < in.length - 1 && in[i] == 0) i++;
        return java.util.Arrays.copyOfRange(in, i, in.length);
    }

    private static String originOf(String endpoint) {
        URI uri = URI.create(endpoint);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        int port = uri.getPort();
        if (host == null) return "https://fcm.googleapis.com";
        return scheme + "://" + host + (port > 0 ? ":" + port : "");
    }

    private static String shortEndpoint(String endpoint) {
        return endpoint.length() > 60 ? endpoint.substring(0, 60) + "..." : endpoint;
    }

    /** Abonnement expire (410/404) : l'appelant doit le supprimer. */
    public static class PushGoneException extends RuntimeException {
        public PushGoneException(String message) { super(message); }
    }
}
