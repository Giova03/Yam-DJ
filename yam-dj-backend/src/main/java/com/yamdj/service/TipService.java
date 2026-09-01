package com.yamdj.service;

import com.yamdj.dto.PaymentDtos.*;
import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.Tip;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.TipStatus;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.TipRepository;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserRepository;
import com.yamdj.service.NotificationService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Monetisation : YAM Tips via mobile money (FedaPay : Orange Money,
 * Moov, MTN, Wave...).
 * Flux : creation du tip PENDING -> paiement sur la page FedaPay ->
 * retour frontend /tip/success + webhook -> double verification API ->
 * creditation du solde artiste + notification temps reel (WebSocket) +
 * email Brevo.
 */
@Service
public class TipService {

    private final TipRepository tipRepository;
    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final TrackRepository trackRepository;
    private final FedaPayService fedapayService;
    private final BrevoEmailService emailService;
    private final SimpMessagingTemplate messagingTemplate;
    private final NotificationService notificationService;

    public TipService(TipRepository tipRepository,
                      UserRepository userRepository,
                      ArtistProfileRepository artistProfileRepository,
                      TrackRepository trackRepository,
                      FedaPayService fedapayService,
                      BrevoEmailService emailService,
                      SimpMessagingTemplate messagingTemplate,
                      NotificationService notificationService) {
        this.tipRepository = tipRepository;
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.trackRepository = trackRepository;
        this.fedapayService = fedapayService;
        this.emailService = emailService;
        this.messagingTemplate = messagingTemplate;
        this.notificationService = notificationService;
    }

