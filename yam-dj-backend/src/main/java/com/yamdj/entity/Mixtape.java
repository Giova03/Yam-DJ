package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "mixtape")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class Mixtape {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /** DJ createur (user). */
    @Column(name = "dj_id", nullable = false)
    private UUID djId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    /** Mix final genere par FFmpeg (xfade). */
    @Column(name = "audio_url", length = 500)
    private String audioUrl;

    @Column(name = "duration_sec", nullable = false)
    @Builder.Default
    private int durationSec = 0;

    /** Ordre des pistes : "id1,id2,id3" (trie par l'Auto-Mix IA). */
    @Column(name = "track_ids")
    private String trackIds;

    /** Duree du crossfade en secondes. */
    @Column(name = "crossfade_sec", nullable = false)
    @Builder.Default
    private int crossfadeSec = 8;

    @Column(name = "play_count", nullable = false)
    @Builder.Default
    private long playCount = 0;

    /**
     * Prix en FCFA (Phase 3.4 — boutique de mixtapes). Null/0 = gratuite.
     * 70 % au DJ, 30 % a la plateforme (cagnotte redevances).
     */
    @Column(name = "price_xof")
    @Builder.Default
    private Integer priceXof = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
