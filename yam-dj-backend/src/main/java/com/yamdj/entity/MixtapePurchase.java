package com.yamdj.entity;

import com.yamdj.entity.enums.TipStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Achat d'une mixtape payante (Phase 3.4 — Boutique de mixtapes).
 * Repartition : 70 % au DJ createur, 30 % a la plateforme (alimente la
 * cagnotte des redevances d'ecoute).
 */
@Entity
@Table(name = "mixtape_purchase")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class MixtapePurchase {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "mixtape_id", nullable = false)
    private UUID mixtapeId;

    /** Acheteur (fan). */
    @Column(name = "buyer_id", nullable = false)
    private UUID buyerId;

    /** DJ createur (denormalise pour le credit au webhook). */
    @Column(name = "dj_id", nullable = false)
    private UUID djId;

    @Column(name = "amount_xof", nullable = false)
    private int amountXof;

    /** Part DJ (70 %) creditee au createur. */
    @Column(name = "dj_share_xof", nullable = false)
    @Builder.Default
    private int djShareXof = 0;

    /** Part plateforme (30 %) qui alimente la cagnotte redevances. */
    @Column(name = "platform_share_xof", nullable = false)
    @Builder.Default
    private int platformShareXof = 0;

    @Column(name = "payment_token", nullable = false, unique = true, length = 30)
    private String paymentToken;

    @Column(name = "provider_txn_id", length = 40)
    private String providerTxnId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private TipStatus status = TipStatus.PENDING;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;
}
