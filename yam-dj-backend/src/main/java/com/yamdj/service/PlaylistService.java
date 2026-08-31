package com.yamdj.service;

import com.yamdj.dto.CommonDtos.PlaylistRequest;
import com.yamdj.dto.CommonDtos.PlaylistResponse;
import com.yamdj.entity.Playlist;
import com.yamdj.entity.User;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.PlaylistRepository;
import com.yamdj.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Playlists personnelles et publiques.
 */
@Service
public class PlaylistService {

    private final PlaylistRepository playlistRepository;
    private final UserRepository userRepository;

    public PlaylistService(PlaylistRepository playlistRepository, UserRepository userRepository) {
        this.playlistRepository = playlistRepository;
        this.userRepository = userRepository;
    }

    private User currentUser() {
        var auth = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            throw new IllegalStateException("Authentification requise");
        }
        return userRepository.findByEmailIgnoreCase(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    @Transactional
    public PlaylistResponse create(PlaylistRequest request) {
        User user = currentUser();
        Playlist playlist = Playlist.builder()
                .userId(user.getId())
                .name(request.name())
                .description(request.description())
                .isPublic(request.isPublic())
                .trackIds(request.trackIds() == null ? "" :
                        request.trackIds().stream().map(UUID::toString)
                                .collect(Collectors.joining(",")))
                .build();
        playlist = playlistRepository.save(playlist);
        return toResponse(playlist);
    }

    @Transactional(readOnly = true)
    public List<PlaylistResponse> myPlaylists() {
        User user = currentUser();
        return playlistRepository.findByUserIdOrderByCreatedAtDesc(user.getId())
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PlaylistResponse getById(UUID id) {
        Playlist p = playlistRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Playlist introuvable"));
        if (!p.isPublic()) {
            User user = currentUser();
            if (!p.getUserId().equals(user.getId())) {
                throw new IllegalArgumentException("Cette playlist est privee");
            }
        }
        return toResponse(p);
    }

    @Transactional
    public PlaylistResponse addTrack(UUID playlistId, UUID trackId) {
        Playlist p = ownedPlaylist(playlistId);
        String ids = p.getTrackIds() == null ? "" : p.getTrackIds();
        if (!ids.isBlank()) {
            p.setTrackIds(ids + "," + trackId);
        } else {
            p.setTrackIds(trackId.toString());
        }
        p = playlistRepository.save(p);
        return toResponse(p);
    }

    @Transactional
    public PlaylistResponse removeTrack(UUID playlistId, UUID trackId) {
        Playlist p = ownedPlaylist(playlistId);
        List<UUID> ids = parseIds(p.getTrackIds());
        ids.remove(trackId);
        p.setTrackIds(ids.stream().map(UUID::toString).collect(Collectors.joining(",")));
        p = playlistRepository.save(p);
        return toResponse(p);
    }

    @Transactional
    public void delete(UUID playlistId) {
        Playlist p = ownedPlaylist(playlistId);
        playlistRepository.delete(p);
    }

    @Transactional(readOnly = true)
    public List<PlaylistResponse> publicPlaylists(int limit) {
        return playlistRepository.findTop20ByIsPublicTrueOrderByCreatedAtDesc()
                .stream().limit(limit).map(this::toResponse)
                .collect(Collectors.toList());
    }

    private Playlist ownedPlaylist(UUID id) {
        Playlist p = playlistRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Playlist introuvable"));
        User user = currentUser();
        if (!p.getUserId().equals(user.getId())) {
            throw new IllegalArgumentException("Tu n'es pas le proprietaire de cette playlist");
        }
        return p;
    }

    private List<UUID> parseIds(String csv) {
        if (csv == null || csv.isBlank()) return new java.util.ArrayList<>();
        return java.util.Arrays.stream(csv.split(","))
                .filter(s -> !s.isBlank())
                .map(UUID::fromString)
                .collect(Collectors.toCollection(java.util.ArrayList::new));
    }

    private PlaylistResponse toResponse(Playlist p) {
        return new PlaylistResponse(p.getId(), p.getName(), p.getDescription(),
                p.getCoverUrl(), p.isPublic(), parseIds(p.getTrackIds()), p.getCreatedAt());
    }
}
