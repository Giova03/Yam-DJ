package com.yamdj.entity;

import com.yamdj.entity.enums.TrackStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "track")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class Track {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(nullable = false, length = 200)
    private String title;

    /** Artiste (user) proprietaire. */
    @Column(name = "artist_id", nullable = false)
    private UUID artistId;

    /** URL HLS haute qualite 128 kbps. */
    @Column(name = "audio_url_hq", length = 500)
    private String audioUrlHq;

    /** URL HLS basse qualite 48 kbps (Mode Data-Lite). */
    @Column(name = "audio_url_lq", length = 500)
    private String audioUrlLq;

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    @Column(name = "duration_sec", nullable = false)
    @Builder.Default
    private int durationSec = 0;

    /** BPM detecte automatiquement par l'analyse FFmpeg. */
    private Integer bpm;

    /** Tonalite (ex : Am, F#m). */
    @Column(name = "musical_key", length = 6)
    private String musicalKey;

    /** Code Camelot pour le mix harmonique. */
    @Column(length = 4)
    private String camelot;

    private String genre;

    private String country;

    @Builder.Default
    private String language = "FR";

    @Column(name = "play_count", nullable = false)
    @Builder.Default
    private long playCount = 0;

    @Column(name = "like_count", nullable = false)
    @Builder.Default
    private long likeCount = 0;

    @Column(name = "download_count", nullable = false)
    @Builder.Default
    private long downloadCount = 0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private TrackStatus status = TrackStatus.PENDING;

    @Column(name = "data_lite_ready", nullable = false)
    @Builder.Default
    private boolean dataLiteReady = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
