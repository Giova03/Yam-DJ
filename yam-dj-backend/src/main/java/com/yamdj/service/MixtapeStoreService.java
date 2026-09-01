package com.yamdj.service;

import com.yamdj.dto.PaymentDtos.MixtapePurchaseResponse;
import com.yamdj.entity.DjProfile;
import com.yamdj.entity.Mixtape;
import com.yamdj.entity.MixtapePurchase;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.TipStatus;
import com.yamdj.exception.ApiException;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.DjProfileRepository;
import com.yamdj.repository.MixtapePurchaseRepository;
import com.yamdj.repository.MixtapeRepository;
import com.yamdj.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Boutique de mixtapes (Phase 3.4) : mixtapes payantes avec revenus
 * partages 70/30 (DJ / plateforme).
 *
 * Cycle : POST /api/payment/mixtape/{id} (ordre PENDING + page FedaPay)
 * -> paiement mobile money -> webhook FedaPay OU page de retour ->
 * double verification -> credit des 70 % au solde DJ + deblocage
 * permanent pour l'acheteur. Les 30 % plateforme alimentent la cagnotte
 * des redevances d'ecoute (RoyaltyService).
 */
@Service
public class MixtapeStoreService {

    private static final Logger log = LoggerFactory.getLogger(MixtapeStoreService.class);
    /** Part du DJ createur (en pourcentage). */
    public static final int DJ_SHARE_PERCENT = 70;
    /** Prix maximum d'une mixtape (garde-fou anti-erreur de saisie). */
    public static final int MAX_PRICE_XOF = 50000;
    /** Prix minimum facturable via FedaPay. */
    public static final int MIN_PRICE_XOF = 100;

    private final MixtapeRepository mixtapeRepository;
    private final MixtapePurchaseRepository purchaseRepository;
    private final DjProfileRepository djProfileRepository;
    private final UserRepository userRepository;
    private final FedaPayService fedapayService;
    private final BrevoEmailService emailService;
    private final NotificationService notificationService;

    public MixtapeStoreService(MixtapeRepository mixtapeRepository,
                               MixtapePurchaseRepository purchaseRepository,
                               DjProfileRepository djProfileRepository,
                               UserRepository userRepository,
                               FedaPayService fedapayService,
                               BrevoEmailService emailService,
                               NotificationService notificationService) {
        this.mixtapeRepository = mixtapeRepository;
        this.purchaseRepository = purchaseRepository;
        this.djProfileRepository = djProfileRepository;
        this.userRepository = userRepository;
        this.fedapayService = fedapayService;
        this.emailService = emailService;
        this.notificationService = notificationService;
    }

