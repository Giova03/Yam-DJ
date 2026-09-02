package com.yamdj.dto;

import com.yamdj.entity.Track;
import com.yamdj.entity.enums.TrackStatus;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DTOs des pistes audio.
 */
public final class TrackDtos {

    private TrackDtos() {}

    public record TrackResponse(
            UUID id,
            String title,
            UUID artistId,
            String artistName,
            String artistPseudo,
            String audioUrlHq,
            String audioUrlLq,
            String coverUrl,
            int durationSec,
            Integer bpm,
            String musicalKey,
            String camelot,
            String genre,
            String country,
            long playCount,
            long likeCount,
            TrackStatus status,
            boolean dataLiteReady,
            String youtubeId,
            String source,
            String sourceArtist,
            String sourceUrl,
            LocalDateTime createdAt
    ) {}

    public record TrackPageResponse(
            java.util.List<TrackResponse> content,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {}

    public record PlayRequest(UUID trackId, String quality) {}

    public record LikeResponse(long likeCount, boolean liked) {}

    public static TrackResponse from(Track t, String artistName, String artistPseudo) {
        return new TrackResponse(
                t.getId(), t.getTitle(), t.getArtistId(), artistName, artistPseudo,
                t.getAudioUrlHq(), t.getAudioUrlLq(), t.getCoverUrl(),
                t.getDurationSec(), t.getBpm(), t.getMusicalKey(), t.getCamelot(),
                t.getGenre(), t.getCountry(), t.getPlayCount(), t.getLikeCount(),
                t.getStatus(), t.isDataLiteReady(),
                t.getYoutubeId(), t.getSource(), t.getSourceArtist(), t.getSourceUrl(), t.getCreatedAt()
        );
    }
}
