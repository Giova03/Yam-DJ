package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Abonnement d'un fan a un artiste (feed "Abonnements" + compteur fans).
 */
@Entity
@Table(name = "user_follow",
        uniqueConstraints = @UniqueConstraint(name = "uq_follow_follower_artist",
                columnNames = {"follower_id", "artist_id"}))
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class UserFollow {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /** Fan qui suit. */
    @Column(name = "follower_id", nullable = false)
    private UUID followerId;

    /** Artiste suivi. */
    @Column(name = "artist_id", nullable = false)
    private UUID artistId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
