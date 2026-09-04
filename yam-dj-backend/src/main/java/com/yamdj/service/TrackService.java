package com.yamdj.service;

import com.yamdj.dto.CommonDtos;
import com.yamdj.dto.CommonDtos.*;
import com.yamdj.dto.TrackDtos;
import com.yamdj.dto.TrackDtos.*;
import com.yamdj.entity.PlayHistory;
import com.yamdj.entity.PlaylistTrack;
import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.MixtapeTrack;
import com.yamdj.entity.Track;
import com.yamdj.entity.TrackLike;
import com.yamdj.entity.TrackShare;
import com.yamdj.entity.User;
import com.yamdj.entity.UserTrackProgress;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.entity.enums.UserRole;
import com.yamdj.exception.ApiException;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Gestion des pistes : upload + traitement FFmpeg (HLS HQ/Lite, BPM),
 * feed "Pour Toi", tendance, comptage des ecoutes.
 */
@Service
public class TrackService {

    private static final Logger log = LoggerFactory.getLogger(TrackService.class);

    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final PlayHistoryRepository playHistoryRepository;
    private final PlaylistTrackRepository playlistTrackRepository;
    private final MixtapeTrackRepository mixtapeTrackRepository;
    private final TrackLikeRepository trackLikeRepository;
    private final TrackShareRepository trackShareRepository;
    private final UserTrackProgressRepository progressRepository;
    private final SupabaseStorageService storage;
    private final TrackProcessingService processingService;
    private final NotificationService notificationService;

    /** Auto-approbation a l'upload (defaut : true) — les sons sont visibles
     *  immediatement ; la moderation admin reste possible (reject/suppression).
     *  Passer a false pour retablir la file de validation stricte. */
    @org.springframework.beans.factory.annotation.Value("${yamdj.moderation.auto-approve:true}")
    private boolean autoApprove;

    public TrackService(TrackRepository trackRepository,
                        UserRepository userRepository,
                        ArtistProfileRepository artistProfileRepository,
                        PlayHistoryRepository playHistoryRepository,
                        PlaylistTrackRepository playlistTrackRepository,
                        MixtapeTrackRepository mixtapeTrackRepository,
                        TrackLikeRepository trackLikeRepository,
                        TrackShareRepository trackShareRepository,
                        UserTrackProgressRepository progressRepository,
                        SupabaseStorageService storage,
                        TrackProcessingService processingService,
                        NotificationService notificationService) {
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.playHistoryRepository = playHistoryRepository;
        this.playlistTrackRepository = playlistTrackRepository;
        this.mixtapeTrackRepository = mixtapeTrackRepository;
        this.trackLikeRepository = trackLikeRepository;
        this.trackShareRepository = trackShareRepository;
        this.progressRepository = progressRepository;
        this.storage = storage;
        this.processingService = processingService;
        this.notificationService = notificationService;
    }

