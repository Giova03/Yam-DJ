package com.yamdj.repository;

import com.yamdj.entity.PremiumOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PremiumOrderRepository extends JpaRepository<PremiumOrder, UUID> {

    Optional<PremiumOrder> findByPaymentToken(String paymentToken);

    Optional<PremiumOrder> findByProviderTxnId(String providerTxnId);

    List<PremiumOrder> findTop50ByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Abonnements confirmes d'une periode (cagnotte redevances 3.3). */
    List<PremiumOrder> findByStatusAndCompletedAtBetween(com.yamdj.entity.enums.TipStatus status,
                                                         java.time.LocalDateTime from,
                                                         java.time.LocalDateTime to);
}
