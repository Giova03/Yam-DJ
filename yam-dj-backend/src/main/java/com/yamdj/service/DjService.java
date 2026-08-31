package com.yamdj.service;

import com.yamdj.dto.DjDtos.*;
import com.yamdj.dto.TrackDtos;
import com.yamdj.entity.DjProfile;
import com.yamdj.entity.Mixtape;
import com.yamdj.entity.Track;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.DjProfileRepository;
import com.yamdj.repository.MixtapeRepository;
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
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final DjProfileRepository djProfileRepository;
    private final AudioProcessingService audioProcessor;
    private final R2StorageService r2;

    public DjService(MixtapeRepository mixtapeRepository,
                     TrackRepository trackRepository,
                     UserRepository userRepository,
                     DjProfileRepository djProfileRepository,
                     AudioProcessingService audioProcessor,
                     R2StorageService r2) {
        this.mixtapeRepository = mixtapeRepository;
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.djProfileRepository = djProfileRepository;
        this.audioProcessor = audioProcessor;
        this.r2 = r2;
    }

    private User currentDj() {
        org.springframework.security.core.Authentication auth =
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            throw new IllegalStateException("Authentification requise");
        }
        return userRepository.findByEmail(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
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
     * -> upload R2 -> sauvegarde.
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
                .map(t -> r2.publicUrl(t.getAudioUrlHq()))
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
                .trackIds(orderedTracks.stream().map(Track::getId).toString()
                        .replaceAll("[\\[\\] ]", ""))
                .crossfadeSec(crossfade)
                .build();
        mixtapeRepository.save(mixtape);

        djProfileRepository.findByUserId(dj.getId()).ifPresent(profile -> {
            profile.setMixtapeCount(profile.getMixtapeCount() + 1);
            djProfileRepository.save(profile);
        });

        return toResponse(mixtape);
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
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<MixtapeResponse> publicMixtapes(int limit) {
        return mixtapeRepository.findTop20ByOrderByPlayCountDesc().stream()
                .limit(limit).map(this::toResponse).collect(Collectors.toList());
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
        return r2.publicUrl(m.getAudioUrl());
    }

    private MixtapeResponse toResponse(Mixtape m) {
        String djName = userRepository.findById(m.getDjId())
                .map(u -> djProfileRepository.findByUserId(u.getId())
                        .map(DjProfile::getDjName).orElse(u.getPseudo()))
                .orElse("DJ inconnu");
        return new MixtapeResponse(m.getId(), m.getDjId(), djName, m.getTitle(), m.getCoverUrl(),
                r2.publicUrl(m.getAudioUrl()), m.getDurationSec(), m.getTrackIds(),
                m.getCrossfadeSec(), m.getPlayCount(), m.getCreatedAt());
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
