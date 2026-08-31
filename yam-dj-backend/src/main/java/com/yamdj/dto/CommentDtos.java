package com.yamdj.dto;

import com.yamdj.entity.Comment;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DTOs des commentaires sur les pistes (Phase 2.2 du ROADMAP).
 */
public final class CommentDtos {

    private CommentDtos() {}

    /** Corps d'un POST /api/comments/track/{trackId}. */
    public record CommentRequest(
            @NotBlank(message = "Le commentaire est vide")
            @Size(min = 1, max = 500, message = "Le commentaire doit faire entre 1 et 500 caracteres")
            String content
    ) {}

    /**
     * Commentaire expose au frontend : pseudo/avatar de l'auteur
     * resolus via UserRepository (jointure applicative).
     */
    public record CommentResponse(
            UUID id,
            UUID trackId,
            UUID userId,
            String pseudo,
            String avatarUrl,
            String content,
            LocalDateTime createdAt
    ) {}

    public static CommentResponse from(Comment c, String pseudo, String avatarUrl) {
        return new CommentResponse(c.getId(), c.getTrackId(), c.getUserId(),
                pseudo, avatarUrl, c.getContent(), c.getCreatedAt());
    }
}
