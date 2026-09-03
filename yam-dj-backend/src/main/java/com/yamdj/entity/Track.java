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

    /** Identifiant YouTube (11 car.) : piste lue via le player integre. */
    @Column(name = "youtube_id", length = 20, unique = true)
    private String youtubeId;

    /** Origine : UPLOAD (fichier), YOUTUBE (import utilisateur), LIBRE (catalogue gratuit). */
    @Column(length = 20)
    @Builder.Default
    private String source = "UPLOAD";

    /** Nom d'artiste d'origine (chaine YouTube / pays d'un hymne). */
    @Column(name = "source_artist", length = 150)
    private String sourceArtist;

    /** URL source (page YouTube d'origine). */
    @Column(name = "source_url", length = 500)
    private String sourceUrl;

    @Column(name = "data_lite_ready", nullable = false)
    @Builder.Default
    private boolean dataLiteReady = false;

    // ============ PIPELINE ASYNCHRONE (V1.1) ============

    /** Erreur du dernier traitement (statut FAILED). */
    @Column(name = "processing_error", columnDefinition = "TEXT")
    private String processingError;

    @Column(name = "processing_started_at")
    private LocalDateTime processingStartedAt;

    @Column(name = "processing_completed_at")
    private LocalDateTime processingCompletedAt;

    @Column(name = "retry_count", nullable = false)
    @Builder.Default
    private int retryCount = 0;

    /** Cle du fichier source dans le stockage (retry sans re-upload). */
    @Column(name = "source_key", length = 500)
    private String sourceKey;

    /** Slug SEO public : /track/{slug}. */
    @Column(length = 220, unique = true)
    private String slug;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
