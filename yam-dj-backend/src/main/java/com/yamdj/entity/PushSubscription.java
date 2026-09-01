package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Abonnement Web Push d'un utilisateur (navigateur). Les cles p256dh/auth
 * servent au chiffrement du payload ; l'endpoint est l'URL du service push
 * du navigateur (FCM pour Chrome, Mozilla autopush pour Firefox...).
 */
@Entity
@Table(name = "push_subscription",
        uniqueConstraints = @UniqueConstraint(name = "uq_push_endpoint", columnNames = "endpoint"))
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class PushSubscription {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 600)
    private String endpoint;

    /** Cle publique de chiffrement (base64url). */
    @Column(length = 200)
    private String p256dh;

    /** Secret d'authentification (base64url). */
    @Column(length = 150)
    private String auth;

    @Column(name = "user_agent", length = 300)
    private String userAgent;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
