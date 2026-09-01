package com.yamdj.service;

import com.yamdj.dto.PaymentDtos.PremiumResponse;
import com.yamdj.entity.PremiumOrder;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.TipStatus;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.PremiumOrderRepository;
import com.yamdj.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Abonnement Premium Fan (Phase 3.1) : 500 F / 30 jours via FedaPay.
 *
 * Cycle : POST /api/payment/premium (ordre PENDING + page de paiement)
 * -> paiement mobile money -> webhook FedaPay OU page de retour ->
 * double verification GET /v1/transactions/{id} -> premium_until =
 * max(maintenant, premium_until actuel) + 30 jours -> email + notification.
 * Les renouvellements se cumulent (prolongation).
 */
@Service
public class PremiumService {

    private static final Logger log = LoggerFactory.getLogger(PremiumService.class);

    @Value("${yamdj.premium.price-xof:500}")
    private int priceXof;

    @Value("${yamdj.premium.period-days:30}")
    private int periodDays;

    private final PremiumOrderRepository orderRepository;
    private final UserRepository userRepository;
    private final FedaPayService fedapayService;
    private final BrevoEmailService emailService;
    private final NotificationService notificationService;

    public PremiumService(PremiumOrderRepository orderRepository,
                          UserRepository userRepository,
                          FedaPayService fedapayService,
                          BrevoEmailService emailService,
                          NotificationService notificationService) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
        this.fedapayService = fedapayService;
        this.emailService = emailService;
        this.notificationService = notificationService;
    }

    /** Prix mensuel affiche (frontend). */
    public int price() {
        return priceXof;
    }

    public int periodDays() {
        return periodDays;
    }

    /** Etape 1 : creation de l'ordre + initiation du paiement FedaPay. */
    @Transactional
    public PremiumResponse initPremium(User user) {
        FedaPayService.PaymentInitiation initiation = fedapayService.initiatePayment(
                priceXof,
                "YAM DJ Premium - Abonnement Fan " + periodDays + " jours",
                user.getEmail(),
                user.getPseudo());

        PremiumOrder order = PremiumOrder.builder()
                .userId(user.getId())
                .amountXof(priceXof)
                .periodDays(periodDays)
                .paymentToken(initiation.paymentToken())
                .providerTxnId(String.valueOf(initiation.providerTxnId()))
                .status(TipStatus.PENDING)
                .build();
        orderRepository.save(order);
        log.info("Ordre Premium cree pour {} ({} F)", user.getEmail(), priceXof);

        return new PremiumResponse(order.getId(), initiation.paymentToken(),
                initiation.paymentUrl(), priceXof, periodDays, "PENDING");
    }

    /** Confirmation par token interne (page de retour /premium/success). */
    @Transactional
    public PremiumResponse confirmByToken(String paymentToken) {
        PremiumOrder order = orderRepository.findByPaymentToken(paymentToken)
                .orElseThrow(() -> new ResourceNotFoundException("Ordre Premium introuvable : " + paymentToken));
        return confirm(order);
    }

    /** Confirmation par transaction FedaPay (webhook). */
    @Transactional
    public PremiumResponse confirmByTransaction(Long providerTxnId) {
        PremiumOrder order = orderRepository.findByProviderTxnId(String.valueOf(providerTxnId))
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Ordre Premium introuvable pour la transaction " + providerTxnId));
        return confirm(order);
    }

    private PremiumResponse confirm(PremiumOrder order) {
        if (order.getStatus() == TipStatus.COMPLETED) {
            return toResponse(order, "COMPLETED");
        }

        Long txnId = null;
        try {
            txnId = order.getProviderTxnId() == null ? null : Long.parseLong(order.getProviderTxnId());
        } catch (NumberFormatException ignored) {
        }
        FedaPayService.PaymentCheck check = fedapayService.checkTransaction(txnId);

        if ("COMPLETED".equals(check.status())) {
            order.setStatus(TipStatus.COMPLETED);
            order.setCompletedAt(LocalDateTime.now());
            orderRepository.save(order);

            User user = userRepository.findById(order.getUserId()).orElse(null);
            if (user != null) {
                // Prolongation : les renouvellements se cumulent
                LocalDateTime base = user.getPremiumUntil() != null
                        && user.getPremiumUntil().isAfter(LocalDateTime.now())
                        ? user.getPremiumUntil() : LocalDateTime.now();
                user.setPremiumUntil(base.plusDays(order.getPeriodDays()));
                userRepository.save(user);

                emailService.sendPremiumActivatedEmail(user.getEmail(),
                        user.getPseudo(), order.getPeriodDays(), user.getPremiumUntil());
                notificationService.notifyUser(user.getId(), "PREMIUM_ACTIVATED",
                        "Premium active !",
                        "Ton abonnement Premium Fan est actif " + order.getPeriodDays()
                                + " jours. Merci pour ton soutien !",
                        "/profile");
                log.info("Premium active pour {} jusqu'a {}", user.getEmail(), user.getPremiumUntil());
            }
            return toResponse(order, "COMPLETED");
        }

        if ("FAILED".equalsIgnoreCase(check.status())) {
            order.setStatus(TipStatus.FAILED);
            orderRepository.save(order);
        }
        return toResponse(order, check.status());
    }

    private PremiumResponse toResponse(PremiumOrder order, String status) {
        return new PremiumResponse(order.getId(), order.getPaymentToken(), null,
                order.getAmountXof(), order.getPeriodDays(), status);
    }

    /** Utilisateur premium actif (MeController). */
    public static boolean isPremium(User user) {
        return user != null && user.getPremiumUntil() != null
                && user.getPremiumUntil().isAfter(LocalDateTime.now());
    }
}
