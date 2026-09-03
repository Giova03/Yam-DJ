package com.yamdj.service;

import com.yamdj.dto.CommonDtos.PlaylistRequest;
import com.yamdj.dto.CommonDtos.PlaylistResponse;
import com.yamdj.entity.Playlist;
import com.yamdj.entity.PlaylistTrack;
import com.yamdj.entity.User;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.PlaylistRepository;
import com.yamdj.repository.PlaylistTrackRepository;
import com.yamdj.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Playlists personnelles et publiques (V1.1 : vraie table de liaison
 * playlist_track avec position — fin du CSV d'IDs).
 */
@Service
public class PlaylistService {

    private final PlaylistRepository playlistRepository;
    private final PlaylistTrackRepository playlistTrackRepository;
    private final UserRepository userRepository;

    public PlaylistService(PlaylistRepository playlistRepository,
                           PlaylistTrackRepository playlistTrackRepository,
                           UserRepository userRepository) {
        this.playlistRepository = playlistRepository;
        this.playlistTrackRepository = playlistTrackRepository;
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
                .build();
        playlist = playlistRepository.save(playlist);

        if (request.trackIds() != null) {
            int pos = 0;
            for (UUID trackId : request.trackIds()) {
                addTrackRow(playlist.getId(), trackId, pos++);
            }
        }
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
        if (playlistTrackRepository.findByPlaylistIdAndTrackId(playlistId, trackId).isEmpty()) {
            // Ajout en fin de playlist (position = max + 1)
            int nextPos = playlistTrackRepository
                    .findByPlaylistIdOrderByPositionAsc(playlistId).size();
            addTrackRow(playlistId, trackId, nextPos);
        }
        return toResponse(p);
    }

    @Transactional
    public PlaylistResponse removeTrack(UUID playlistId, UUID trackId) {
        Playlist p = ownedPlaylist(playlistId);
        List<PlaylistTrack> rows = playlistTrackRepository
                .findByPlaylistIdOrderByPositionAsc(playlistId);
        boolean removed = rows.removeIf(row -> row.getTrackId().equals(trackId));
        if (removed) {
            playlistTrackRepository.deleteByPlaylistIdAndTrackId(playlistId, trackId);
            // Recompacte les positions pour eviter les trous
            int pos = 0;
            for (PlaylistTrack row : rows) {
                if (row.getPosition() != pos) {
                    row.setPosition(pos);
                    playlistTrackRepository.save(row);
                }
                pos++;
            }
        }
        return toResponse(p);
    }

    @Transactional
    public void delete(UUID playlistId) {
        Playlist p = ownedPlaylist(playlistId);
        playlistTrackRepository.deleteByPlaylistId(playlistId);
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

    private void addTrackRow(UUID playlistId, UUID trackId, int position) {
        playlistTrackRepository.save(PlaylistTrack.builder()
                .playlistId(playlistId)
                .trackId(trackId)
                .position(position)
                .build());
    }

    private PlaylistResponse toResponse(Playlist p) {
        List<UUID> ids = playlistTrackRepository
                .findByPlaylistIdOrderByPositionAsc(p.getId())
                .stream().map(PlaylistTrack::getTrackId)
                .collect(Collectors.toCollection(ArrayList::new));
        return new PlaylistResponse(p.getId(), p.getName(), p.getDescription(),
                p.getCoverUrl(), p.isPublic(), ids, p.getCreatedAt());
    }
}
