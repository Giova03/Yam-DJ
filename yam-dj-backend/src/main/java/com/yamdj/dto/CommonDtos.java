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
}
