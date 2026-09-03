package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Evenement analytics produit (V1.1) — funnel artiste notamment :
 * landing_view, artist_cta_click, signup_started, signup_completed,
 * upload_started, upload_completed, track_published, track_played...
 *
 * KPI North Star (recommandation equipe) :
 * "Published Artists" = artistes possedant >= 1 piste APPROVED.
 */
@Entity
@Table(name = "analytics_event",
        indexes = {
                @Index(name = "idx_analytics_event_name", columnList = "event_name, created_at"),
                @Index(name = "idx_analytics_event_user", columnList = "user_id")
        })
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class AnalyticsEvent {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(name = "event_name", nullable = false, length = 60)
    private String eventName;

    @Column(name = "user_id")
    private UUID userId;

    /** Contexte libre et borne (nom de page, genre, origine...). */
    @Column(length = 300)
    private String metadata;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
