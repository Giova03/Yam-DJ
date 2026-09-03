package com.yamdj.service;

import com.yamdj.entity.Track;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.repository.TrackRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * JOB DE TRAITEMENT AUDIO (V1.1 — pipeline asynchrone).
 *
 * La requete HTTP d'upload se termine IMMEDIATEMENT apres stockage du
 * fichier source ; ce service execute ensuite en tache de fond :
 *
 *   FFmpeg (mastering -14 LUFS + HLS 128k + HLS Data-Lite 48k + BPM)
 *     -> upload des rendus vers le stockage durable
 *     -> statut APPROVED (auto-approve) ou PENDING (moderation)
 *     -> notification a l'artiste
 *
 * En cas d'echec : statut FAILED + message dans processing_error, retry
 * possible sans re-upload (le fichier source reste dans le stockage).
 */
@Service
public class TrackProcessingService {

    private static final Logger log = LoggerFactory.getLogger(TrackProcessingService.class);

    private final TrackRepository trackRepository;
    private final AudioProcessingService audioProcessor;
    private final NotificationService notificationService;
    private final SupabaseStorageService storage;

    @Value("${yamdj.moderation.auto-approve:true}")
    private boolean autoApprove;

    public TrackProcessingService(TrackRepository trackRepository,
                                  AudioProcessingService audioProcessor,
                                  NotificationService notificationService,
                                  SupabaseStorageService storage) {
        this.trackRepository = trackRepository;
        this.audioProcessor = audioProcessor;
        this.notificationService = notificationService;
        this.storage = storage;
    }

    /**
     * Traite une piste en arriere-plan. Appel via l'executeur dedie.
     * IMPORTANT : transaction separee de la requete HTTP d'upload (la piste
     * en statut PROCESSING est deja visible en base quand le job demarre).
     */
    @Async("trackProcessingExecutor")
    @Transactional
    public void processAsync(UUID trackId, File sourceFile) {
        Track track = trackRepository.findById(trackId).orElse(null);
        if (track == null) {
            cleanup(sourceFile);
            return;
        }
        // Doublon de job (double-clic / retry concurrent) : un job deja en
        // cours depuis moins de 30 min est ignore.
        if (track.getStatus() == TrackStatus.PROCESSING
                && track.getProcessingStartedAt() != null
                && track.getProcessingStartedAt().isAfter(LocalDateTime.now().minusMinutes(30))) {
            cleanup(sourceFile);
            return;
        }

        try {
            track.setStatus(TrackStatus.PROCESSING);
            track.setProcessingStartedAt(LocalDateTime.now());
            track.setProcessingError(null);
            trackRepository.saveAndFlush(track);

            AudioProcessingService.ProcessedAudio processed =
                    audioProcessor.processTrack(sourceFile, trackId.toString());

            track.setAudioUrlHq(processed.hlsKey() != null
                    ? storage.publicUrl(processed.hlsKey()) : null);
            track.setAudioUrlLq(processed.liteKey() != null
                    ? storage.publicUrl(processed.liteKey()) : null);
            track.setDurationSec(processed.durationSec());
            if (processed.bpm() != null) {
                track.setBpm(processed.bpm()); // auto-detection, correction manuelle possible
            }
            if (track.getMusicalKey() == null || track.getMusicalKey().isBlank()) {
                track.setMusicalKey(processed.musicalKey());
                track.setCamelot(com.yamdj.service.HarmonicMixService.toCamelot(processed.musicalKey()));
            }
            track.setDataLiteReady(processed.liteKey() != null);
            track.setProcessingCompletedAt(LocalDateTime.now());
            track.setStatus(autoApprove ? TrackStatus.APPROVED : TrackStatus.PENDING);
            trackRepository.save(track);

            if (autoApprove) {
                notify(track, "TRACK_PUBLISHED", "Ta piste est en ligne",
                        "\"" + track.getTitle() + "\" est visible par toute la communaute. Bonne diffusion !");
            }
            log.info("Piste {} traitee avec succes ({} s)", trackId, processed.durationSec());
        } catch (Exception e) {
            log.error("Traitement audio echoue pour {} : {}", trackId, e.getMessage(), e);
            track.setProcessingCompletedAt(LocalDateTime.now());
            track.setProcessingError(truncate(e.getMessage(), 1500));
            track.setStatus(TrackStatus.FAILED);
            trackRepository.save(track);
            notify(track, "TRACK_FAILED", "Traitement impossible",
                    "Le traitement de \"" + track.getTitle()
                            + "\" a echoue. Reessaie depuis ton tableau de bord (bouton Relancer).");
        } finally {
            cleanup(sourceFile);
        }
    }

    private void notify(Track track, String type, String title, String body) {
        try {
            notificationService.notifyUser(track.getArtistId(), type, title, body,
                    "/track/" + track.getId());
        } catch (Exception notifEx) {
            log.warn("Notification non envoyee : {}", notifEx.getMessage());
        }
    }

    private static void cleanup(File file) {
        if (file == null) return;
        try {
            Files.deleteIfExists(file.toPath());
        } catch (Exception ignored) {
            // Nettoyage non bloquant (deleteOnExit en filet de securite)
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) return "Erreur inconnue";
        return value.length() <= max ? value : value.substring(0, max) + "...";
    }
}
