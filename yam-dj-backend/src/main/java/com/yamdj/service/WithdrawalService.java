package com.yamdj.service;

import com.yamdj.dto.WithdrawalDtos.WithdrawalResponse;
import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.User;
import com.yamdj.entity.WithdrawalRequest;
import com.yamdj.entity.enums.WithdrawalStatus;
import com.yamdj.exception.ApiException;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.UserRepository;
import com.yamdj.repository.WithdrawalRequestRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Retraits artistes (Phase 3.2) : solde YAM DJ -> mobile money.
 * Seuil minimum 5 000 F, validation manuelle admin (paiement reel via
 * Orange/Moov/MTN/Wave depuis le compte marchand), debit du solde a la
 * validation, email + notification in-app a chaque etape.
 */
@Service
public class WithdrawalService {

    private static final Logger log = LoggerFactory.getLogger(WithdrawalService.class);

    /** Seuil minimum de retrait (FCFA). */
    public static final int MIN_WITHDRAWAL_XOF = 5000;

    /** Operateurs mobile money acceptes. */
    private static final Set<String> OPERATORS = Set.of("ORANGE", "MOOV", "MTN", "WAVE");

    private final WithdrawalRequestRepository withdrawalRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final UserRepository userRepository;
    private final BrevoEmailService emailService;
    private final NotificationService notificationService;

    public WithdrawalService(WithdrawalRequestRepository withdrawalRepository,
                             ArtistProfileRepository artistProfileRepository,
                             UserRepository userRepository,
                             BrevoEmailService emailService,
                             NotificationService notificationService) {
        this.withdrawalRepository = withdrawalRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.userRepository = userRepository;
        this.emailService = emailService;
        this.notificationService = notificationService;
    }

    /** L'artiste connecte demande un retrait vers son mobile money. */
    @Transactional
    public WithdrawalResponse create(User user, int amountXof, String operator, String phone) {
        ArtistProfile profile = artistProfileRepository.findByUserId(user.getId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST,
                        "Seuls les artistes avec un profil peuvent demander un retrait"));

