package com.yamdj.entity;

import com.yamdj.entity.enums.WithdrawalStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Demande de retrait artiste : solde YAM DJ -> mobile money (Orange,
 * Moov, MTN, Wave). Validation manuelle par un admin (Phase 3.2 du
 * ROADMAP), puis debit du solde et email de confirmation.
 */
@Entity
@Table(name = "withdrawal_request", indexes = {
        @Index(name = "idx_withdrawal_user", columnList = "user_id"),
        @Index(name = "idx_withdrawal_status", columnList = "status")
})
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class WithdrawalRequest {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "amount_xof", nullable = false)
    private int amountXof;

    /** ORANGE | MOOV | MTN | WAVE. */
    @Column(nullable = false, length = 20)
    private String operator;

    /** Numero mobile money de reception. */
    @Column(nullable = false, length = 30)
    private String phone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private WithdrawalStatus status = WithdrawalStatus.PENDING;

    /** Motif du refus (admin). */
    @Column(name = "admin_note", length = 500)
    private String adminNote;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;
}
