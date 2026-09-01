package com.yamdj.repository;

import com.yamdj.entity.Comment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Acces aux commentaires des pistes.
 */
@Repository
public interface CommentRepository extends JpaRepository<Comment, UUID> {

    /** Commentaires d'une piste, plus recents d'abord (feed). */
    List<Comment> findByTrackIdOrderByCreatedAtDesc(UUID trackId);

    /** Dernier commentaire d'un utilisateur — anti-spam (delai 30 s). */
    Optional<Comment> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Nombre total de commentaires d'une piste. */
    long countByTrackId(UUID trackId);
}
