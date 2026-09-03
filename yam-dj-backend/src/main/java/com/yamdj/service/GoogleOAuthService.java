package com.yamdj.service;

import com.yamdj.dto.AuthDtos.AuthResponse;
import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.DjProfile;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.UserRole;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.DjProfileRepository;
import com.yamdj.repository.UserRepository;
import com.yamdj.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * CONNEXION GOOGLE (OAuth 2.0, code flow serveur).
 *
 * Flux : le navigateur ouvre l'URL de consentement Google -> Google redirige
 * vers /api/auth/oauth/google/callback?code=...&state=... -> le serveur
 * echange le code contre un access token (secret cote serveur uniquement),
 * recupere le profil Google verifie, cree/retrouve le compte YAM DJ et
 * redirige le navigateur vers le frontend avec le JWT dans le fragment
 * d'URL (#token=... : jamais envoye aux serveurs ni dans les logs).
 *
 * Securite :
 *  - state aleatoire 256 bits obligatoire (anti-CSRF), usage unique, TTL 10 min ;
 *  - email accepte seulement si Google le certifie verifie ;
 *  - mot de passe aleatoire 256 bits pour les comptes crees (l'utilisateur
 *    peut en definir un ensuite via "mot de passe oublie") ;
 *  - client secret jamais expose au frontend.
 */
