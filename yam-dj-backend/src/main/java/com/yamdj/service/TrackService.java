package com.yamdj.service;

import com.yamdj.dto.CommonDtos.*;
import com.yamdj.dto.TrackDtos;
import com.yamdj.dto.TrackDtos.*;
import com.yamdj.entity.PlayHistory;
import com.yamdj.entity.Track;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;

/**
 * Gestion des pistes : upload + traitement FFmpeg (HLS HQ/Lite, BPM),
 * feed "Pour Toi", tendance, comptage des ecoutes.
 */
@Service
public class TrackService {

    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final PlayHistoryRepository playHistoryRepository;
    private final SupabaseStorageService storage;
    private final AudioProcessingService audioProcessor;

    public TrackService(TrackRepository trackRepository,
                        UserRepository userRepository,
                        ArtistProfileRepository artistProfileRepository,
                        PlayHistoryRepository playHistoryRepository,
                        SupabaseStorageService storage,
                        AudioProcessingService audioProcessor) {
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.playHistoryRepository = playHistoryRepository;
        this.storage = storage;
        this.audioProcessor = audioProcessor;
    }

    /** Utilisateur courant depuis le contexte Spring Security. */
    public User currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            throw new IllegalStateException("Authentification requise");
        }
        return userRepository.findByEmail(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    @Transactional
    public TrackResponse uploadTrack(String title, String genre, String country, String musicalKey,
                                     MultipartFile audioFile, MultipartFile coverFile,
                                     Integer bpm) {
        User artist = currentUser();
        if (artist.getRole() != com.yamdj.entity.enums.UserRole.ARTIST
                && artist.getRole() != com.yamdj.entity.enums.UserRole.ADMIN) {
            throw new IllegalArgumentException("Seuls les artistes peuvent publier des pistes");
        }
        if (audioFile == null || audioFile.isEmpty()) {
            throw new IllegalArgumentException("Fichier audio obligatoire");
        }

        String trackId = UUID.randomUUID().toString();

        // Upload du fichier source dans un fichier temporaire
        File tempAudio;
        try {
            String original = audioFile.getOriginalFilename() == null ? "upload.mp3"
                    : audioFile.getOriginalFilename();
            tempAudio = File.createTempFile("yam-upload-", "-" + original);
            tempAudio.deleteOnExit();
            Files.copy(audioFile.getInputStream(), tempAudio.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("Impossible de lire le fichier audio : " + e.getMessage());
        }

        // Traitement : mastering + HLS 128k + HLS 48k (Data-Lite) + BPM
        AudioProcessingService.ProcessedAudio processed;
        try {
            processed = audioProcessor.processTrack(tempAudio, trackId);
        } catch (Exception e) {
            throw new IllegalStateException("Traitement audio echoue : " + e.getMessage());
        }

        // Pochette optionnelle
        String coverKey = null;
        if (coverFile != null && !coverFile.isEmpty()) {
            try {
                coverKey = storage.uploadMultipart(coverFile, "covers");
            } catch (IOException e) {
                throw new IllegalStateException("Upload de la pochette echoue : " + e.getMessage());
            }
        }

        Track track = Track.builder()
                .title(title)
                .artistId(artist.getId())
                .audioUrlHq(storage.publicUrl(processed.hlsKey()))
                .audioUrlLq(storage.publicUrl(processed.liteKey()))
                .coverUrl(storage.publicUrl(coverKey))
                .durationSec(processed.durationSec())
                .bpm(bpm != null ? bpm : processed.bpm())
                .musicalKey(musicalKey)
                .camelot(com.yamdj.service.HarmonicMixService.toCamelot(musicalKey))
                .genre(genre == null || genre.isBlank() ? "Afrobeats" : genre)
                .country(country == null || country.isBlank() ? artist.getCountry() : country)
                .status(TrackStatus.PENDING)
                .dataLiteReady(true)
                .build();

        track = trackRepository.save(track);
        try {
            Files.deleteIfExists(tempAudio.toPath());
        } catch (IOException e) {
            // Nettoyage du fichier temporaire non bloquant
        }

        String stageName = artistProfileRepository.findByUserId(artist.getId())
                .map(p -> p.getStageName()).orElse(artist.getPseudo());
        return TrackDtos.from(track, stageName, artist.getPseudo());
    }

    @Transactional(readOnly = true)
    public TrackPageResponse search(String q, String genre, String country, int page, int size) {
        Pageable pageable = PageRequest.of(page, Math.min(size, 50));
        Page<Track> result = trackRepository.searchTracks(
                (q == null || q.isBlank()) ? null : q,
                (genre == null || genre.isBlank() || "all".equals(genre)) ? null : genre,
                (country == null || country.isBlank() || "all".equals(country)) ? null : country,
                pageable);

        List<TrackResponse> content = result.getContent().stream()
                .map(t -> {
                    String name = userRepository.findById(t.getArtistId())
                            .map(u -> artistProfileRepository.findByUserId(u.getId())
                                    .map(p -> p.getStageName()).orElse(u.getPseudo()))
                            .orElse("Artiste inconnu");
                    String pseudo = userRepository.findById(t.getArtistId())
                            .map(User::getPseudo).orElse("unknown");
                    return TrackDtos.from(t, name, pseudo);
                }).toList();

        return new TrackPageResponse(content, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> feed(int limit) {
        return trackRepository.findTrending(PageRequest.of(0, Math.min(limit, 50))).stream()
                .map(t -> TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> trending(int limit) {
        return trackRepository.findTrending(PageRequest.of(0, Math.min(limit, 50))).stream()
                .map(t -> TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> latest(int limit) {
        return trackRepository.findLatest(PageRequest.of(0, Math.min(limit, 50))).stream()
                .map(t -> TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public TrackResponse getById(UUID id) {
        Track t = trackRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + id));
        return TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId()));
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> byArtist(UUID artistId) {
        return trackRepository.findByArtistIdOrderByCreatedAtDesc(artistId).stream()
                .filter(t -> t.getStatus() == TrackStatus.APPROVED
                        || t.getArtistId().equals(currentUserOpt().map(User::getId).orElse(null)))
                .map(t -> TrackDtos.from(t, artistNameOf(artistId), pseudoOf(artistId)))
                .toList();
    }

    /** Enregistre une ecoute : compteur + historique + stats artiste. */
    @Transactional
    public void registerPlay(UUID trackId, UUID userId) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + trackId));
        track.setPlayCount(track.getPlayCount() + 1);
        trackRepository.save(track);

        artistProfileRepository.findByUserId(track.getArtistId()).ifPresent(profile -> {
            profile.setTotalPlays(profile.getTotalPlays() + 1);
            artistProfileRepository.save(profile);
        });

        if (userId != null) {
            playHistoryRepository.save(PlayHistory.builder()
                    .userId(userId).trackId(trackId).build());
        }
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> history(UUID userId, int limit) {
        return playHistoryRepository
                .findByUserIdOrderByPlayedAtDesc(userId, PageRequest.of(0, Math.min(limit, 100)))
                .stream()
                .map(h -> trackRepository.findById(h.getTrackId()).orElse(null))
                .filter(t -> t != null && t.getStatus() == TrackStatus.APPROVED)
                .map(t -> TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> recommendedForYou(UUID userId, int limit) {
        // Recommandation simple : pistes approvees non deja ecoutees, trieees par popularite
        List<UUID> listened = playHistoryRepository.findDistinctTrackIds(userId);
        return trackRepository.findTrending(PageRequest.of(0, Math.min(limit * 2, 100))).stream()
                .filter(t -> !listened.contains(t.getId()))
                .limit(limit)
                .map(t -> TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId())))
                .toList();
    }

    @Transactional
    public LikeResponse like(UUID trackId) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable"));
        track.setLikeCount(track.getLikeCount() + 1);
        trackRepository.save(track);
        return new LikeResponse(track.getLikeCount(), true);
    }

    @Transactional
    public void incrementDownload(UUID trackId) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable"));
        track.setDownloadCount(track.getDownloadCount() + 1);
        trackRepository.save(track);
    }

    /** URL de stream absolue selon la qualite (hq / lite). */
    @Transactional(readOnly = true)
    public String streamUrl(UUID trackId, String quality) {
        Track t = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + trackId));
        if (t.getStatus() != TrackStatus.APPROVED) {
            throw new IllegalArgumentException("Piste pas encore validee par la moderation");
        }
        String key = "lite".equalsIgnoreCase(quality) && t.getAudioUrlLq() != null
                ? t.getAudioUrlLq() : t.getAudioUrlHq();
        return storage.publicUrl(key);
    }

    private java.util.Optional<User> currentUserOpt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            return java.util.Optional.empty();
        }
        return userRepository.findByEmail(auth.getName());
    }

    private String artistNameOf(UUID artistId) {
        return userRepository.findById(artistId)
                .map(u -> artistProfileRepository.findByUserId(u.getId())
                        .map(p -> p.getStageName()).orElse(u.getPseudo()))
                .orElse("Artiste inconnu");
    }

    private String pseudoOf(UUID artistId) {
        return userRepository.findById(artistId).map(User::getPseudo).orElse("unknown");
    }
}
