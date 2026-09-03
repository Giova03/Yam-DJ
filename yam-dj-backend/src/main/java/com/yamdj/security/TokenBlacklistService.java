package com.yamdj.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Liste noire des JWT (logout reel).
 *
 * Un JWT est par nature sans etat : apres logout cote client, le token reste
 * theoriquement valable jusqu'a son expiration. Ce service conserve cote
 * serveur l'empreinte SHA-256 des tokens deconnectes ; JwtAuthFilter la
 * verifie a chaque requete et rejette les tokens deconnectes (401).
 *
 * Bornage memoire : l'empreinte (et non le token complet) est stockee,
 * la purge des entrees expirees est effectuee en continu, et le plan Render
 * free (512 Mo) reste a l'abri d'une croissance sans limite (la duree de vie
 * max d'une entree = duree de vie du JWT, 24 h).
 */
@Service
public class TokenBlacklistService {

    private static final Logger log = LoggerFactory.getLogger(TokenBlacklistService.class);

    /** hash hex -> epoch millis d'expiration du JWT correspondant. */
    private final Map<String, Long> revoked = new ConcurrentHashMap<>();

    private static final int MAX_ENTRIES = 50_000;

    /** Revoque un JWT jusqu'a son expiration naturelle. */
    public void revoke(String token, long expirationEpochMs) {
        if (token == null || token.isBlank()) return;
        if (revoked.size() > MAX_ENTRIES) {
            log.warn("Liste noire JWT saturee ({} entrees) : purge complete", revoked.size());
            revoked.clear();
        }
        revoked.put(sha256(token), Math.max(expirationEpochMs, System.currentTimeMillis()));
    }

    /** Ce JWT a-t-il ete revoque (logout) ? */
    public boolean isRevoked(String token) {
        if (token == null || token.isBlank()) return false;
        Long exp = revoked.get(sha256(token));
        return exp != null && exp > System.currentTimeMillis();
    }

    /** Purge des entrees expirees (appelee opportunistiquement). */
    public void purgeExpired() {
        long now = System.currentTimeMillis();
        revoked.entrySet().removeIf(e -> e.getValue() <= now);
    }

    public int size() {
        return revoked.size();
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            // SHA-256 toujours disponible sur la JVM : fallback degradé
            return String.valueOf(value.hashCode());
        }
    }
}