        if (amountXof < MIN_WITHDRAWAL_XOF) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Montant minimum de retrait : " + MIN_WITHDRAWAL_XOF + " F");
        }
        if (amountXof > profile.getBalanceXof()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Solde insuffisant : " + profile.getBalanceXof() + " F disponibles");
        }
        String op = normalizeOperator(operator);
        if (op == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Operateur invalide (ORANGE, MOOV, MTN ou WAVE)");
        }
        if (phone == null || !phone.replaceAll("[^0-9]", "").matches("\\d{8,15}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Numero mobile money invalide (8 a 15 chiffres)");
        }
        long pending = withdrawalRepository.findTop100ByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .filter(w -> w.getStatus() == WithdrawalStatus.PENDING).count();
        if (pending >= 3) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Trop de demandes en attente : attends la validation des precedentes");
        }

        WithdrawalRequest w = withdrawalRepository.save(WithdrawalRequest.builder()
                .userId(user.getId())
                .amountXof(amountXof)
                .operator(op)
                .phone(phone.trim())
                .status(WithdrawalStatus.PENDING)
                .build());
        log.info("Demande de retrait {} : {} F vers {} (user {})", w.getId(), amountXof, op, user.getEmail());
        return WithdrawalResponse.from(w, user.getPseudo());
    }

    /** Historique des demandes de l'artiste connecte. */
    @Transactional(readOnly = true)
    public List<WithdrawalResponse> mine(UUID userId) {
        return withdrawalRepository.findTop100ByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(w -> WithdrawalResponse.from(w, pseudoOf(w.getUserId())))
                .toList();
    }

    /** File de validation admin (statut optionnel). */
    @Transactional(readOnly = true)
    public List<WithdrawalResponse> all(String status) {
        List<WithdrawalRequest> rows = (status == null || status.isBlank())
                ? withdrawalRepository.findTop100ByOrderByCreatedAtDesc()
                : withdrawalRepository.findTop100ByStatusOrderByCreatedAtDesc(
                        WithdrawalStatus.valueOf(status.toUpperCase(Locale.ROOT)));
        return rows.stream().map(w -> WithdrawalResponse.from(w, pseudoOf(w.getUserId()))).toList();
    }

    /** Validation : debite le solde, marque APPROVED, previent l'artiste. */
    @Transactional
    public WithdrawalResponse approve(UUID withdrawalId) {
        WithdrawalRequest w = load(withdrawalId);
        if (w.getStatus() != WithdrawalStatus.PENDING) {
            throw new ApiException(HttpStatus.CONFLICT, "Demande deja traitee (" + w.getStatus() + ")");
        }
        ArtistProfile profile = artistProfileRepository.findByUserId(w.getUserId())
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "Profil artiste introuvable"));
        if (profile.getBalanceXof() < w.getAmountXof()) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Solde artiste devenu insuffisant (" + profile.getBalanceXof() + " F)");
        }

        profile.setBalanceXof(profile.getBalanceXof() - w.getAmountXof());
        artistProfileRepository.save(profile);

        w.setStatus(WithdrawalStatus.APPROVED);
        w.setProcessedAt(LocalDateTime.now());
        withdrawalRepository.save(w);

        String email = userRepository.findById(w.getUserId()).map(User::getEmail).orElse(null);
        if (email != null) {
            emailService.sendWithdrawalApprovedEmail(email, profile.getStageName(),
                    w.getAmountXof(), w.getOperator(), w.getPhone());
        }
        notificationService.notifyUser(w.getUserId(), "WITHDRAWAL_APPROVED",
                "Retrait valide",
                w.getAmountXof() + " F en cours de versement vers " + labelOf(w.getOperator())
                        + " (" + w.getPhone() + ").",
                "/dashboard");
        log.info("Retrait {} approuve : {} F vers {}", withdrawalId, w.getAmountXof(), w.getOperator());
        return WithdrawalResponse.from(w, pseudoOf(w.getUserId()));
    }

    /** Refus avec note admin. */
    @Transactional
    public WithdrawalResponse reject(UUID withdrawalId, String note) {
        WithdrawalRequest w = load(withdrawalId);
        if (w.getStatus() != WithdrawalStatus.PENDING) {
            throw new ApiException(HttpStatus.CONFLICT, "Demande deja traitee (" + w.getStatus() + ")");
        }
        w.setStatus(WithdrawalStatus.REJECTED);
        w.setAdminNote(note == null ? "" : note.trim());
        w.setProcessedAt(LocalDateTime.now());
        withdrawalRepository.save(w);

        String email = userRepository.findById(w.getUserId()).map(User::getEmail).orElse(null);
        if (email != null) {
            emailService.sendWithdrawalRejectedEmail(email, w.getAmountXof(), w.getAdminNote());
        }
        notificationService.notifyUser(w.getUserId(), "WITHDRAWAL_REJECTED",
                "Retrait refuse",
                "Ta demande de " + w.getAmountXof() + " F a ete refusee."
                        + (w.getAdminNote().isBlank() ? "" : " Motif : " + w.getAdminNote()),
                "/dashboard");
        return WithdrawalResponse.from(w, pseudoOf(w.getUserId()));
    }

    private WithdrawalRequest load(UUID id) {
        return withdrawalRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Demande de retrait introuvable"));
    }

    private static String normalizeOperator(String operator) {
        if (operator == null) return null;
        String op = operator.trim().toUpperCase(Locale.ROOT)
                .replace("ORANGE MONEY", "ORANGE")
                .replace("MTN MOMO", "MTN")
                .replace("MTN MONEY", "MTN");
        return OPERATORS.contains(op) ? op : null;
    }

    private static String labelOf(String operator) {
        return switch (operator) {
            case "ORANGE" -> "Orange Money";
            case "MOOV" -> "Moov Money";
            case "MTN" -> "MTN MoMo";
            case "WAVE" -> "Wave";
            default -> operator;
        };
    }

    private String pseudoOf(UUID userId) {
        return userRepository.findById(userId).map(User::getPseudo).orElse("inconnu");
    }
}
