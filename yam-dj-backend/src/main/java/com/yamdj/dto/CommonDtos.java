package com.yamdj.dto;

import java.util.List;
import java.util.UUID;

/**
 * DTOs divers : recherche globale, playlists, profils publics.
 */
public final class CommonDtos {

    private CommonDtos() {}

    public record SearchResponse(
            List<TrackDtos.TrackResponse> tracks,
            List<ArtistPublicResponse> artists,
            List<DjPublicResponse> djs
    ) {}

    public record ArtistPublicResponse(
            UUID userId,
            String stageName,
            String bio,
            String photoUrl,
            String country,
            long totalPlays,
            long tracksCount
    ) {}

    public record DjPublicResponse(
            UUID userId,
            String djName,
            String bio,
            String photoUrl,
            int mixtapeCount
    ) {}

    public record PlaylistRequest(String name, String description, boolean isPublic, List<UUID> trackIds) {}

    public record PlaylistResponse(
            UUID id,
            String name,
            String description,
            String coverUrl,
            boolean isPublic,
            List<UUID> trackIds,
            java.time.LocalDateTime createdAt
    ) {}

    // ================== VAGUE 2 : hors ligne, partage, reprise ==================

    /** Ecoute accumulee hors ligne puis synchronisee (idempotente). */
    public record PlaySyncItem(
            UUID trackId,
            UUID clientEventId,
            String quality,
            Integer listenedSec
    ) {}

    public record PlaySyncRequest(List<PlaySyncItem> plays) {}

    public record PlaySyncResponse(int synced) {}

    /** Sauvegarde de la position de lecture (reprendre ou on s'est arrete). */
    public record ProgressRequest(UUID trackId, Integer positionSec, Integer durationSec) {}

    /** Envoi d'une piste a un ami YAM DJ (par pseudo). */
    public record ShareRequest(String toPseudo, String message) {}
}
