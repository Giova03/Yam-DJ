package com.yamdj.service;

import com.yamdj.dto.AuthDtos.*;
import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.DjProfile;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.UserRole;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.DjProfileRepository;
import com.yamdj.repository.UserRepository;
import com.yamdj.security.JwtService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;

/**
 * Authentification : inscription (USER / ARTIST / DJ), verification email
 * via code Brevo, login JWT, mot de passe oublie (token hash SHA-256),
 * logout reel (liste noire des JWT).
 */
@Service
public class AuthService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final DjProfileRepository djProfileRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final BrevoEmailService emailService;
    private final com.yamdj.security.TokenBlacklistService tokenBlacklist;

    public AuthService(UserRepository userRepository,
                       ArtistProfileRepository artistProfileRepository,
                       DjProfileRepository djProfileRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       BrevoEmailService emailService,
                       com.yamdj.security.TokenBlacklistService tokenBlacklist) {
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.djProfileRepository = djProfileRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.tokenBlacklist = tokenBlacklist;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new IllegalArgumentException("Cet email est deja utilise");
        }
        if (userRepository.existsByPseudo(request.pseudo())) {
            throw new IllegalArgumentException("Ce pseudo est deja pris");
        }

        UserRole role = UserRole.valueOf(request.role() == null ? "USER" : request.role().toUpperCase());

        User user = User.builder()
                .email(email)
                .password(passwordEncoder.encode(request.password()))
                .pseudo(request.pseudo())
                .role(role)
                .phone(request.phone())
                .country(request.country() == null || request.country().isBlank()
                        ? "Burkina Faso" : request.country())
                .emailVerified(false)
                .build();

        // Creation automatique du profil selon le role
        if (role == UserRole.ARTIST) {
            String stageName = (request.stageName() == null || request.stageName().isBlank())
                    ? request.pseudo() : request.stageName();
            ArtistProfile profile = ArtistProfile.builder()
                    .user(user)
                    .stageName(stageName)
                    .bio("")
                    .build();
            user.setAvatarUrl(null);
            user = userRepository.save(user);
            artistProfileRepository.save(profile);
        } else if (role == UserRole.DJ) {
            String djName = (request.stageName() == null || request.stageName().isBlank())
                    ? "DJ " + request.pseudo() : request.stageName();
            DjProfile profile = DjProfile.builder()
                    .user(user)
                    .djName(djName)
                    .bio("")
                    .build();
            user = userRepository.save(user);
            djProfileRepository.save(profile);
        } else {
            user = userRepository.save(user);
        }

        // Envoi du code de verification (SecureRandom : non previsible)
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        user.setVerificationCode(code);
        userRepository.save(user);
        emailService.sendVerificationEmail(email, code);

        return new AuthResponse(null, user.getEmail(), user.getPseudo(),
                user.getRole().name(), false,
                "Inscription reussie ! Verifie ta boite mail pour activer ton compte.");
    }

    /**
     * Normalise un code saisi : retire espaces et tout caractere non numerique
     * (le copier-coller depuis les clients mail insere souvent des espaces).
     */
    private String normalizeCode(String raw) {
        if (raw == null) return null;
        String digits = raw.replaceAll("[^0-9]", "");
        return digits.length() >= 6 ? digits.substring(0, 6) : raw.trim();
    }

    @Transactional
    public AuthResponse verifyEmail(VerifyRequest request) {
        String email = request.email() == null ? "" : request.email().trim().toLowerCase();
        String code = normalizeCode(request.code());

        User user = userRepository.findByEmailIgnoreCaseAndVerificationCode(email, code)
                .orElseThrow(() -> new IllegalArgumentException("Code de verification invalide"));

        user.setEmailVerified(true);
        user.setEnabled(true);
        user.setVerificationCode(null);
        userRepository.save(user);

        String token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        return new AuthResponse(token, user.getEmail(), user.getPseudo(),
                user.getRole().name(), true, "Compte active avec succes !");
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        String email = request.email() == null ? "" : request.email().trim().toLowerCase();
        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new BadCredentialsException("Email ou mot de passe incorrect"));

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BadCredentialsException("Email ou mot de passe incorrect");
        }
        if (!user.isEnabled()) {
            throw new IllegalArgumentException("Compte desactive. Contacte le support.");
        }

        if (!user.isEmailVerified()) {
            // Renvoi du code : on garde le code existant s'il est encore valide
            // pour ne pas invalider l'email deja recu par l'utilisateur.
            String code = user.getVerificationCode();
            if (code == null || code.isBlank()) {
                code = String.format("%06d", RANDOM.nextInt(1_000_000));
                user.setVerificationCode(code);
                userRepository.save(user);
            }
            emailService.sendVerificationEmail(user.getEmail(), code);
            return new AuthResponse(null, user.getEmail(), user.getPseudo(),
                    user.getRole().name(), false,
                    "Compte non active. Le code de verification vient d'etre renvoye par email.");
        }

        String token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        return new AuthResponse(token, user.getEmail(), user.getPseudo(),
                user.getRole().name(), true, "Connexion reussie");
    }

    @Transactional
    public void resendVerification(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase();
        User user = userRepository.findByEmailIgnoreCase(normalized)
                .orElseThrow(() -> new IllegalArgumentException("Aucun compte avec cet email"));
        if (user.isEmailVerified()) {
            throw new IllegalArgumentException("Ce compte est deja active");
        }
        String code = user.getVerificationCode();
        if (code == null || code.isBlank()) {
            code = String.format("%06d", RANDOM.nextInt(1_000_000));
            user.setVerificationCode(code);
            userRepository.save(user);
        }
        emailService.sendVerificationEmail(user.getEmail(), code);
    }

    /**
     * MOT DE PASSE OUBLIE (etape 1) : genere un token usage unique de 30 min
     * et envoie le lien de reinitialisation par email. Reponse volontairement
     * identique que l'email existe ou non (anti-enumeration de comptes).
     */
    @Transactional
    public void forgotPassword(String rawEmail) {
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase();
        userRepository.findByEmailIgnoreCase(email).ifPresent(user -> {
            // Jeton aleatoire 256 bits (hex) — seul son SHA-256 est stocke en
            // base (directive securite : une fuite de DB ne permet pas de
            // reinitialiser les mots de passe).
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            String token = HexFormat.of().formatHex(bytes);

            user.setResetToken(sha256(token));
            user.setResetTokenExpiresAt(LocalDateTime.now().plusMinutes(30));
            userRepository.save(user);
            emailService.sendResetPasswordEmail(user.getEmail(), user.getPseudo(), token);
        });
    }

    /**
     * MOT DE PASSE OUBLIE (etape 2) : applique le nouveau mot de passe si le
     * token est valide et non expire. Invalide le token (usage unique) et
     * reactive le compte au passage.
     */
    @Transactional
    public void resetPassword(String token, String newPassword) {
        User user = userRepository.findByResetToken(sha256(token == null ? "" : token.trim()))
                .orElseThrow(() -> new IllegalArgumentException("Lien de reinitialisation invalide"));
        if (user.getResetTokenExpiresAt() == null
                || user.getResetTokenExpiresAt().isBefore(LocalDateTime.now())) {
            user.setResetToken(null);
            user.setResetTokenExpiresAt(null);
            userRepository.save(user);
            throw new IllegalArgumentException("Lien expire — demande un nouveau lien de reinitialisation");
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setResetToken(null);
        user.setResetTokenExpiresAt(null);
        // Un reset de mot de passe prouve la possession de la boite mail :
        // on reactive le compte et confirme l'email si ce n'etait pas fait.
        user.setEnabled(true);
        if (!user.isEmailVerified()) {
            user.setEmailVerified(true);
            user.setVerificationCode(null);
        }
        userRepository.save(user);
    }

    /** LOGOUT REEL : le JWT est revoque cote serveur jusqu'a son expiration. */
    public void logout(String token, long expirationEpochMs) {
        tokenBlacklist.revoke(token, expirationEpochMs);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 indisponible", e);
        }
    }
}
