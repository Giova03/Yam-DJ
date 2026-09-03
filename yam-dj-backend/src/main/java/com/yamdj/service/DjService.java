package com.yamdj.service;

import com.yamdj.dto.DjDtos.*;
import com.yamdj.dto.TrackDtos;
import com.yamdj.entity.DjProfile;
import com.yamdj.entity.Mixtape;
import com.yamdj.entity.MixtapeTrack;
import com.yamdj.entity.Track;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.DjProfileRepository;
import com.yamdj.repository.MixtapeRepository;
import com.yamdj.repository.MixtapeTrackRepository;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Studio DJ : creation de mixtapes avec Auto-Mix IA (tri harmonique Camelot
 * + BPM), rendu final crossfade via FFmpeg, et bibliothque du studio.
 */
@Service
public class DjService {

    private final MixtapeRepository mixtapeRepository;
    private final MixtapeTrackRepository mixtapeTrackRepository;
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final DjProfileRepository djProfileRepository;
    private final AudioProcessingService audioProcessor;
    private final SupabaseStorageService storage;
    private final MixtapeStoreService mixtapeStore;

    public DjService(MixtapeRepository mixtapeRepository,
                     MixtapeTrackRepository mixtapeTrackRepository,
                     TrackRepository trackRepository,
                     UserRepository userRepository,
                     DjProfileRepository djProfileRepository,
                     AudioProcessingService audioProcessor,
                     SupabaseStorageService storage,
                     MixtapeStoreService mixtapeStore) {
        this.mixtapeRepository = mixtapeRepository;
        this.mixtapeTrackRepository = mixtapeTrackRepository;
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.djProfileRepository = djProfileRepository;
        this.audioProcessor = audioProcessor;
        this.storage = storage;
        this.mixtapeStore = mixtapeStore;
    }

