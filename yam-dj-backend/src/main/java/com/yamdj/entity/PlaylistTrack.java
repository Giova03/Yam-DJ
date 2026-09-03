package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ligne de la table de liaison playlist <-> piste (V1.1).
 * Remplace l'ancien CSV "id1,id2,id3" dans playlist.track_ids :
 * une ligne par piste, avec sa position — recherche, tri, pagination
 * et statistiques deviennent possibles.
 */
@Entity
@Table(name = "playlist_track",
        uniqueConstraints = @UniqueConstraint(name = "uq_playlist_track",
                columnNames = {"playlist_id", "track_id"}))
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class PlaylistTrack {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "playlist_id", nullable = false)
    private UUID playlistId;

    @Column(name = "track_id", nullable = false)
    private UUID trackId;

    /** Position (0 = premiere) — ordre stable de la playlist. */
    @Column(nullable = false)
    @Builder.Default
    private int position = 0;

    @CreationTimestamp
    @Column(name = "added_at", nullable = false, updatable = false)
    private LocalDateTime addedAt;
}
