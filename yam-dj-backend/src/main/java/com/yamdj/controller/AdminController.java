package com.yamdj.controller;

import com.yamdj.dto.TrackDtos;
import com.yamdj.dto.TrackDtos.TrackResponse;
import com.yamdj.entity.Track;
import com.yamdj.entity.enums.TrackStatus;
import com.yamdj.repository.TrackRepository;
import com.yamdj.service.BrevoEmailService;
import com.yamdj.service.TrackService;
import com.yamdj.service.UserRepositoryHolder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Moderation : validation des pistes avant publication.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final TrackRepository trackRepository;
    private final TrackService trackService;
    private final BrevoEmailService emailService;
    private final UserRepositoryHolder userHolder;

    public AdminController(TrackRepository trackRepository,
                           TrackService trackService,
                           BrevoEmailService emailService,
                           UserRepositoryHolder userHolder) {
        this.trackRepository = trackRepository;
        this.trackService = trackService;
        this.emailService = emailService;
        this.userHolder = userHolder;
    }

    /** File de moderation : pistes en attente. */
    @GetMapping("/validate-tracks")
    public ResponseEntity<Map<String, Object>> pendingTracks(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        Page<Track> result = trackRepository.findByStatus(TrackStatus.PENDING, PageRequest.of(page, size));
        List<TrackResponse> content = result.getContent().stream()
                .map(t -> TrackDtos.from(t, "—", "—"))
                .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of(
                "tracks", content,
                "page", result.getNumber(),
                "totalElements", result.getTotalElements()));
    }

    @PostMapping("/validate-tracks/{id}/approve")
    public ResponseEntity<Map<String, String>> approve(@PathVariable UUID id) {
        Track track = trackRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Piste introuvable"));
        track.setStatus(TrackStatus.APPROVED);
        trackRepository.save(track);
        userHolder.emailOf(track.getArtistId())
                .ifPresent(email -> emailService.sendTrackApprovedEmail(email, track.getTitle()));
        return ResponseEntity.ok(Map.of("status", "APPROVED"));
    }

    @PostMapping("/validate-tracks/{id}/reject")
    public ResponseEntity<Map<String, String>> reject(@PathVariable UUID id) {
        Track track = trackRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Piste introuvable"));
        track.setStatus(TrackStatus.REJECTED);
        trackRepository.save(track);
        return ResponseEntity.ok(Map.of("status", "REJECTED"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Long>> stats() {
        long total = trackRepository.count();
        long pending = trackRepository.findByStatus(TrackStatus.PENDING, PageRequest.of(0, 1))
                .getTotalElements();
        return ResponseEntity.ok(Map.of(
                "totalTracks", total,
                "pendingTracks", pending));
    }
}
