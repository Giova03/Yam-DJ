package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * PARTAGE DE PISTE IN-APP : un utilisateur envoie une piste a un autre
 * utilisateur (par pseudo), avec un petit message. Genere aussi une
 * notification cote destinataire (voir NotificationService).
 */
@Entity
@Table(name = "track_share")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class TrackShare {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "from_user_id")
    private UUID fromUserId;

    @Column(name = "to_user_id", nullable = false)
    private UUID toUserId;

    @Column(name = "track_id", nullable = false)
    private UUID trackId;

    /** Petit message optionnel (300 max). */
    @Column(name = "message", length = 300)
    private String message;

    /** Date de lecture par le destinataire (null = pas encore vu). */
    @Column(name = "seen_at")
    private LocalDateTime seenAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
