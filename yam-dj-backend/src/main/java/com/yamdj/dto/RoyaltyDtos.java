package com.yamdj.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * DTOs redevances d'ecoute (Phase 3.3).
 */
public final class RoyaltyDtos {

    private RoyaltyDtos() {}

    /** Ligne mensuelle creditee a un artiste. */
    public record RoyaltyLine(
            String periodMonth,
            long plays,
            long amountXof,
            long balanceAfterXof
    ) {}

    /** Releve complet de l'artiste connecte. */
    public record ArtistRoyalties(
            long totalXof,
            long totalPlays,
            int monthsCount,
            List<RoyaltyLine> lines
    ) {}

    /** Resume d'un pool mensuel (vue admin). */
    public record PoolSummary(
            UUID id,
            String periodMonth,
            long poolAmountXof,
            long premiumShareXof,
            long mixtapeShareXof,
            long totalPlays,
            int artistCount,
            String status,
            LocalDateTime distributedAt
    ) {}
}
