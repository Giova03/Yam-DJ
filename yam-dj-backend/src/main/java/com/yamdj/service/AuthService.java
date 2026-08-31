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

import java.util.Random;

/**
 * Authentification : inscription (USER / ARTIST / DJ), verification email
 * via code Brevo, login JWT.
 */
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final DjProfileRepository djProfileRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final BrevoEmailService emailService;

    public AuthService(UserRepository userRepository,
                       ArtistProfileRepository artistProfileRepository,
                       DjProfileRepository djProfileRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       BrevoEmailService emailService) {
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.djProfileRepository = djProfileRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException("Cet email est deja utilise");
        }
        if (userRepository.existsByPseudo(request.pseudo())) {
            throw new IllegalArgumentException("Ce pseudo est deja pris");
        }

        UserRole role = UserRole.valueOf(request.role() == null ? "USER" : request.role().toUpperCase());

        User user = User.builder()
                .email(request.email())
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

        // Envoi du code de verification
        String code = String.format("%06d", new Random().nextInt(1000000));
        user.setVerificationCode(code);
        userRepository.save(user);
        emailService.sendVerificationEmail(user.getEmail(), code);

        return new AuthResponse(null, user.getEmail(), user.getPseudo(),
                user.getRole().name(), false,
                "Inscription reussie ! Verifie ta boite mail pour activer ton compte.");
    }

    @Transactional
    public AuthResponse verifyEmail(VerifyRequest request) {
        User user = userRepository.findByEmailAndVerificationCode(request.email(), request.code())
                .orElseThrow(() -> new IllegalArgumentException("Code de verification invalide"));

        user.setEmailVerified(true);
        user.setEnabled(true);
        user.setVerificationCode(null);
        userRepository.save(user);

        String token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        return new AuthResponse(token, user.getEmail(), user.getPseudo(),
                user.getRole().name(), true, "Compte active avec succes !");
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new BadCredentialsException("Email ou mot de passe incorrect"));

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BadCredentialsException("Email ou mot de passe incorrect");
        }
        if (!user.isEnabled()) {
            throw new IllegalArgumentException("Compte desactive. Contacte le support.");
        }

        if (!user.isEmailVerified()) {
            // Renvoi automatique du code
            String code = String.format("%06d", new Random().nextInt(1000000));
            user.setVerificationCode(code);
            userRepository.save(user);
            emailService.sendVerificationEmail(user.getEmail(), code);
            return new AuthResponse(null, user.getEmail(), user.getPseudo(),
                    user.getRole().name(), false,
                    "Compte non active. Un nouveau code vient d'etre envoye par email.");
        }

        String token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        return new AuthResponse(token, user.getEmail(), user.getPseudo(),
                user.getRole().name(), true, "Connexion reussie");
    }

    @Transactional
    public void resendVerification(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Aucun compte avec cet email"));
        if (user.isEmailVerified()) {
            throw new IllegalArgumentException("Ce compte est deja active");
        }
        String code = String.format("%06d", new Random().nextInt(1000000));
        user.setVerificationCode(code);
        userRepository.save(user);
        emailService.sendVerificationEmail(email, code);
    }
}
