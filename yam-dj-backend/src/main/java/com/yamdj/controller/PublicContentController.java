package com.yamdj.controller;

import com.yamdj.dto.CommonDtos.ArtistPublicResponse;
import com.yamdj.dto.CommonDtos.DjPublicResponse;
import com.yamdj.dto.CommonDtos.PlaylistRequest;
import com.yamdj.dto.CommonDtos.PlaylistResponse;
import com.yamdj.dto.TrackDtos.TrackResponse;
import com.yamdj.repository.TrackRepository;
import com.yamdj.service.SearchService;
import com.yamdj.service.PlaylistService;
import com.yamdj.service.DjService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Contenu public : profils artistes, mixtapes publiques, playlists.
 */
@RestController
@RequestMapping
public class PublicContentController {

    private final SearchService searchService;
    private final PlaylistService playlistService;
    private final DjService djService;
    private final TrackRepository trackRepository;

    public PublicContentController(SearchService searchService,
                                   PlaylistService playlistService,
                                   DjService djService,
                                   TrackRepository trackRepository) {
        this.searchService = searchService;
        this.playlistService = playlistService;
        this.djService = djService;
        this.trackRepository = trackRepository;
    }

    /**
     * Genres disponibles avec leur nombre de pistes approuvees (page /genres,
     * SEO + decouverte) : [{"genre":"Afrobeats","count":12}, ...].
     */
    @GetMapping("/api/genres")
    public ResponseEntity<List<Map<String, Object>>> genres() {
        List<Map<String, Object>> result = trackRepository.countByGenre().stream()
                .map(row -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("genre", String.valueOf(row[0]));
                    m.put("count", ((Number) row[1]).longValue());
                    return m;
                })
                .toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/api/artists/{id}")
    public ResponseEntity<ArtistPublicResponse> artist(@PathVariable UUID id) {
        return ResponseEntity.ok(searchService.artistProfile(id));
    }

    @GetMapping("/api/artists/{id}/tracks")
    public ResponseEntity<List<TrackResponse>> artistTracks(@PathVariable UUID id) {
        return ResponseEntity.ok(searchService.artistTracks(id));
    }

    @GetMapping("/api/mixtapes/public")
    public ResponseEntity<List<com.yamdj.dto.DjDtos.MixtapeResponse>> publicMixtapes(
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(djService.publicMixtapes(limit));
    }

    @PostMapping("/api/playlists")
    public ResponseEntity<PlaylistResponse> createPlaylist(@RequestBody PlaylistRequest request) {
        return ResponseEntity.ok(playlistService.create(request));
    }

    @GetMapping("/api/playlists/my")
    public ResponseEntity<List<PlaylistResponse>> myPlaylists() {
        return ResponseEntity.ok(playlistService.myPlaylists());
    }

    @GetMapping("/api/playlists/{id}")
    public ResponseEntity<PlaylistResponse> playlist(@PathVariable UUID id) {
        return ResponseEntity.ok(playlistService.getById(id));
    }

    @PostMapping("/api/playlists/{id}/tracks/{trackId}")
    public ResponseEntity<PlaylistResponse> addTrack(@PathVariable UUID id,
                                                     @PathVariable UUID trackId) {
        return ResponseEntity.ok(playlistService.addTrack(id, trackId));
    }

    @DeleteMapping("/api/playlists/{id}/tracks/{trackId}")
    public ResponseEntity<PlaylistResponse> removeTrack(@PathVariable UUID id,
                                                        @PathVariable UUID trackId) {
        return ResponseEntity.ok(playlistService.removeTrack(id, trackId));
    }

    @DeleteMapping("/api/playlists/{id}")
    public ResponseEntity<Map<String, String>> deletePlaylist(@PathVariable UUID id) {
        playlistService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Playlist supprimee"));
    }

    @GetMapping("/api/playlists/public")
    public ResponseEntity<List<PlaylistResponse>> publicPlaylists(
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(playlistService.publicPlaylists(limit));
    }
}
