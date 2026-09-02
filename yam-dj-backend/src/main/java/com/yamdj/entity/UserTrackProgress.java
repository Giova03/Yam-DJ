package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * REPRISE DE LECTURE : position par (utilisateur, piste).
 * Permet de reprendre une musique la ou on l'a laissee, y compris
 * apres changement d'appareil (sync backend).
 */
@Entity
@Table(name = "user_track_progress")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class UserTrackProgress {

    @EmbeddedId
    private UserTrackProgressId id;

    /** Position de lecture en secondes. */
    @Column(name = "position_sec", nullable = false)
    private Integer positionSec;

    /** Duree de la piste au moment de la sauvegarde. */
    @Column(name = "duration_sec")
    private Integer durationSec;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Embeddable
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class UserTrackProgressId implements Serializable {

        @Column(name = "user_id", nullable = false)
        private UUID userId;

        @Column(name = "track_id", nullable = false)
        private UUID trackId;
    }
}
