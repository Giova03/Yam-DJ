package com.yamdj.service;

import com.yamdj.dto.CommonDtos.*;
import com.yamdj.dto.TrackDtos;
import com.yamdj.dto.TrackDtos.*;
import com.yamdj.entity.PlayHistory;
import com.yamdj.entity.Playlist;
import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.Mixtape;
import com.yamdj.entity.Track;
import com.yamdj.entity.TrackLike;
import com.yamdj.entity.User;
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
    private final PlaylistRepository playlistRepository;
    private final MixtapeRepository mixtapeRepository;
    private final TrackLikeRepository trackLikeRepository;
    private final SupabaseStorageService storage;
    private final AudioProcessingService audioProcessor;
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
                        PlaylistRepository playlistRepository,
                        MixtapeRepository mixtapeRepository,
                        TrackLikeRepository trackLikeRepository,
                        SupabaseStorageService storage,
                        AudioProcessingService audioProcessor,
                        NotificationService notificationService) {
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.playHistoryRepository = playHistoryRepository;
        this.playlistRepository = playlistRepository;
        this.mixtapeRepository = mixtapeRepository;
        this.trackLikeRepository = trackLikeRepository;
        this.storage = storage;
        this.audioProcessor = audioProcessor;
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

    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "tracksFeed", allEntries = true)
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
                .status(autoApprove ? TrackStatus.APPROVED : TrackStatus.PENDING)
                .dataLiteReady(true)
                .build();

        track = trackRepository.save(track);
        if (autoApprove) {
            try {
                notificationService.notifyUser(artist.getId(), "TRACK_PUBLISHED",
                        "Ta piste est en ligne",
                        "\"" + title + "\" est visible par toute la communaute. Bonne diffusion !",
                        "/track/" + track.getId());
            } catch (Exception notifEx) {
                log.warn("Notification de publication non envoyee : {}", notifEx.getMessage());
            }
        }
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

        // 2) References : colonnes CSV track_ids des playlists et mixtapes (id1,id2,...)
        String trackIdStr = trackId.toString();
        for (Playlist p : playlistRepository.findByTrackIdsContaining(trackIdStr)) {
            List<String> ids = csvOf(p.getTrackIds());
            if (ids.removeIf(trackIdStr::equals)) {
                p.setTrackIds(String.join(",", ids));
                playlistRepository.save(p);
            }
        }
        for (Mixtape m : mixtapeRepository.findByTrackIdsContaining(trackIdStr)) {
            List<String> ids = csvOf(m.getTrackIds());
            if (ids.removeIf(trackIdStr::equals)) {
                m.setTrackIds(String.join(",", ids));
                mixtapeRepository.save(m);
            }
        }

        // 3) La piste elle-meme
        trackRepository.delete(track);

        // 4) Fichiers du stockage (m3u8 hq, m3u8 lite, pochette) — jamais bloquant
        deleteStorageFile(track.getAudioUrlHq());
        deleteStorageFile(track.getAudioUrlLq());
        deleteStorageFile(track.getCoverUrl());
    }

    /** Enregistre une ecoute : compteur + historique + stats artiste. */
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "tracksFeed", allEntries = true)
    public void registerPlay(UUID trackId, UUID userId) {
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
                .userId(userId).trackId(trackId).build());
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
                        .filter(p -> p.getStageName() != null)
                        .collect(Collectors.toMap(ArtistProfile::getUserId,
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

    /** Decoupe une colonne CSV (track_ids) en jetons, robuste aux valeurs vides. */
    private List<String> csvOf(String csv) {
        if (csv == null || csv.isBlank()) return new ArrayList<>();
        return new ArrayList<>(Arrays.asList(csv.split(",")));
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
