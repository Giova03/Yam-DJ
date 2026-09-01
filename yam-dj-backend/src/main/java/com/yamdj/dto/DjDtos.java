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
            boolean autoOrder,
            /** Prix FCFA (0/null = gratuite) — boutique Phase 3.4. */
            Integer priceXof
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
            Integer priceXof,
            /** Deja achetee par l'utilisateur courant (true si payante+achetee, gratuite= owners). */
            Boolean purchased,
            java.time.LocalDateTime createdAt
    ) {}

    public record AutoMixSuggestion(
            java.util.List<UUID> orderedTrackIds,
            double averageBpm,
            int transitionsCount,
            String analysis
    ) {}

    /**
     * Requete Auto-Mix IA. DTO type (remplace Map<String, List<UUID>>) :
     * la deserialisation tolerante ignore les champs supplementaires
     * (crossfadeSec envoye par erreur, etc.) au lieu de lever un 500
     * "Cannot deserialize ArrayList<UUID> from Integer".
     */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public record AutoMixRequest(
            java.util.List<UUID> trackIds
    ) {}
}
