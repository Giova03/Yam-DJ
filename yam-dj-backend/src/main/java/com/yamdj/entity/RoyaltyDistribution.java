package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ligne de repartition des redevances : montant credite a un artiste
 * pour un mois donne, au prorata de ses ecoutes (Phase 3.3).
 */
@Entity
@Table(name = "royalty_distribution")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class RoyaltyDistribution {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "pool_id", nullable = false)
    private UUID poolId;

    /** Mois de reference "yyyy-MM" (denormalise pour les requetes artiste). */
    @Column(name = "period_month", nullable = false, length = 7)
    private String periodMonth;

    @Column(name = "artist_id", nullable = false)
    private UUID artistId;

    /** Ecoutes de l'artiste sur la periode. */
    @Column(name = "plays", nullable = false)
    @Builder.Default
    private long plays = 0;

    /** Montant credite en FCFA (arrondi au franc). */
    @Column(name = "amount_xof", nullable = false)
    @Builder.Default
    private long amountXof = 0;

    /** Solde de l'artiste apres credit (preuve comptable). */
    @Column(name = "balance_after_xof", nullable = false)
    @Builder.Default
    private long balanceAfterXof = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