    private User currentUser() {
        org.springframework.security.core.Authentication auth =
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            return null; // Tip anonyme autorise
        }
        return userRepository.findByEmailIgnoreCase(auth.getName()).orElse(null);
    }

    /** Etape 1 : creation du tip + initiation du paiement CinetPay. */
    @Transactional
    public TipResponse createTip(TipRequest request) {
        User artist = userRepository.findById(request.artistId())
                .orElseThrow(() -> new ResourceNotFoundException("Artiste introuvable"));
        ArtistProfile profile = artistProfileRepository.findByUserId(artist.getId())
                .orElseThrow(() -> new IllegalArgumentException("Cet utilisateur n'est pas un artiste"));

        User fan = request.anonymous() ? null : currentUser();
        String fanEmail = fan != null ? fan.getEmail() : "fan@yamdj.africa";
        String fanName = fan != null ? fan.getPseudo() : "Fan YAM DJ";

        String description = "YAM Tip pour " + profile.getStageName()
                + (request.message() != null && !request.message().isBlank()
                ? " - " + request.message() : "");

        FedaPayService.PaymentInitiation initiation =
                fedapayService.initiatePayment(request.amountXof(), description, fanEmail, fanName);

        Tip tip = Tip.builder()
                .fromUserId(fan != null ? fan.getId() : null)
                .toArtistId(artist.getId())
                .amountXof(request.amountXof())
                .message(request.message())
                .paymentToken(initiation.paymentToken())
                .providerTxnId(String.valueOf(initiation.providerTxnId()))
                .status(TipStatus.PENDING)
                .build();
        tipRepository.save(tip);

        return new TipResponse(tip.getId(), initiation.paymentToken(),
                initiation.paymentUrl(), request.amountXof(), "PENDING");
    }

    /**
     * Etape 2 : confirmation via notre token interne (page de retour
     * frontend OU webhook FedaPay). Idempotent : un tip deja COMPLETED
     * n'est pas recredite.
     */
    @Transactional
    public TipResponse confirmTip(String paymentToken) {
        Tip tip = tipRepository.findByPaymentToken(paymentToken)
                .orElseThrow(() -> new ResourceNotFoundException("Tip introuvable : " + paymentToken));
        return confirm(tip);
    }

    /** Confirmation via l'identifiant de transaction FedaPay (webhook). */
    @Transactional
    public TipResponse confirmTipByTransaction(Long providerTxnId) {
        Tip tip = tipRepository.findByProviderTxnId(String.valueOf(providerTxnId))
                .orElseThrow(() -> new ResourceNotFoundException("Tip introuvable pour la transaction " + providerTxnId));
        return confirm(tip);
    }

    private TipResponse confirm(Tip tip) {
        if (tip.getStatus() == TipStatus.COMPLETED) {
            return new TipResponse(tip.getId(), tip.getPaymentToken(), null,
                    tip.getAmountXof(), "COMPLETED");
        }

        // Double verification aupres de FedaPay (securite anti-fraude)
        Long txnId = null;
        try {
            txnId = tip.getProviderTxnId() == null ? null : Long.parseLong(tip.getProviderTxnId());
        } catch (NumberFormatException ignored) {
        }
        FedaPayService.PaymentCheck check = fedapayService.checkTransaction(txnId);

        if ("COMPLETED".equals(check.status())) {
            tip.setStatus(TipStatus.COMPLETED);
            if (check.providerTxnId() != null) {
                tip.setProviderTxnId(check.providerTxnId());
            }
            tip.setCompletedAt(java.time.LocalDateTime.now());
            tipRepository.save(tip);

            // Creditation du solde artiste
            artistProfileRepository.findByUserId(tip.getToArtistId()).ifPresent(profile -> {
                profile.setBalanceXof(profile.getBalanceXof() + tip.getAmountXof());
                profile.setTotalTipsXof(profile.getTotalTipsXof() + tip.getAmountXof());
                artistProfileRepository.save(profile);

                // Notification temps reel sur le dashboard artiste
                messagingTemplate.convertAndSend(
                        "/topic/notifications/" + tip.getToArtistId(),
                        java.util.Map.of(
                                "type", "TIP_RECEIVED",
                                "amountXof", tip.getAmountXof(),
                                "message", tip.getMessage() == null ? "" : tip.getMessage(),
                                "timestamp", System.currentTimeMillis()));

                // Email de felicitation
                userRepository.findById(tip.getToArtistId()).ifPresent(artistUser ->
                        emailService.sendTipReceivedEmail(artistUser.getEmail(),
                                profile.getStageName(), tip.getAmountXof(),
                                fanPseudoOf(tip.getFromUserId()), tip.getMessage()));

                // Notification in-app + push (Phase 2.4)
                notificationService.notifyUser(tip.getToArtistId(), "TIP_RECEIVED",
                        "Tip recu : " + tip.getAmountXof() + " F",
                        fanPseudoOf(tip.getFromUserId()) + " te soutient avec "
                                + tip.getAmountXof() + " FCFA !",
                        "/dashboard");
            });

            return new TipResponse(tip.getId(), tip.getPaymentToken(), null,
                    tip.getAmountXof(), "COMPLETED");
        }

        if ("FAILED".equalsIgnoreCase(check.status())) {
            tip.setStatus(TipStatus.FAILED);
            tipRepository.save(tip);
        }

        return new TipResponse(tip.getId(), tip.getPaymentToken(), null,
                tip.getAmountXof(), check.status());
    }

    /** Statistiques du dashboard artiste. */
    @Transactional(readOnly = true)
    public ArtistStatsResponse artistStats(UUID artistId) {
        User artist = userRepository.findById(artistId)
                .orElseThrow(() -> new ResourceNotFoundException("Artiste introuvable"));
        ArtistProfile profile = artistProfileRepository.findByUserId(artist.getId())
                .orElseThrow(() -> new IllegalArgumentException("Profil artiste introuvable"));

        long tracksCount = trackRepository.countApprovedByArtist(artistId);

        return new ArtistStatsResponse(
                artistId, profile.getStageName(), profile.getBalanceXof(),
                profile.getTotalPlays(), profile.getTotalTipsXof(),
                tipRepository.countByToArtistIdAndStatus(artistId, TipStatus.COMPLETED),
                tracksCount, 0);
    }

    /** Historique des tips recus (dashboard artiste). */
    @Transactional(readOnly = true)
    public List<TipHistoryResponse> tipsReceived(UUID artistId, int limit) {
        return tipRepository.findTop50ByToArtistIdAndStatusOrderByCompletedAtDesc(
                        artistId, TipStatus.COMPLETED).stream()
                .limit(limit)
                .map(t -> new TipHistoryResponse(t.getId(), t.getAmountXof(), t.getMessage(),
                        t.getStatus().name(), fanPseudoOf(t.getFromUserId()), t.getCreatedAt()))
                .collect(Collectors.toList());
    }

    private String fanPseudoOf(UUID fanId) {
        if (fanId == null) return "Anonyme";
        return userRepository.findById(fanId).map(User::getPseudo).orElse("Anonyme");
    }
}
