package com.yamdj.controller;

import com.yamdj.dto.CommentDtos.CommentRequest;
import com.yamdj.dto.CommentDtos.CommentResponse;
import com.yamdj.service.CommentService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Commentaires des pistes (Phase 2.2) :
 * lecture publique, ecriture/suppression authentifiees (JWT).
 */
@RestController
@RequestMapping("/api/comments")
public class CommentController {

    private final CommentService commentService;

    public CommentController(CommentService commentService) {
        this.commentService = commentService;
    }

    /** Liste publique des commentaires d'une piste (100 max, plus recents d'abord). */
    @GetMapping("/track/{trackId}")
    public ResponseEntity<List<CommentResponse>> list(@PathVariable UUID trackId) {
        return ResponseEntity.ok(commentService.listForTrack(trackId));
    }

    /** Nombre total de commentaires d'une piste (public, precis au-dela des 100 charges). */
    @GetMapping("/track/{trackId}/count")
    public ResponseEntity<Map<String, Long>> count(@PathVariable UUID trackId) {
        return ResponseEntity.ok(Map.of("commentCount", commentService.countForTrack(trackId)));
    }

    /**
     * Nouveau commentaire (authentifie) : body {content} valide 1-500 caracteres,
     * mots interdits filtres en ***, anti-spam 30 s (429 si trop rapide).
     */
    @PostMapping("/track/{trackId}")
    public ResponseEntity<CommentResponse> add(@PathVariable UUID trackId,
                                               @Valid @RequestBody CommentRequest body) {
        return ResponseEntity.ok(commentService.add(trackId, body.content()));
    }

    /** Suppression d'un commentaire : auteur ou administrateur (204 No Content). */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        commentService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
