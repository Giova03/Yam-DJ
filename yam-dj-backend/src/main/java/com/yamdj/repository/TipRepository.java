package com.yamdj.repository;

import com.yamdj.entity.Tip;
import com.yamdj.entity.enums.TipStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TipRepository extends JpaRepository<Tip, UUID> {

    Optional<Tip> findByPaymentToken(String paymentToken);

    Optional<Tip> findByProviderTxnId(String providerTxnId);

    List<Tip> findByToArtistIdOrderByCreatedAtDesc(UUID toArtistId);

    List<Tip> findTop50ByToArtistIdAndStatusOrderByCompletedAtDesc(UUID toArtistId, TipStatus status);

    long countByToArtistIdAndStatus(UUID toArtistId, TipStatus status);
}
