package com.yamdj.repository;

import com.yamdj.entity.MixtapePurchase;
import com.yamdj.entity.enums.TipStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MixtapePurchaseRepository extends JpaRepository<MixtapePurchase, UUID> {

    Optional<MixtapePurchase> findByPaymentToken(String paymentToken);

    Optional<MixtapePurchase> findByProviderTxnId(String providerTxnId);

    boolean existsByMixtapeIdAndBuyerIdAndStatus(UUID mixtapeId, UUID buyerId, TipStatus status);

    List<MixtapePurchase> findByBuyerIdAndStatusOrderByCreatedAtDesc(UUID buyerId, TipStatus status);

    /** Achats confirmes d'une periode (cagnotte redevances). */
    List<MixtapePurchase> findByStatusAndCompletedAtBetween(TipStatus status,
                                                            LocalDateTime from, LocalDateTime to);
}
