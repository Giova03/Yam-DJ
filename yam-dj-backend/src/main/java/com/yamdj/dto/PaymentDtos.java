package com.yamdj.dto;

import java.util.UUID;

/**
 * DTOs monetaires (Tips / CinetPay / statistiques artiste).
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

    public record TipWebhookPayload(
            String payment_token,
            String status,
            String transaction_id,
            Double amount,
            String currency,
            String description
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
}
