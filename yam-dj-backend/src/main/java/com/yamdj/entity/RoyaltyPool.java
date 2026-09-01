package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Cagnotte mensuelle des redevances d'ecoute (Phase 3.3).
 *
 * Chaque mois, une part des revenus de la plateforme (part plateforme des
 * abonnements Premium + part 30 % des achats de mixtapes) est mise en
 * cagnotte puis repartie au prorata des ecoutes entre les artistes.
 */
@Entity
@Table(name = "royalty_pool")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class RoyaltyPool {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /** Mois de reference au format "yyyy-MM" (periode ecoutee). */
    @Column(name = "period_month", nullable = false, unique = true, length = 7)
    private String periodMonth;

    /** Montant total de la cagnotte en FCFA. */
    @Column(name = "pool_amount_xof", nullable = false)
    @Builder.Default
    private long poolAmountXof = 0;

    /** Part des revenus Premium mise en cagnotte. */
    @Column(name = "premium_share_xof", nullable = false)
    @Builder.Default
    private long premiumShareXof = 0;

    /** Part 30 % des achats de mixtapes mise en cagnotte. */
    @Column(name = "mixtape_share_xof", nullable = false)
    @Builder.Default
    private long mixtapeShareXof = 0;

    /** Nombre total d'ecoutes comptabilisees sur la periode. */
    @Column(name = "total_plays", nullable = false)
    @Builder.Default
    private long totalPlays = 0;

    /** Nombre d'artistes credites. */
    @Column(name = "artist_count", nullable = false)
    @Builder.Default
    private int artistCount = 0;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "DISTRIBUTED";

    @Column(name = "distributed_at")
    private LocalDateTime distributedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