    private User currentDj() {
        org.springframework.security.core.Authentication auth =
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            throw new IllegalStateException("Authentification requise");
        }
        return userRepository.findByEmailIgnoreCase(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    /** Utilisateur courant facultatif (endpoints mixtes public/connecte). */
    private UUID optionalCurrentUserId() {
        try {
            return currentDj().getId();
        } catch (Exception anonymous) {
            return null;
        }
    }

    /**
     * Suggestion Auto-Mix : ordonne les pistes donnees selon les regles
     * harmoniques et BPM, et retourne une analyse lisible par le DJ.
     */
    public AutoMixSuggestion suggestAutoMix(List<UUID> trackIds) {
        List<Track> tracks = trackRepository.findAllById(trackIds).stream()
                .filter(t -> t.getStatus() == TrackStatus.APPROVED)
                .collect(Collectors.toList());

        if (tracks.isEmpty()) {
            throw new IllegalArgumentException("Aucune piste valide pour l'Auto-Mix");
        }

        List<Track> ordered = HarmonicMixService.reorderTracks(
                tracks, Track::getBpm, Track::getCamelot);

        double avgBpm = ordered.stream()
                .filter(t -> t.getBpm() != null)
                .mapToInt(Track::getBpm)
                .average().orElse(0);

        int goodTransitions = 0;
        for (int i = 1; i < ordered.size(); i++) {
            Track prev = ordered.get(i - 1);
            Track next = ordered.get(i);
            int score = HarmonicMixService.bpmScore(prev.getBpm(), next.getBpm())
                    + HarmonicMixService.harmonicScore(prev.getCamelot(), next.getCamelot());
            if (score >= 150) goodTransitions++;
        }

        String analysis = String.format(
                "Ordonnancement IA termine : %d pistes, BPM moyen %.0f, %d/%d transitions harmoniquement "
                + "optimales (Camelot + BPM). Le mix demarre doucement et monte en energie.",
                ordered.size(), avgBpm, goodTransitions, Math.max(1, ordered.size() - 1));

        return new AutoMixSuggestion(
                ordered.stream().map(Track::getId).collect(Collectors.toList()),
                avgBpm, goodTransitions, analysis);
    }

    /**
     * Cree la mixtape : Auto-Mix IA (optionnel) -> rendu FFmpeg crossfade
     * -> upload stockage -> sauvegarde.
     */
    @Transactional
    public MixtapeResponse createMixtape(CreateMixtapeRequest request) {
        User dj = currentDj();
        if (request.trackIds() == null || request.trackIds().size() < 2) {
            throw new IllegalArgumentException("Une mixtape necessite au moins 2 pistes");
        }
        String title = (request.title() == null || request.title().isBlank())
                ? "Mix de " + dj.getPseudo() : request.title();

        List<Track> tracks = trackRepository.findAllById(request.trackIds()).stream()
                .filter(t -> t.getStatus() == TrackStatus.APPROVED)
                .filter(t -> t.getAudioUrlHq() != null)
                .collect(Collectors.toList());

        if (tracks.size() < 2) {
            throw new IllegalArgumentException("Au moins 2 pistes validees avec audio sont requises");
        }

        // Ordre : Auto-Mix IA ou ordre fourni par le DJ
        List<Track> orderedTracks;
        if (request.autoOrder()) {
            orderedTracks = HarmonicMixService.reorderTracks(tracks, Track::getBpm, Track::getCamelot);
        } else {
            // Respecter l'ordre du DJ : trier par la liste d'IDs fournie
            Map<UUID, Track> byId = tracks.stream()
                    .collect(Collectors.toMap(Track::getId, t -> t));
            orderedTracks = request.trackIds().stream()
                    .map(byId::get)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
        }

        // Telechargement des fichiers maitres : on recombine depuis les segments HLS
        // Solution robuste : extraire la version HQ en MP3 temporaire via ffmpeg
        // sur l'URL publique R2 (ffmpeg supporte les URLs HTTP/HLS).
        List<String> audioUrls = orderedTracks.stream()
                .map(t -> storage.publicUrl(t.getAudioUrlHq()))
                .collect(Collectors.toList());

        int crossfade = Math.max(2, Math.min(request.crossfadeSec(), 16));
        AudioProcessingService.MixResult result;
        try {
            result = audioProcessor.createMix(audioUrls, crossfade, null);
        } catch (Exception e) {
            throw new IllegalStateException("Generation du mix echouee : " + e.getMessage());
        }

        Mixtape mixtape = Mixtape.builder()
                .djId(dj.getId())
                .title(title)
                .audioUrl(result.audioKey())
                .durationSec(result.durationSec())
                .crossfadeSec(crossfade)
                .priceXof(mixtapeStore.sanitizePrice(request.priceXof()))
                .build();
        mixtapeRepository.save(mixtape);

        // V1.1 : ordre des pistes dans la table de liaison mixtape_track
        // (une ligne par piste avec sa position — fin du CSV track_ids).
        for (int i = 0; i < orderedTracks.size(); i++) {
            mixtapeTrackRepository.save(MixtapeTrack.builder()
                    .mixtapeId(mixtape.getId())
                    .trackId(orderedTracks.get(i).getId())
                    .position(i)
                    .build());
        }

        djProfileRepository.findByUserId(dj.getId()).ifPresent(profile -> {
            profile.setMixtapeCount(profile.getMixtapeCount() + 1);
            djProfileRepository.save(profile);
        });

        return toResponse(mixtape, dj.getId());
    }

    /** Bibliotheque du studio : pistes approuvees avec BPM/tonalite pour le DJ. */
    @Transactional(readOnly = true)
    public List<TrackDtos.TrackResponse> studioLibrary(String genre, String country, int limit) {
        return trackRepository.searchTracks(null,
                        (genre == null || genre.isBlank() || "all".equals(genre)) ? null : genre,
                        (country == null || country.isBlank() || "all".equals(country)) ? null : country,
                        org.springframework.data.domain.PageRequest.of(0, Math.min(limit, 200)))
                .getContent().stream()
                .map(t -> TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId())))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<MixtapeResponse> myMixtapes() {
        User dj = currentDj();
        return mixtapeRepository.findByDjIdOrderByCreatedAtDesc(dj.getId())
                .stream().map(m -> toResponse(m, dj.getId())).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<MixtapeResponse> publicMixtapes(int limit) {
        UUID viewer = optionalCurrentUserId();
        return mixtapeRepository.findTop20ByOrderByPlayCountDesc().stream()
                .limit(limit).map(m -> toResponse(m, viewer)).collect(Collectors.toList());
    }

    /** Mixtapes achetees par le fan connecte (boutique 3.4). */
    @Transactional(readOnly = true)
    public List<MixtapeResponse> myPurchasedMixtapes() {
        User fan = currentDj();
        return mixtapeStore.myPurchasedMixtapes(fan.getId()).stream()
                .map(m -> toResponse(m, fan.getId()))
                .collect(Collectors.toList());
    }

    @Transactional
    public void registerMixtapePlay(UUID mixtapeId) {
        Mixtape m = mixtapeRepository.findById(mixtapeId)
                .orElseThrow(() -> new ResourceNotFoundException("Mixtape introuvable"));
        m.setPlayCount(m.getPlayCount() + 1);
        mixtapeRepository.save(m);
    }

    @Transactional
    public String mixtapeStreamUrl(UUID mixtapeId) {
        Mixtape m = mixtapeRepository.findById(mixtapeId)
                .orElseThrow(() -> new ResourceNotFoundException("Mixtape introuvable"));
        if (m.getAudioUrl() == null) {
            throw new IllegalArgumentException("Mixtape pas encore genere");
        }
        // Boutique (3.4) : mixtape payante = DJ proprietaire, ADMIN ou acheteur
        mixtapeStore.assertAccess(m, optionalCurrentUserId());
        return storage.publicUrl(m.getAudioUrl());
    }

    /**
     * Supprime une mixtape : DJ proprietaire ou ADMIN uniquement.
     * Supprime le fichier audio du stockage puis decremente le compteur du profil.
     */
    @Transactional
    public void deleteMixtape(UUID mixtapeId) {
        User user = currentDj();
        Mixtape mixtape = mixtapeRepository.findById(mixtapeId)
                .orElseThrow(() -> new ResourceNotFoundException("Mixtape introuvable"));

        boolean owner = mixtape.getDjId().equals(user.getId());
        boolean admin = user.getRole() == com.yamdj.entity.enums.UserRole.ADMIN;
        if (!owner && !admin) {
            throw new IllegalArgumentException("Tu ne peux supprimer que tes propres mixtapes");
        }

        // Fichier audio du stockage (cle stockee) - echec non bloquant
        if (mixtape.getAudioUrl() != null && !mixtape.getAudioUrl().isBlank()) {
            try {
                storage.delete(mixtape.getAudioUrl());
            } catch (Exception e) {
                // log et continuer : le fichier peut deja avoir disparu
            }
        }

        mixtapeRepository.delete(mixtape);

        djProfileRepository.findByUserId(mixtape.getDjId()).ifPresent(profile -> {
            if (profile.getMixtapeCount() > 0) {
                profile.setMixtapeCount(profile.getMixtapeCount() - 1);
                djProfileRepository.save(profile);
            }
        });
    }

    private MixtapeResponse toResponse(Mixtape m, UUID viewerId) {
        String djName = userRepository.findById(m.getDjId())
                .map(u -> djProfileRepository.findByUserId(u.getId())
                        .map(DjProfile::getDjName).orElse(u.getPseudo()))
                .orElse("DJ inconnu");
        boolean paid = m.getPriceXof() != null && m.getPriceXof() > 0;
        Boolean purchased = paid ? (viewerId != null &&
                (viewerId.equals(m.getDjId()) || mixtapeStore.hasPurchased(m.getId(), viewerId)))
                : null;
        // V1.1 : ordre reconstitue depuis la table de liaison (format CSV
        // conserve dans la reponse pour compatibilite frontend existante).
        String trackIdsCsv = mixtapeTrackRepository
                .findByMixtapeIdOrderByPositionAsc(m.getId()).stream()
                .map(row -> row.getTrackId().toString())
                .collect(Collectors.joining(","));
        return new MixtapeResponse(m.getId(), m.getDjId(), djName, m.getTitle(), m.getCoverUrl(),
                storage.publicUrl(m.getAudioUrl()), m.getDurationSec(), trackIdsCsv,
                m.getCrossfadeSec(), m.getPlayCount(),
                m.getPriceXof() == null ? 0 : m.getPriceXof(), purchased, m.getCreatedAt());
    }

    private String artistNameOf(UUID artistId) {
        return userRepository.findById(artistId)
                .map(u -> djProfileRepository.findByUserId(u.getId()).isEmpty()
                        ? u.getPseudo() : u.getPseudo())
                .orElse("Artiste inconnu");
    }

    private String pseudoOf(UUID artistId) {
        return userRepository.findById(artistId).map(User::getPseudo).orElse("unknown");
    }
}
