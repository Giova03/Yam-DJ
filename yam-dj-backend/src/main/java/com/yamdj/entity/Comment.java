package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Commentaire poste par un utilisateur sur une piste (Phase 2.2 du ROADMAP).
 * Colonnes UUID volontairement sans relation JPA (meme modele que Track.artistId).
 */
@Entity
@Table(name = "comment")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class Comment {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /** Piste commentee (supprimee en cascade avec la piste). */
    @Column(name = "track_id", nullable = false)
    private UUID trackId;

    /** Auteur du commentaire (user). */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Texte du commentaire, 1 a 500 caracteres (valide en amont). */
    @Column(nullable = false, length = 500)
    private String content;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
