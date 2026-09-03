package com.yamdj.controller;

import com.yamdj.dto.AuthDtos.*;
import com.yamdj.security.JwtService;
import com.yamdj.service.AuthService;
import com.yamdj.service.GoogleOAuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Map;

/**
 * Authentification : inscription, connexion, verification email,
 * connexion Google (OAuth 2.0).
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final GoogleOAuthService googleOAuthService;

    public AuthController(AuthService authService, JwtService jwtService,
                          GoogleOAuthService googleOAuthService) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.googleOAuthService = googleOAuthService;
    }


    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<AuthResponse> verifyEmail(@Valid @RequestBody VerifyRequest request) {
        return ResponseEntity.ok(authService.verifyEmail(request));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<MessageResponse> resendVerification(@RequestBody Map<String, String> body) {
        authService.resendVerification(body.get("email"));
        return ResponseEntity.ok(new MessageResponse("Nouveau code envoye par email"));
    }

    /** MOT DE PASSE OUBLIE : envoi du lien de reinitialisation par email. */
    @PostMapping("/forgot-password")
    public ResponseEntity<MessageResponse> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request) {
        authService.forgotPassword(request.email());
        // Reponse identique que le compte existe ou non (anti-enumeration).
        return ResponseEntity.ok(new MessageResponse(
                "Si un compte existe avec cet email, le lien de reinitialisation vient d'etre envoye."));
    }

    /** NOUVEAU MOT DE PASSE : application du token recu par email. */
    @PostMapping("/reset-password")
    public ResponseEntity<ResetPasswordResponse> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request.token(), request.newPassword());
        return ResponseEntity.ok(new ResetPasswordResponse(
                "Mot de passe modifie ! Connecte-toi maintenant avec ton nouveau mot de passe."));
    }

    /**
     * LOGOUT REEL (securite P0) : le JWT est revoque cote serveur (liste
     * noire) jusqu'a son expiration — un token vole ne reste plus utilisable
     * apres un logout, meme s'il etait encore valide 24 h.
     */
    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                authService.logout(token, jwtService.extractExpiration(token));
            } catch (Exception ignored) {
                // Token deja invalide/expire : rien a revoquer
            }
        }
        return ResponseEntity.ok(new MessageResponse("Deconnecte. A bientot sur YAM DJ !"));
    }

    // ================== CONNEXION GOOGLE (OAuth 2.0) ==================

    /**
     * Etat de la connexion Google : {"enabled": true/false} — le frontend
     * affiche le bouton Google en connaissance de cause.
     */
    @GetMapping("/oauth/google/status")
    public ResponseEntity<Map<String, Object>> googleStatus() {
        return ResponseEntity.ok(Map.of(
                "enabled", googleOAuthService.isConfigured(),
                "redirectUri", googleOAuthService.effectiveRedirectUri()));
    }

    /**
     * Demarre la connexion Google : renvoie l'URL de consentement a ouvrir
     * dans le navigateur. role = role souhaite pour un NOUVEAU compte
     * (USER | ARTIST | DJ — ignore si le compte existe deja).
     */
    @GetMapping("/oauth/google/url")
    public ResponseEntity<Map<String, String>> googleUrl(
            @RequestParam(defaultValue = "USER") String role) {
        return ResponseEntity.ok(Map.of("url", googleOAuthService.consentUrl(role)));
    }

    /**
     * Retour de Google (redirect_uri enregistre dans Google Cloud Console).
     * Echange le code, connecte/creer le compte, puis REDIRIGE le navigateur
     * vers {frontend}/oauth/callback#token=...&email=... (fragment : le JWT
     * n'apparait ni dans les logs serveur ni dans les en-tetes Referer).
     */
    @GetMapping("/oauth/google/callback")
    public ResponseEntity<Void> googleCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error) {

        String frontend = googleOAuthService.frontendCallbackUrl("");
        if (error != null && !error.isBlank()) {
            return redirect(UriComponentsBuilder.fromHttpUrl(frontend)
                    .fragment("error=" + encode("Connexion Google annulee ou refusee")).toUriString());
        }
        try {
            AuthResponse res = googleOAuthService.exchangeCode(code, state);
            String fragment = "token=" + encode(res.token())
                    + "&email=" + encode(res.email())
                    + "&pseudo=" + encode(res.pseudo())
                    + "&role=" + encode(res.role())
                    + "&emailVerified=" + res.emailVerified();
            return redirect(googleOAuthService.frontendCallbackUrl(fragment));
        } catch (Exception e) {
            String message = e.getMessage() == null ? "Connexion Google impossible" : e.getMessage();
            return redirect(UriComponentsBuilder.fromHttpUrl(frontend)
                    .fragment("error=" + encode(message)).toUriString());
        }
    }

    private static ResponseEntity<Void> redirect(String url) {
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(url)).build();
    }

    private static String encode(String value) {
        return value == null ? "" : java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }
}