    /** Utilisateur courant depuis le contexte Spring Security. */
    public User currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            throw new IllegalStateException("Authentification requise");
        }
        return userRepository.findByEmailIgnoreCase(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    /**
     * UPLOAD V1.1 — pipeline asynchrone (directive equipe CTO).
     *
     * La requete HTTP ne fait plus le traitement FFmpeg (avant : jusqu'a
     * 90 s de blocage, timeout client, memoire elevee avec uploads
     * simultanes). Elle se termine en quelques secondes :
     *
     *   1. copie en streaming du fichier source (jamais en memoire) ;
     *   2. stockage durable du source dans tracks/{id}/source.ext ;
     *   3. creation de la piste en statut PROCESSING ;
     *   4. lancement du job FFmpeg en arriere-plan ;
     *   5. reponse IMMEDIATE — l'artiste voit "en cours de traitement".
     *
     * BPM/tonalite restent modifiables manuellement mais sont auto-detectes
     * par le job (formulaire allege : titre + audio + pochette suffisent).
     */
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "tracksFeed", allEntries = true)
    public TrackResponse uploadTrack(String title, String genre, String country, String musicalKey,
                                     MultipartFile audioFile, MultipartFile coverFile,
                                     Integer bpm) {
        User artist = currentUser();
        if (artist.getRole() != UserRole.ARTIST && artist.getRole() != UserRole.ADMIN) {
            throw new IllegalArgumentException("Seuls les artistes peuvent publier des pistes");
        }
        if (audioFile == null || audioFile.isEmpty()) {
            throw new IllegalArgumentException("Fichier audio obligatoire");
        }
        if (audioFile.getSize() > 100L * 1024 * 1024) {
            throw new IllegalArgumentException("Fichier audio trop volumineux (max 100 Mo)");
        }

        String trackId = UUID.randomUUID().toString();

        // 1) Copie en STREAMING du fichier source (zero lecture memoire)
        File tempAudio;
        String original;
        try {
            original = audioFile.getOriginalFilename() == null ? "upload.mp3"
                    : audioFile.getOriginalFilename();
            tempAudio = File.createTempFile("yam-upload-", "-" + original);
            tempAudio.deleteOnExit();
            Files.copy(audioFile.getInputStream(), tempAudio.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("Impossible de lire le fichier audio : " + e.getMessage());
        }

        // 2) Stockage durable du source (cle pour retry sans re-upload)
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : ".mp3";
        String sourceKey = "tracks/" + trackId + "/source" + ext;
        try {
            storage.uploadFile(tempAudio, sourceKey,
                    audioFile.getContentType() != null ? audioFile.getContentType() : "audio/mpeg");
        } catch (IOException e) {
            throw new IllegalStateException("Stockage du fichier source echoue : " + e.getMessage());
        }

        // Pochette optionnelle (streaming via fichier temporaire, jamais en RAM)
        String coverKey = null;
        if (coverFile != null && !coverFile.isEmpty()) {
            try {
                coverKey = storage.uploadMultipart(coverFile, "covers");
            } catch (IOException e) {
                throw new IllegalStateException("Upload de la pochette echoue : " + e.getMessage());
            }
        }

        // 3) Piste en statut PROCESSING (visible par l'artiste, pas dans le feed)
        Track track = Track.builder()
                .title(title)
                .artistId(artist.getId())
                .coverUrl(storage.publicUrl(coverKey))
                .bpm(bpm)
                .musicalKey(musicalKey)
                .camelot(com.yamdj.service.HarmonicMixService.toCamelot(musicalKey))
                .genre(genre == null || genre.isBlank() ? "Afrobeats" : genre)
                .country(country == null || country.isBlank() ? artist.getCountry() : country)
                .status(TrackStatus.PROCESSING)
                .sourceKey(sourceKey)
                .slug(uniqueSlug(title, trackId))
                .processingStartedAt(java.time.LocalDateTime.now())
                .build();
        track = trackRepository.save(track);

        // 4) Job FFmpeg en arriere-plan
        try {
            processingService.processAsync(track.getId(), tempAudio);
        } catch (org.springframework.core.task.TaskRejectedException e) {
            // File saturee : la piste passe en FAILED, retry possible sans re-upload
            track.setStatus(TrackStatus.FAILED);
            track.setProcessingError("File de traitement saturee, reessaie dans un instant");
            track = trackRepository.save(track);
        }

        // 5) Reponse immediate
        String stageName = artistProfileRepository.findByUserId(artist.getId())
                .map(ArtistProfile::getStageName).orElse(artist.getPseudo());
        return TrackDtos.from(track, stageName, artist.getPseudo());
    }

    /**
     * Relance le traitement d'une piste FAILED sans re-upload : le fichier
     * source est recupere depuis le stockage durable puis re-traite.
     */
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "tracksFeed", allEntries = true)
    public TrackResponse retryProcessing(UUID trackId) {
        User user = currentUser();
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + trackId));
        if (!track.getArtistId().equals(user.getId()) && user.getRole() != UserRole.ADMIN) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Seul l'artiste proprietaire peut relancer le traitement");
        }
        if (track.getStatus() == TrackStatus.APPROVED || track.getStatus() == TrackStatus.PROCESSING) {
            throw new IllegalArgumentException("Cette piste est deja en ligne ou en cours de traitement");
        }
        if (track.getSourceKey() == null || track.getSourceKey().isBlank()) {
            throw new IllegalArgumentException("Fichier source introuvable : supprime la piste et renvoie le fichier");
        }

        File source;
        try {
            source = File.createTempFile("yam-retry-", ".audio");
            source.deleteOnExit();
            storage.downloadToFile(track.getSourceKey(), source);
        } catch (Exception e) {
            throw new IllegalStateException("Impossible de recuperer le fichier source : " + e.getMessage());
        }

        track.setStatus(TrackStatus.PROCESSING);
        track.setProcessingStartedAt(java.time.LocalDateTime.now());
        track.setProcessingError(null);
        track.setRetryCount(track.getRetryCount() + 1);
        track = trackRepository.save(track);
        try {
            processingService.processAsync(track.getId(), source);
        } catch (org.springframework.core.task.TaskRejectedException e) {
            track.setStatus(TrackStatus.FAILED);
            track.setProcessingError("File de traitement saturee, reessaie dans un instant");
            track = trackRepository.save(track);
        }

        final UUID artistId = track.getArtistId();
        String stageName = artistProfileRepository.findByUserId(artistId)
                .map(ArtistProfile::getStageName)
                .orElseGet(() -> pseudoOf(artistId));
        return TrackDtos.from(track, stageName, pseudoOf(artistId));
    }

    /** Paroles synchronisees (LRC) d'une piste — lecture publique. */
    @Transactional(readOnly = true)
    public LyricResponse lyrics(UUID trackId) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + trackId));
        return new LyricResponse(track.getLyrics());
    }

    /**
     * Enregistre les paroles LRC d'une piste (proprietaire ou admin).
     * Format LRC : "[00:12.34] Premiere ligne" — les timestamps permettent
     * la synchronisation cote lecteur (mode karaoke).
     */
    @Transactional
    public LyricResponse updateLyrics(UUID trackId, String lyrics) {
        User user = currentUser();
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + trackId));
        if (!track.getArtistId().equals(user.getId()) && user.getRole() != UserRole.ADMIN) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Seul l'artiste proprietaire peut modifier les paroles");
        }
        if (lyrics != null && lyrics.length() > 200_000) {
            throw new IllegalArgumentException("Paroles trop longues (200 000 caracteres maximum)");
        }
        track.setLyrics((lyrics == null || lyrics.isBlank()) ? null : lyrics.trim());
        trackRepository.save(track);
        return new LyricResponse(track.getLyrics());
    }

    /** Slug SEO unique et stable : titre-normalise + suffixe court. */
    private String uniqueSlug(String title, String trackId) {
        String base = slugify(title);
        if (base.isBlank()) base = "piste";
        return base + "-" + trackId.substring(0, 8);
    }

    static String slugify(String input) {
        if (input == null) return "";
        String s = java.text.Normalizer.normalize(input, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        return s.length() > 180 ? s.substring(0, 180) : s;
    }

    @Transactional(readOnly = true)
    public TrackPageResponse search(String q, String genre, String country, int page, int size) {
        Pageable pageable = PageRequest.of(page, Math.min(size, 50));
        Page<Track> result = trackRepository.searchTracks(
                (q == null || q.isBlank()) ? null : q,
                (genre == null || genre.isBlank() || "all".equals(genre)) ? null : genre,
                (country == null || country.isBlank() || "all".equals(country)) ? null : country,
                pageable);

        List<TrackResponse> content = toResponses(result.getContent());

        return new TrackPageResponse(content, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    @org.springframework.cache.annotation.Cacheable(value = "tracksFeed", key = "'feed-' + #limit")
    public List<TrackResponse> feed(int limit) {
        return toResponses(trackRepository
                .findTrending(PageRequest.of(0, Math.min(limit, 50))));
    }

    @Transactional(readOnly = true)
    @org.springframework.cache.annotation.Cacheable(value = "tracksFeed", key = "'trending-' + #limit")
    public List<TrackResponse> trending(int limit) {
        return toResponses(trackRepository
                .findTrending(PageRequest.of(0, Math.min(limit, 50))));
    }

    @Transactional(readOnly = true)
    @org.springframework.cache.annotation.Cacheable(value = "tracksFeed", key = "'latest-' + #limit")
    public List<TrackResponse> latest(int limit) {
        return toResponses(trackRepository
                .findLatest(PageRequest.of(0, Math.min(limit, 50))));
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

    /**
     * Pistes de l'artiste connecte (tous statuts : PENDING / APPROVED / REJECTED),
     * plus recentes d'abord — pour le tableau de bord artiste.
     */
    @Transactional(readOnly = true)
    public List<TrackResponse> myTracks() {
        User artist = currentUser();
        if (artist.getRole() != UserRole.ARTIST && artist.getRole() != UserRole.ADMIN) {
            throw new IllegalArgumentException("Seuls les artistes ont des pistes");
        }
        return trackRepository.findByArtistIdOrderByCreatedAtDesc(artist.getId()).stream()
                .map(t -> TrackDtos.from(t, artistNameOf(artist.getId()), pseudoOf(artist.getId())))
                .toList();
    }

    /**
     * Suppression d'une piste : autorisee uniquement au proprietaire
     * (track.artistId) ou a un administrateur, sinon acces refuse (403).
     * Ordre : references (historique d'ecoutes, CSV track_ids des playlists
     * et mixtapes) puis la piste, puis les fichiers du stockage (echecs
     * toleres : la suppression en base reste prioritaire).
     */
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "tracksFeed", allEntries = true)
    public void deleteTrack(UUID trackId) {
        User user = currentUser();
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + trackId));

        boolean owner = track.getArtistId().equals(user.getId());
        boolean admin = user.getRole() == UserRole.ADMIN;
        if (!owner && !admin) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Suppression interdite : seul l'artiste proprietaire ou un administrateur "
                            + "peut supprimer cette piste");
        }

        // 1) References : historique d'ecoutes et likes (JPQL bulk delete)
        playHistoryRepository.deleteByTrackId(trackId);
        trackLikeRepository.deleteByTrackId(trackId);

        // 2) References : tables de liaison playlists et mixtapes (V1.1)
        playlistTrackRepository.deleteByTrackId(trackId);
        mixtapeTrackRepository.deleteByTrackId(trackId);

        // 3) La piste elle-meme
        trackRepository.delete(track);

        // 4) Fichiers du stockage (m3u8 hq, m3u8 lite, pochette, SOURCE
        //    conservee pour le retry) — jamais bloquant
        deleteStorageFile(track.getAudioUrlHq());
        deleteStorageFile(track.getAudioUrlLq());
        deleteStorageFile(track.getCoverUrl());
        if (track.getSourceKey() != null && !track.getSourceKey().isBlank()) {
            try {
                storage.delete(track.getSourceKey());
                // Mode local : le dossier tracks/{id} entier est nettoye
                if (storage.isLocalMode()) {
                    String dirKey = track.getSourceKey().substring(0,
                            track.getSourceKey().lastIndexOf('/'));
                    deleteLocalDirectory(dirKey);
                }
            } catch (Exception e) {
                log.warn("Suppression du fichier source impossible : {}", e.getMessage());
            }
        }
    }

    /** Enregistre une ecoute : compteur + historique + stats artiste. */
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "tracksFeed", allEntries = true)
    public void registerPlay(UUID trackId, UUID userId) {
        registerPlay(trackId, userId, null, null, null, false);
    }

    /**
     * Enregistre une ecoute enrichie (V2) : qualite, duree ecoutee, idempotence
     * par evenement client (sync hors ligne). Compteur + historique + stats.
     */
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "tracksFeed", allEntries = true)
    public void registerPlay(UUID trackId, UUID userId, String quality,
                             Integer listenedSec, UUID clientEventId, boolean offline) {
        // Idempotence du sync hors ligne : un meme evenement client ne compte
        // jamais deux fois (index unique sur client_event_id).
        if (clientEventId != null
                && playHistoryRepository.existsByClientEventId(clientEventId)) {
            return;
        }
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + trackId));
        track.setPlayCount(track.getPlayCount() + 1);
        trackRepository.save(track);

        artistProfileRepository.findByUserId(track.getArtistId()).ifPresent(profile -> {
            profile.setTotalPlays(profile.getTotalPlays() + 1);
            artistProfileRepository.save(profile);
        });

        // Toute ecoute alimente l'historique (userId null = anonyme) :
        // les charts hebdomadaires comptent aussi les auditeurs non connectes.
        playHistoryRepository.save(PlayHistory.builder()
                .userId(userId).trackId(trackId)
                .quality(quality).listenedSec(listenedSec)
                .clientEventId(clientEventId)
                .offline(offline)
                .build());
    }

    // ==================== YAM RADIO (suite infinie) ====================

    /**
     * RADIO : suite aleatoire de pistes approuvees, filtree par genre et/ou
     * pays. Le client renouvelle la file quand elle s'epuise — experience
     * "radio" sans fin, style Spotify Radio mais afro-centree.
     */
    @Transactional(readOnly = true)
    public List<TrackResponse> radio(String genre, String country, int limit) {
        int cap = Math.max(1, Math.min(limit, 30));
        String g = (genre == null || genre.isBlank() || "all".equalsIgnoreCase(genre)) ? null : genre.trim();
        String c = (country == null || country.isBlank() || "all".equalsIgnoreCase(country)) ? null : country.trim();
        List<Track> tracks = trackRepository.radioPick(g, c, cap);
        return toResponses(tracks);
    }

    // ================ SYNC HORS LIGNE (ecoutes differees) ================

    /**
     * Applique un lot d'ecoutes accumulees hors ligne. Idempotent par
     * clientEventId : le client peut rejouer le sync apres un echec reseau
     * sans gonfler les compteurs.
     */
    @Transactional
    public int syncPlays(UUID userId, List<CommonDtos.PlaySyncItem> items) {
        if (items == null || items.isEmpty()) return 0;
        int applied = 0;
        for (CommonDtos.PlaySyncItem item : items) {
            if (item == null || item.trackId() == null) continue;
            // Doublon deja synchronise ? (idempotence visible dans la reponse)
            if (item.clientEventId() != null
                    && playHistoryRepository.existsByClientEventId(item.clientEventId())) {
                continue;
            }
            try {
                registerPlay(item.trackId(), userId, item.quality(),
                        item.listenedSec(), item.clientEventId(), true);
                applied++;
            } catch (ResourceNotFoundException e) {
                // piste supprimee pendant le hors ligne : ignore
            }
        }
        return applied;
    }

    // ================ REPRISE DE LECTURE (position par piste) ================

    @Transactional
    public void saveProgress(UUID userId, UUID trackId, int positionSec, Integer durationSec) {
        UserTrackProgress.UserTrackProgressId id = UserTrackProgress.UserTrackProgressId.builder()
                .userId(userId).trackId(trackId).build();
        UserTrackProgress p = progressRepository.findById(id).orElseGet(() ->
                UserTrackProgress.builder().id(id).build());
        p.setPositionSec(Math.max(0, positionSec));
        p.setDurationSec(durationSec);
        progressRepository.save(p);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listProgress(UUID userId) {
        return progressRepository.findByIdUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(p -> Map.<String, Object>of(
                        "trackId", p.getId().getTrackId(),
                        "positionSec", p.getPositionSec(),
                        "durationSec", p.getDurationSec() == null ? 0 : p.getDurationSec(),
                        "updatedAt", p.getUpdatedAt() == null ? "" : p.getUpdatedAt().toString()))
                .collect(Collectors.toList());
    }

    // ================ PARTAGE IN-APP (piste a un ami) ================

    /**
     * Envoie une piste a un autre utilisateur (par pseudo) avec message
     * optionnel. Notifie le destinataire. Retourne le partage cree.
     */
    @Transactional
    public TrackShare shareTrack(UUID fromUserId, UUID trackId, String toPseudo, String message) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable"));
        if (track.getStatus() != TrackStatus.APPROVED) {
            throw new IllegalArgumentException("Cette piste n'est pas disponible");
        }
        User to = userRepository.findByPseudo(toPseudo == null ? "" : toPseudo.trim())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Aucun utilisateur avec le pseudo \"" + toPseudo + "\""));
        if (to.getId().equals(fromUserId)) {
            throw new IllegalArgumentException("Tu ne peux pas t'envoyer un son a toi-meme 🙂");
        }
        TrackShare share = trackShareRepository.save(TrackShare.builder()
                .fromUserId(fromUserId).toUserId(to.getId()).trackId(trackId)
                .message(message == null ? null : message.trim())
                .build());
        User from = userRepository.findById(fromUserId).orElse(null);
        String fromName = from == null ? "Un utilisateur" : from.getPseudo();
        notificationService.notifyUser(to.getId(), "SHARE",
                fromName + " t'envoie un son 🎵",
                "\"" + track.getTitle() + "\"" +
                        (message != null && !message.isBlank() ? " — \"" + message.trim() + "\"" : ""),
                "/track/" + trackId);
        return share;
    }

    /** Partages recus par l'utilisateur, enrichis des infos pistes. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> receivedShares(UUID userId, int limit) {
        List<TrackShare> shares = trackShareRepository
                .findByToUserIdOrderByCreatedAtDesc(userId)
                .stream().limit(Math.max(1, Math.min(limit, 50))).toList();
        if (shares.isEmpty()) return List.of();
        Map<UUID, Track> tracks = trackRepository.findAllById(
                        shares.stream().map(TrackShare::getTrackId).toList()).stream()
                .collect(Collectors.toMap(Track::getId, Function.identity()));
        Map<UUID, String> pseudos = new HashMap<>();
        userRepository.findAllById(shares.stream()
                .map(TrackShare::getFromUserId).filter(Objects::nonNull).toList())
                .forEach(u -> pseudos.put(u.getId(), u.getPseudo()));
        return shares.stream().map(s -> {
            Track t = tracks.get(s.getTrackId());
            if (t == null) return null;
            Map<String, Object> m = new HashMap<>();
            m.put("id", s.getId().toString());
            m.put("fromPseudo", s.getFromUserId() == null ? "Anonyme" : pseudos.getOrDefault(s.getFromUserId(), "Utilisateur"));
            m.put("message", s.getMessage());
            m.put("seen", s.getSeenAt() != null);
            m.put("createdAt", s.getCreatedAt() == null ? "" : s.getCreatedAt().toString());
            m.put("track", TrackDtos.from(t, artistNameOf(t.getArtistId()), "unknown"));
            return m;
        }).filter(Objects::nonNull).toList();
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> history(UUID userId, int limit) {
        List<UUID> trackIds = playHistoryRepository
                .findByUserIdOrderByPlayedAtDesc(userId, PageRequest.of(0, Math.min(limit, 100)))
                .stream().map(PlayHistory::getTrackId).distinct().toList();
        if (trackIds.isEmpty()) return List.of();
        // 1 seule requete (findAllById) au lieu d'un findById PAR ligne d'historique
        List<Track> tracks = trackRepository.findAllById(trackIds).stream()
                .filter(t -> t.getStatus() == TrackStatus.APPROVED)
                .toList();
        return toResponses(tracks);
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> recommendedForYou(UUID userId, int limit) {
        // Recommandation simple : pistes approvees non deja ecoutees, trieees par popularite
        List<UUID> listened = playHistoryRepository.findDistinctTrackIds(userId);
        List<Track> tracks = trackRepository.findTrending(PageRequest.of(0, Math.min(limit * 2, 100))).stream()
                .filter(t -> !listened.contains(t.getId()))
                .limit(limit)
                .toList();
        return toResponses(tracks);
    }

    /** Like/unlike (toggle) avec suivi par utilisateur. */
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "tracksFeed", allEntries = true)
    public LikeResponse like(UUID trackId, UUID userId) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable"));
        boolean nowLiked;
        if (userId != null && trackLikeRepository.findByUserIdAndTrackId(userId, trackId).isPresent()) {
            trackLikeRepository.deleteByUserIdAndTrackId(userId, trackId);
            track.setLikeCount(Math.max(0, track.getLikeCount() - 1));
            nowLiked = false;
        } else {
            if (userId != null) {
                trackLikeRepository.save(TrackLike.builder()
                        .userId(userId).trackId(trackId).build());
            }
            track.setLikeCount(track.getLikeCount() + 1);
            nowLiked = true;
        }
        trackRepository.save(track);
        return new LikeResponse(track.getLikeCount(), nowLiked);
    }

    /** Pistes aimees par l'utilisateur, plus recentes d'abord. */
    @Transactional(readOnly = true)
    public List<TrackDtos.TrackResponse> likedTracks(UUID userId, int limit) {
        List<UUID> trackIds = trackLikeRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .limit(limit)
                .map(TrackLike::getTrackId)
                .toList();
        if (trackIds.isEmpty()) return List.of();
        // 1 seule requete pour toutes les pistes aimees (anti N+1)
        List<Track> tracks = trackRepository.findAllById(trackIds).stream()
                .filter(t -> t.getStatus() == TrackStatus.APPROVED)
                .toList();
        return toResponses(tracks);
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
        return userRepository.findByEmailIgnoreCase(auth.getName());
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

    /**
     * Conversion en masse Track -> TrackResponse SANS requete N+1 :
     * 1 requete pour tous les utilisateurs des artistes + 1 requete pour
     * tous les profils, puis composition en memoire. Avant : 3 requetes SQL
     * PAR piste (60+ requetes pour un feed de 20 sons sur le CPU partage
     * de Render — cause principale de la lenteur ressentie).
     */
    private List<TrackResponse> toResponses(List<Track> tracks) {
        if (tracks == null || tracks.isEmpty()) {
            return List.of();
        }
        List<UUID> artistIds = tracks.stream()
                .map(Track::getArtistId).filter(Objects::nonNull).distinct().toList();
        Map<UUID, User> users = artistIds.isEmpty() ? Map.of()
                : userRepository.findAllById(artistIds).stream()
                        .collect(Collectors.toMap(User::getId, Function.identity()));
        Map<UUID, String> stageNames = artistIds.isEmpty() ? Map.of()
                : artistProfileRepository.findByUserIdIn(artistIds).stream()
                        .filter(p -> p.getStageName() != null && p.getUser() != null)
                        .collect(Collectors.toMap(p -> p.getUser().getId(),
                                ArtistProfile::getStageName, (a, b) -> a));
        return tracks.stream().map(t -> {
            UUID aid = t.getArtistId();
            User u = users.get(aid);
            String name = stageNames.getOrDefault(aid,
                    u != null ? u.getPseudo() : "Artiste inconnu");
            String pseudo = u != null ? u.getPseudo() : "unknown";
            return TrackDtos.from(t, name, pseudo);
        }).toList();
    }

    /** Recherche par slug SEO public (/track/{slug}). */
    @Transactional(readOnly = true)
    public TrackResponse getBySlug(String slug) {
        Track t = trackRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + slug));
        return TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId()));
    }

    /**
     * Supprime le fichier du stockage correspondant a une URL publique.
     * Tolere les echecs (fichier absent, URL externe, stockage indisponible) :
     * journalise en WARN sans faire echouer la suppression de la piste.
     */
    private void deleteStorageFile(String url) {
        if (url == null || url.isBlank()) return; // pochette optionnelle : rien a supprimer
        try {
            String key = storage.keyFromUrl(url);
            if (key == null || key.isBlank()) {
                log.warn("Fichier non supprime (cle introuvable dans l'URL) : {}", url);
                return;
            }
            storage.delete(key);
            // Mode local : les segments HLS (.ts) voisins du m3u8 sont supprimes
            // avec leur dossier (le delete ne vise qu'un seul objet).
            if (storage.isLocalMode() && key.endsWith("/index.m3u8")) {
                deleteLocalDirectory(key.substring(0, key.length() - "/index.m3u8".length()));
            }
        } catch (Exception e) {
            log.warn("Suppression du fichier impossible ({}) : {}", url, e.getMessage());
        }
    }

    /** Suppression recursive d'un dossier du stockage local (segments HLS). */
    private void deleteLocalDirectory(String dirKey) {
        try {
            File dir = storage.localFile(dirKey);
            File[] children = dir.listFiles();
            if (children != null) {
                for (File child : children) {
                    if (child.isDirectory()) {
                        deleteLocalDirectory(dirKey + "/" + child.getName());
                    } else if (!child.delete()) {
                        log.warn("Fichier local non supprime : {}/{}", dirKey, child.getName());
                    }
                }
            }
            if (dir.exists() && !dir.delete()) {
                log.warn("Dossier local non supprime : {}", dirKey);
            }
        } catch (Exception e) {
            log.warn("Suppression du dossier local impossible ({}) : {}", dirKey, e.getMessage());
        }
    }
}