    /** Validation du prix saisi par le DJ (0/null = gratuit). */
    public int sanitizePrice(Integer priceXof) {
        if (priceXof == null || priceXof <= 0) {
            return 0;
        }
        if (priceXof < MIN_PRICE_XOF) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Prix minimum d'une mixtape : " + MIN_PRICE_XOF + " F");
        }
        if (priceXof > MAX_PRICE_XOF) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Prix maximum d'une mixtape : " + MAX_PRICE_XOF + " F");
        }
        return priceXof;
    }

    /**
     * Verifie l'acces a une mixtape payante : DJ proprietaire, ADMIN,
     * acheteur confirme, ou mixtape gratuite. Sinon 402 (paiement requis).
     */
    public void assertAccess(Mixtape mixtape, UUID currentUserId) {
        if (mixtape.getPriceXof() == null || mixtape.getPriceXof() <= 0) {
            return;
        }
        if (currentUserId == null) {
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED,
                    "Mixtape payante (" + mixtape.getPriceXof() + " F) — connexion requise pour l'acheter");
        }
        if (currentUserId.equals(mixtape.getDjId())) {
            return;
        }
        User user = userRepository.findById(currentUserId).orElse(null);
        if (user != null && user.getRole() == com.yamdj.entity.enums.UserRole.ADMIN) {
            return;
        }
        if (purchaseRepository.existsByMixtapeIdAndBuyerIdAndStatus(
                mixtape.getId(), currentUserId, TipStatus.COMPLETED)) {
            return;
        }
        throw new ApiException(HttpStatus.PAYMENT_REQUIRED,
                "Mixtape payante : " + mixtape.getPriceXof() + " F pour la debloquer a vie");
    }

    /** L'acheteur possede-t-il deja cette mixtape ? */
    public boolean hasPurchased(UUID mixtapeId, UUID buyerId) {
        return purchaseRepository.existsByMixtapeIdAndBuyerIdAndStatus(
                mixtapeId, buyerId, TipStatus.COMPLETED);
    }

    /** Mes mixtapes achetees (bibliotheque fan). */
    @Transactional(readOnly = true)
    public List<Mixtape> myPurchasedMixtapes(UUID buyerId) {
        return purchaseRepository
                .findByBuyerIdAndStatusOrderByCreatedAtDesc(buyerId, TipStatus.COMPLETED)
                .stream()
                .map(p -> mixtapeRepository.findById(p.getMixtapeId()).orElse(null))
                .filter(m -> m != null)
                .toList();
    }

    /** Etape 1 : creation de l'ordre d'achat + page de paiement FedaPay. */
    @Transactional
    public MixtapePurchaseResponse initPurchase(User buyer, UUID mixtapeId) {
        Mixtape mixtape = mixtapeRepository.findById(mixtapeId)
                .orElseThrow(() -> new ResourceNotFoundException("Mixtape introuvable : " + mixtapeId));
        if (mixtape.getPriceXof() == null || mixtape.getPriceXof() <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cette mixtape est gratuite");
        }
        if (buyer.getId().equals(mixtape.getDjId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Tu ne peux pas acheter ta propre mixtape");
        }
        if (hasPurchased(mixtapeId, buyer.getId())) {
            throw new ApiException(HttpStatus.CONFLICT, "Tu possedes deja cette mixtape");
        }

        int price = mixtape.getPriceXof();
        int djShare = price * DJ_SHARE_PERCENT / 100;
        int platformShare = price - djShare;

        FedaPayService.PaymentInitiation initiation = fedapayService.initiatePayment(
                price,
                "YAM DJ — Mixtape \"" + mixtape.getTitle() + "\"",
                buyer.getEmail(),
                buyer.getPseudo());

        MixtapePurchase purchase = MixtapePurchase.builder()
                .mixtapeId(mixtapeId)
                .buyerId(buyer.getId())
                .djId(mixtape.getDjId())
                .amountXof(price)
                .djShareXof(djShare)
                .platformShareXof(platformShare)
                .paymentToken(initiation.paymentToken())
                .providerTxnId(String.valueOf(initiation.providerTxnId()))
                .status(TipStatus.PENDING)
                .build();
        purchaseRepository.save(purchase);
        log.info("Achat mixtape {} initie par {} ({} F)", mixtapeId, buyer.getEmail(), price);

        return new MixtapePurchaseResponse(purchase.getId(), mixtapeId, mixtape.getTitle(),
                initiation.paymentToken(), initiation.paymentUrl(), price, djShare, "PENDING");
    }

    /** Confirmation par token interne (page de retour). */
    @Transactional
    public MixtapePurchaseResponse confirmByToken(String paymentToken) {
        MixtapePurchase purchase = purchaseRepository.findByPaymentToken(paymentToken)
                .orElseThrow(() -> new ResourceNotFoundException("Achat introuvable : " + paymentToken));
        return confirm(purchase);
    }

    /** Confirmation par transaction FedaPay (webhook). */
    @Transactional
    public MixtapePurchaseResponse confirmByTransaction(Long providerTxnId) {
        MixtapePurchase purchase = purchaseRepository.findByProviderTxnId(String.valueOf(providerTxnId))
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Achat mixtape introuvable pour la transaction " + providerTxnId));
        return confirm(purchase);
    }

    private MixtapePurchaseResponse confirm(MixtapePurchase purchase) {
        if (purchase.getStatus() == TipStatus.COMPLETED) {
            return toResponse(purchase, "COMPLETED");
        }

        Long txnId = null;
        try {
            txnId = purchase.getProviderTxnId() == null ? null
                    : Long.parseLong(purchase.getProviderTxnId());
        } catch (NumberFormatException ignored) {
        }
        FedaPayService.PaymentCheck check = fedapayService.checkTransaction(txnId);

        if ("COMPLETED".equals(check.status())) {
            purchase.setStatus(TipStatus.COMPLETED);
            purchase.setCompletedAt(LocalDateTime.now());
            purchaseRepository.save(purchase);

            creditDj(purchase);
            notifyBuyer(purchase);
            return toResponse(purchase, "COMPLETED");
        }

        if ("FAILED".equalsIgnoreCase(check.status())) {
            purchase.setStatus(TipStatus.FAILED);
            purchaseRepository.save(purchase);
        }
        return toResponse(purchase, check.status());
    }

    private void creditDj(MixtapePurchase purchase) {
        DjProfile profile = djProfileRepository.findByUserId(purchase.getDjId()).orElse(null);
        Mixtape mixtape = mixtapeRepository.findById(purchase.getMixtapeId()).orElse(null);
        String title = mixtape != null ? mixtape.getTitle() : "mixtape";

        if (profile != null) {
            profile.setBalanceXof(profile.getBalanceXof() + purchase.getDjShareXof());
            djProfileRepository.save(profile);

            User dj = profile.getUser();
            if (dj != null) {
                try {
                    emailService.sendMixtapeSaleEmail(dj.getEmail(), profile.getDjName(),
                            title, purchase.getDjShareXof(), profile.getBalanceXof());
                    notificationService.notifyUser(dj.getId(), "MIXTAPE_SOLD",
                            "Mixtape vendue !",
                            "Ta mixtape \"" + title + "\" vient de trouver un acheteur. "
                                    + purchase.getDjShareXof() + " F credites (part DJ 70 %). "
                                    + "Solde : " + profile.getBalanceXof() + " F.",
                            "/profile");
                } catch (Exception e) {
                    log.warn("Notification vente mixtape non envoyee : {}", e.getMessage());
                }
            }
            log.info("Vente mixtape {} : {} F credites au DJ {}", purchase.getMixtapeId(),
                    purchase.getDjShareXof(), purchase.getDjId());
        }
    }

    private void notifyBuyer(MixtapePurchase purchase) {
        User buyer = userRepository.findById(purchase.getBuyerId()).orElse(null);
        Mixtape mixtape = mixtapeRepository.findById(purchase.getMixtapeId()).orElse(null);
        if (buyer == null || mixtape == null) {
            return;
        }
        try {
            emailService.sendMixtapePurchasedEmail(buyer.getEmail(), buyer.getPseudo(),
                    mixtape.getTitle(), purchase.getAmountXof());
            notificationService.notifyUser(buyer.getId(), "MIXTAPE_UNLOCKED",
                    "Mixtape debloquee",
                    "\"" + mixtape.getTitle() + "\" est a toi ! A l'ecoute illimitee dans ta bibliotheque.",
                    "/playlists");
        } catch (Exception e) {
            log.warn("Notification achat mixtape non envoyee : {}", e.getMessage());
        }
    }

    private MixtapePurchaseResponse toResponse(MixtapePurchase p, String status) {
        Mixtape mixtape = mixtapeRepository.findById(p.getMixtapeId()).orElse(null);
        return new MixtapePurchaseResponse(p.getId(), p.getMixtapeId(),
                mixtape != null ? mixtape.getTitle() : "", p.getPaymentToken(), null,
                p.getAmountXof(), p.getDjShareXof(), status);
    }
}