@Service
public class GoogleOAuthService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String CONSENT_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
    private static final String CALLBACK_PATH = "/api/auth/oauth/google/callback";
    private static final Duration STATE_TTL = Duration.ofMinutes(10);
    private static final Set<String> ALLOWED_ROLES = Set.of("USER", "ARTIST", "DJ");

    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final DjProfileRepository djProfileRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${yamdj.google.client-id:}")
    private String clientId;

    @Value("${yamdj.google.client-secret:}")
    private String clientSecret;

    @Value("${yamdj.google.redirect-uri:}")
    private String redirectUri;

    @Value("${yamdj.app.base-url:}")
    private String appBaseUrl;

    @Value("${yamdj.app.frontend-url:}")
    private String frontendUrl;

    /** state -> expiration (anti-CSRF). */
    private final Map<String, Instant> pendingStates = new ConcurrentHashMap<>();

    public GoogleOAuthService(UserRepository userRepository,
                               ArtistProfileRepository artistProfileRepository,
                               DjProfileRepository djProfileRepository,
                               PasswordEncoder passwordEncoder,
                               JwtService jwtService) {
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.djProfileRepository = djProfileRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    /** true si les identifiants Google sont presents dans l'environnement. */
    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank();
    }

    /** URI de redirection enregistree dans Google Cloud Console. */
    public String effectiveRedirectUri() {
        if (redirectUri != null && !redirectUri.isBlank()) return redirectUri;
        return stripSlash(appBaseUrl) + CALLBACK_PATH;
    }

    /** URL de consentement Google (state anti-CSRF genere cote serveur). */
    public String consentUrl(String roleHint) {
        requireConfigured();
        String role = normalizeRole(roleHint);

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String state = toHex(bytes) + ":" + role;
        purgeExpiredStates();
        pendingStates.put(state, Instant.now().plus(STATE_TTL));

        return CONSENT_URL
                + "?client_id=" + urlEncode(clientId)
                + "&redirect_uri=" + urlEncode(effectiveRedirectUri())
                + "&response_type=code"
                + "&scope=" + urlEncode("openid email profile")
                + "&state=" + urlEncode(state)
                + "&prompt=select_account";
    }

    /**
     * Echange le code d'autorisation, recupere le profil Google, connecte ou
     * cree le compte, et retourne la reponse d'authentification (JWT).
     */
    @Transactional
    public AuthResponse exchangeCode(String code, String state) {
        requireConfigured();
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("Code d'autorisation manquant");
        }
        if (state == null || !pendingStates.containsKey(state)) {
            throw new IllegalArgumentException("Session Google expiree ou invalide — recommence la connexion");
        }
        pendingStates.remove(state); // usage unique
        String role = state.contains(":") ? state.substring(state.indexOf(':') + 1) : "USER";
        purgeExpiredStates();

        // 1) Echange du code contre un access token
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("code", code);
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        form.add("redirect_uri", effectiveRedirectUri());
        form.add("grant_type", "authorization_code");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        Map<String, Object> tokenResponse;
        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    TOKEN_URL, HttpMethod.POST, new HttpEntity<>(form, headers), Map.class);
            tokenResponse = response.getBody();
        } catch (Exception e) {
            throw new IllegalArgumentException("Echange du code Google impossible : " + e.getMessage());
        }
        String accessToken = tokenResponse == null ? null : (String) tokenResponse.get("access_token");
        if (accessToken == null || accessToken.isBlank()) {
            throw new IllegalArgumentException("Google n'a pas renvoye de jeton d'acces");
        }

        // 2) Profil Google (email certifie)
        Map<String, Object> profile;
        try {
            HttpHeaders auth = new HttpHeaders();
            auth.setBearerAuth(accessToken);
            ResponseEntity<Map> response = restTemplate.exchange(
                    USERINFO_URL, HttpMethod.GET, new HttpEntity<>(auth), Map.class);
            profile = response.getBody();
        } catch (Exception e) {
            throw new IllegalArgumentException("Impossible de lire le profil Google");
        }
        String email = profile == null ? null : (String) profile.get("email");
        String emailVerifiedRaw = profile == null ? null : String.valueOf(profile.get("email_verified"));
        if (email == null || email.isBlank() || !"true".equalsIgnoreCase(emailVerifiedRaw)) {
            throw new IllegalArgumentException("Google ne certifie pas cet email comme verifie");
        }
        email = email.trim().toLowerCase();

        String name = (String) profile.getOrDefault("name", "");
        String given = (String) profile.getOrDefault("given_name", "");
        String picture = (String) profile.get("picture");

        // 3) Connexion ou creation du compte
        User user = userRepository.findByEmailIgnoreCase(email).orElse(null);
        if (user != null) {
            // Compte existant : Google prouve la propriete de l'email.
            if (!user.isEnabled()) user.setEnabled(true);
            if (!user.isEmailVerified()) {
                user.setEmailVerified(true);
                user.setVerificationCode(null);
            }
            if (user.getAvatarUrl() == null && picture != null && picture.length() <= 500) {
                user.setAvatarUrl(picture);
            }
            userRepository.save(user);
        } else {
            user = provisionUser(email, name, given, picture, role);
        }

        String token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        return new AuthResponse(token, user.getEmail(), user.getPseudo(),
                user.getRole().name(), true,
                "Connexion Google reussie. Bienvenue " + user.getPseudo() + " !");
    }

    /** Cree le compte a partir du profil Google (pseudo unique, mot de passe aleatoire). */
    private User provisionUser(String email, String name, String given, String picture, String roleHint) {
        UserRole role = UserRole.valueOf(normalizeRole(roleHint));
        String pseudo = uniquePseudo(
                !given.isBlank() ? given : (!name.isBlank() ? name : email.substring(0, email.indexOf('@'))));

        User user = User.builder()
                .email(email)
                .password(passwordEncoder.encode(randomPassword()))
                .pseudo(pseudo)
                .role(role)
                .country("Burkina Faso")
                .emailVerified(true)
                .build();
        if (picture != null && picture.length() <= 500) user.setAvatarUrl(picture);
        user.setEnabled(true);
        user = userRepository.save(user);

        if (role == UserRole.ARTIST) {
            artistProfileRepository.save(ArtistProfile.builder()
                    .user(user).stageName(pseudo).bio("").build());
        } else if (role == UserRole.DJ) {
            djProfileRepository.save(DjProfile.builder()
                    .user(user).djName("DJ " + pseudo).bio("").build());
        }
        return user;
    }

    /** Pseudo unique depuis le nom Google (accents retires, doublons suffixes). */
    private String uniquePseudo(String raw) {
        String base = slugify(raw);
        if (base.length() < 3) base = "yamdj" + RANDOM.nextInt(1000, 9999);
        if (base.length() > 30) base = base.substring(0, 30);
        String candidate = base;
        int attempt = 1;
        while (userRepository.existsByPseudo(candidate)) {
            candidate = base + RANDOM.nextInt(10, 99);
            if (++attempt > 25) { candidate = "dj" + UUID.randomUUID().toString().substring(0, 8); break; }
        }
        return candidate;
    }

    private static String slugify(String input) {
        String normalized = Normalizer.normalize(input == null ? "" : input, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        String slug = normalized.toLowerCase().replaceAll("[^a-z0-9]+", "").trim();
        return slug.isEmpty() ? "yam" : slug;
    }

    private static String randomPassword() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return toHex(bytes);
    }

    private static String normalizeRole(String role) {
        if (role == null) return "USER";
        String clean = role.trim().toUpperCase();
        return ALLOWED_ROLES.contains(clean) ? clean : "USER";
    }

    private void requireConfigured() {
        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Connexion Google non configuree : renseigne GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET "
                    + "(Google Cloud Console -> Identifiants -> OAuth 2.0, URI de redirection : "
                    + effectiveRedirectUri() + ")");
        }
    }

    private void purgeExpiredStates() {
        Instant now = Instant.now();
        pendingStates.entrySet().removeIf(e -> e.getValue().isBefore(now));
    }

    /** URL de redirection finale vers le frontend (fragment, jamais logue cote serveur). */
    public String frontendCallbackUrl(String fragment) {
        return stripSlash(frontendUrl) + "/oauth/callback#" + fragment;
    }

    private static String stripSlash(String value) {
        if (value == null || value.isBlank()) return "";
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
