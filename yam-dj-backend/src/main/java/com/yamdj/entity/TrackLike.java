package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/** Like d'une piste par un utilisateur (unique par couple). */
@Entity
@Table(name = "track_like", uniqueConstraints = {
        @UniqueConstraint(name = "uq_track_like_user_track", columnNames = {"user_id", "track_id"})
})
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class TrackLike {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "track_id", nullable = false)
    private UUID trackId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
