package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "play_history")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class PlayHistory {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /** Utilisateur connecte (null = ecoute anonyme, comptee dans les charts). */
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "track_id", nullable = false)
    private UUID trackId;

    @CreationTimestamp
    @Column(name = "played_at", nullable = false, updatable = false)
    private LocalDateTime playedAt;

    /** Idempotence du sync hors ligne : identifiant d'evenement genere cote client. */
    @Column(name = "client_event_id", unique = true)
    private UUID clientEventId;

    /** Duree reellement ecoutee (secondes) — statistiques et redevances. */
    @Column(name = "listened_sec")
    private Integer listenedSec;

    /** Qualite utilisee : hq | lite | youtube | local. */
    @Column(name = "quality", length = 10)
    private String quality;

    /** Ecoute comptee hors ligne puis synchronisee au retour du reseau. */
    @Column(name = "offline", nullable = false)
    @Builder.Default
    private Boolean offline = Boolean.FALSE;
}
