package com.yamdj.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Limitation de debit sur les endpoints sensibles d'authentification
 * (anti brute-force / anti spam d'emails) — directive securite P0.
 *
 * Compteurs en memoire par (route, IP) sur une fenetre glissante.
 * Sur une instance unique (Render), cela suffit a bloquer :
 *  - les attaques par dictionnaire sur /api/auth/login ;
 *  - les inscriptions massives de faux comptes ;
 *  - le spam de demandes de reinitialisation (emails Brevo limites a 300/j).
 *
 * Limites par defaut :
 *  - login            : 10 essais / 15 min / IP
 *  - register          : 5 / heure / IP
 *  - forgot-password   : 3 / heure / IP
 *  - verify-email      : 15 / heure / IP
 *  - reset-password    : 6 / heure / IP
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    private record Limit(int max, long windowMs) {}

    private static final Map<String, Limit> RULES = Map.of(
            "/api/auth/login", new Limit(10, 15 * 60_000L),
            "/api/auth/register", new Limit(5, 60 * 60_000L),
            "/api/auth/forgot-password", new Limit(3, 60 * 60_000L),
            "/api/auth/verify-email", new Limit(15, 60 * 60_000L),
            "/api/auth/reset-password", new Limit(6, 60 * 60_000L),
            "/api/auth/resend-verification", new Limit(5, 60 * 60_000L),
            "/api/auth/oauth/google/url", new Limit(10, 60 * 60_000L),
            "/api/auth/oauth/google/callback", new Limit(20, 60 * 60_000L)
    );

    private record Window(long windowStart, AtomicLong count) {}

    private final Map<String, Window> counters = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        Limit rule = RULES.get(path);

        if (rule != null && "POST".equalsIgnoreCase(request.getMethod())) {
            String clientIp = clientIp(request);
            String key = path + "|" + clientIp;
            long now = System.currentTimeMillis();

            Window window = counters.compute(key, (k, w) -> {
                if (w == null || now - w.windowStart() >= rule.windowMs()) {
                    return new Window(now, new AtomicLong(0));
                }
                return w;
            });

            long hits = window.count().incrementAndGet();
            if (hits > rule.max()) {
                log.warn("Rate limit depasse : {} ({} requetes / fenetre) depuis {}",
                        path, hits, clientIp);
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setContentType("application/json");
                response.setCharacterEncoding("UTF-8");
                response.getWriter().write(
                        "{\"message\":\"Trop de tentatives. Reessaie dans quelques minutes.\","
                      + "\"error\":\"TOO_MANY_REQUESTS\"}");
                return;
            }

            // Purge opportuniste (evite la croissance infinie de la map)
            if (counters.size() > 10_000) {
                counters.entrySet().removeIf(e -> now - e.getValue().windowStart() >= 60 * 60_000L);
            }
        }

        filterChain.doFilter(request, response);
    }

    /** IP reelle (Render place l'IP d'origine dans X-Forwarded-For). */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "unknown";
    }

    /** Nettoyage public (tests). */
    void reset() {
        counters.clear();
    }

    List<String> rules() {
        return List.copyOf(RULES.keySet());
    }
}
