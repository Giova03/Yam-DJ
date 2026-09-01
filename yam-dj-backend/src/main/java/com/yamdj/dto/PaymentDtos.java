package com.yamdj.dto;

import java.util.UUID;

/**
 * DTOs monetaires (Tips / FedaPay / statistiques artiste).
 */
public final class PaymentDtos {

    private PaymentDtos() {}

    public record TipRequest(
            UUID artistId,
            @jakarta.validation.constraints.Min(100) @jakarta.validation.constraints.Max(100000)
            int amountXof,
            String message,
            boolean anonymous
    ) {}

    public record TipResponse(
            UUID tipId,
            String paymentToken,
            String paymentUrl,
            int amountXof,
            String status
    ) {}

    public record ArtistStatsResponse(
            UUID artistId,
            String stageName,
            long balanceXof,
            long totalPlays,
            long totalTipsXof,
            long tipsCount,
            long tracksCount,
            long fansCount
    ) {}

    public record TipHistoryResponse(
            UUID id,
            int amountXof,
            String message,
            String status,
            String fanPseudo,
            java.time.LocalDateTime createdAt
    ) {}

    /** Abonnement Premium Fan (500 F / 30 jours). */
    public record PremiumResponse(
            UUID orderId,
            String paymentToken,
            String paymentUrl,
            int amountXof,
            int periodDays,
            String status
    ) {}

    /** Achat d'une mixtape payante (boutique 3.4, 70/30). */
    public record MixtapePurchaseResponse(
            UUID purchaseId,
            UUID mixtapeId,
            String mixtapeTitle,
            String paymentToken,
            String paymentUrl,
            int amountXof,
            int djShareXof,
            String status
    ) {}
}
