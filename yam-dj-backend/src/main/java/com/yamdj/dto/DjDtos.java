package com.yamdj.dto;

import java.util.UUID;

/**
 * DTOs DJ (mixtapes + studio).
 */
public final class DjDtos {

    private DjDtos() {}

    public record CreateMixtapeRequest(
            String title,
            java.util.List<UUID> trackIds,
            int crossfadeSec,
            boolean autoOrder
    ) {}

    public record MixtapeResponse(
            UUID id,
            UUID djId,
            String djName,
            String title,
            String coverUrl,
            String audioUrl,
            int durationSec,
            String trackIds,
            int crossfadeSec,
            long playCount,
            java.time.LocalDateTime createdAt
    ) {}

    public record AutoMixSuggestion(
            java.util.List<UUID> orderedTrackIds,
            double averageBpm,
            int transitionsCount,
            String analysis
    ) {}
}
