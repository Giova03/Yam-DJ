package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ligne de la table de liaison mixtape <-> piste (V1.1).
 * Remplace l'ancien CSV mixtape.track_ids.
 */
@Entity
@Table(name = "mixtape_track",
        uniqueConstraints = @UniqueConstraint(name = "uq_mixtape_track",
                columnNames = {"mixtape_id", "track_id"}))
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class MixtapeTrack {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "mixtape_id", nullable = false)
    private UUID mixtapeId;

    @Column(name = "track_id", nullable = false)
    private UUID trackId;

    /** Position dans le mix (ordre decide par le DJ / l'Auto-Mix IA). */
    @Column(nullable = false)
    @Builder.Default
    private int position = 0;

    @CreationTimestamp
    @Column(name = "added_at", nullable = false, updatable = false)
    private LocalDateTime addedAt;
}
