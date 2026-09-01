package com.yamdj.entity;

import com.yamdj.entity.enums.TipStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Commande d'abonnement Premium Fan (500 F / 30 jours) via FedaPay.
 * Meme cycle de vie que les tips : PENDING -> COMPLETED (double
 * verification API) ou FAILED. La confirmation prolonge premium_until
 * de l'utilisateur.
 */
@Entity
@Table(name = "premium_order", indexes = {
        @Index(name = "idx_premium_order_user", columnList = "user_id")
})
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class PremiumOrder {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "amount_xof", nullable = false)
    private int amountXof;

    /** Duree d'activite creditee en jours (30 par defaut). */
    @Column(name = "period_days", nullable = false)
    @Builder.Default
    private int periodDays = 30;

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
