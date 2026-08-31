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

        List<TrackResponse> tracks = trackRepository
                .searchTracks(query, null, null,
                        org.springframework.data.domain.PageRequest.of(0, 30))
                .getContent().stream()
                .map(t -> TrackDtos.from(t, artistNameOf(t.getArtistId()), pseudoOf(t.getArtistId())))
                .collect(Collectors.toList());

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
        return trackRepository.findByArtistIdOrderByCreatedAtDesc(artistId).stream()
                .filter(t -> t.getStatus() == TrackStatus.APPROVED)
                .map(t -> TrackDtos.from(t, artistNameOf(artistId), pseudoOf(artistId)))
                .collect(Collectors.toList());
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
