package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Notification in-app : centre de notifications (cloche navbar) + relais
 * temps reel (WebSocket) + declencheur de push Web (push_subscription).
 */
@Entity
@Table(name = "notification", indexes = {
        @Index(name = "idx_notification_user", columnList = "user_id, created_at DESC")
})
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class AppNotification {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** TIP_RECEIVED, TRACK_APPROVED, NEW_TRACK, COMMENT_NEW, WITHDRAWAL_APPROVED, WITHDRAWAL_REJECTED, PREMIUM_ACTIVATED, TEST... */
    @Column(nullable = false, length = 40)
    private String type;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(nullable = false, length = 500)
    private String body;

    /** Lien interne optionnel (/track/{id}, /dashboard...). */
    @Column(name = "link_url", length = 300)
    private String linkUrl;

    @Column(name = "is_read", nullable = false)
    @Builder.Default
    private boolean read = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
