package com.yamdj.entity;

import com.yamdj.entity.enums.TipStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "tip")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class Tip {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /** Fan qui envoie le tip (nullable = anonyme). */
    @Column(name = "from_user_id")
    private UUID fromUserId;

    /** Artiste destinataire. */
    @Column(name = "to_artist_id", nullable = false)
    private UUID toArtistId;

    /** Montant en FCFA (min 100 XOF, max 100 000 XOF). */
    @Column(name = "amount_xof", nullable = false)
    private int amountXof;

    @Column(length = 300)
    private String message;

    /** Token unique genere par nous pour suivre le paiement CinetPay. */
    @Column(name = "payment_token", unique = true, length = 100)
    private String paymentToken;

    /** Identifiant de transaction CinetPay. */
    @Column(name = "cinetpay_id", length = 100)
    private String cinetpayId;

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
