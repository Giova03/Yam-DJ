package com.yamdj.service;

import com.yamdj.dto.CommonDtos.ArtistPublicResponse;
import com.yamdj.dto.CommonDtos.DjPublicResponse;
import com.yamdj.dto.CommonDtos.SearchResponse;
import com.yamdj.dto.TrackDtos;
import com.yamdj.dto.TrackDtos.TrackResponse;
import com.yamdj.entity.ArtistProfile;
import com.yamdj.entity.DjProfile;
import com.yamdj.entity.Track;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.DjProfileRepository;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Recherche globale (pistes, artistes, DJs) + profils publics.
 */
@Service
public class SearchService {

    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final DjProfileRepository djProfileRepository;

    public SearchService(TrackRepository trackRepository,
                         UserRepository userRepository,
                         ArtistProfileRepository artistProfileRepository,
                         DjProfileRepository djProfileRepository) {
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.djProfileRepository = djProfileRepository;
    }

    @Transactional(readOnly = true)
    public SearchResponse globalSearch(String q) {
        if (q == null || q.isBlank()) {
            return new SearchResponse(List.of(), List.of(), List.of());
        }
        String query = q.trim();

        // ANTI N+1 : resolution des noms d'artistes en 2 requetes totales
        // (au lieu de 3 requetes PAR piste — 90+ requetes pour 30 resultats).
        List<Track> trackEntities = trackRepository
                .searchTracks(query, null, null,
                        org.springframework.data.domain.PageRequest.of(0, 30))
                .getContent();
        List<TrackResponse> tracks = batchToResponses(trackEntities);

        List<ArtistPublicResponse> artists = artistProfileRepository
                .searchByStageName(query).stream()
                .limit(15)
                .map(p -> new ArtistPublicResponse(
                        p.getUser().getId(), p.getStageName(), p.getBio(), p.getPhotoUrl(),
                        p.getUser().getCountry(), p.getTotalPlays(),
                        trackRepository.countApprovedByArtist(p.getUser().getId())))
                .collect(Collectors.toList());

        List<DjPublicResponse> djs = djProfileRepository
                .searchByDjName(query).stream()
                .limit(15)
                .map(p -> new DjPublicResponse(
                        p.getUser().getId(), p.getDjName(), p.getBio(),
                        p.getPhotoUrl(), p.getMixtapeCount()))
                .collect(Collectors.toList());

        return new SearchResponse(tracks, artists, djs);
    }

    @Transactional(readOnly = true)
    public ArtistPublicResponse artistProfile(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new com.yamdj.exception.ResourceNotFoundException(
                        "Artiste introuvable : " + userId));
        ArtistProfile profile = artistProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new IllegalArgumentException("Cet utilisateur n'est pas un artiste"));

        return new ArtistPublicResponse(
                userId, profile.getStageName(), profile.getBio(), profile.getPhotoUrl(),
                user.getCountry(), profile.getTotalPlays(),
                trackRepository.countApprovedByArtist(userId));
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> artistTracks(UUID artistId) {
        List<Track> tracks = trackRepository.findByArtistIdOrderByCreatedAtDesc(artistId).stream()
                .filter(t -> t.getStatus() == TrackStatus.APPROVED)
                .collect(Collectors.toList());
        return batchToResponses(tracks);
    }

    /**
     * Conversion en masse anti-N+1 : 1 requete utilisateurs + 1 requete
     * profils pour TOUTE la liste (cf. toResponses dans TrackService).
     */
    private List<TrackResponse> batchToResponses(List<Track> tracks) {
        if (tracks.isEmpty()) return List.of();
        List<UUID> artistIds = tracks.stream()
                .map(Track::getArtistId).filter(java.util.Objects::nonNull).distinct()
                .collect(Collectors.toList());
        java.util.Map<UUID, User> users = artistIds.isEmpty() ? java.util.Map.of()
                : userRepository.findAllById(artistIds).stream()
                        .collect(Collectors.toMap(User::getId, u -> u));
        java.util.Map<UUID, String> stageNames = artistIds.isEmpty() ? java.util.Map.of()
                : artistProfileRepository.findByUserIdIn(artistIds).stream()
                        .filter(p -> p.getStageName() != null && p.getUser() != null)
                        .collect(Collectors.toMap(p -> p.getUser().getId(),
                                ArtistProfile::getStageName, (a, b) -> a));
        return tracks.stream().map(t -> {
            UUID aid = t.getArtistId();
            User u = users.get(aid);
            String name = stageNames.getOrDefault(aid, u != null ? u.getPseudo() : "Artiste inconnu");
            String pseudo = u != null ? u.getPseudo() : "unknown";
            return TrackDtos.from(t, name, pseudo);
        }).collect(Collectors.toList());
    }

    private String artistNameOf(UUID artistId) {
        return userRepository.findById(artistId)
                .map(u -> artistProfileRepository.findByUserId(u.getId())
                        .map(ArtistProfile::getStageName).orElse(u.getPseudo()))
                .orElse("Artiste inconnu");
    }

    private String pseudoOf(UUID artistId) {
        return userRepository.findById(artistId).map(User::getPseudo).orElse("unknown");
    }
}
