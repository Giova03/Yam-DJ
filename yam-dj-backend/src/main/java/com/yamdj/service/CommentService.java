package com.yamdj.service;

import com.yamdj.dto.CommentDtos;
import com.yamdj.dto.CommentDtos.CommentResponse;
import com.yamdj.entity.Comment;
import com.yamdj.entity.User;
import com.yamdj.entity.enums.UserRole;
import com.yamdj.exception.ApiException;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.CommentRepository;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserRepository;
import com.yamdj.service.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Commentaires sur les pistes : listing public, publication authentifiee
 * avec filtre de mots interdits + anti-spam (30 s), suppression par
 * l'auteur ou par un administrateur.
 */
@Service
public class CommentService {

    /** Nombre maximal de commentaires renvoyes par la liste publique. */
    private static final int MAX_LIST = 100;

    /** Delai anti-spam entre deux commentaires d'un meme utilisateur (secondes). */
    private static final int ANTI_SPAM_SECONDS = 30;

    /** Mots interdits, mot entier, insensible a la casse — remplaces par ***. */
    private static final Pattern BAD_WORDS = Pattern.compile(
            "\\b(connard|salope|merde|con)\\b", Pattern.CASE_INSENSITIVE);

    private final CommentRepository commentRepository;
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    public CommentService(CommentRepository commentRepository,
                          TrackRepository trackRepository,
                          UserRepository userRepository,
                          NotificationService notificationService) {
        this.commentRepository = commentRepository;
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
    }

    /** Utilisateur courant depuis le contexte Spring Security (pattern TrackService). */
    public User currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            throw new IllegalStateException("Authentification requise");
        }
        return userRepository.findByEmailIgnoreCase(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    /** Liste publique : plus recents d'abord, 100 max. */
    @Transactional(readOnly = true)
    public List<CommentResponse> listForTrack(UUID trackId) {
        return commentRepository.findByTrackIdOrderByCreatedAtDesc(trackId).stream()
                .limit(MAX_LIST)
                .map(this::toResponse)
                .toList();
    }

    /** Nombre total de commentaires d'une piste (au-dela de la limite de liste). */
    @Transactional(readOnly = true)
    public long countForTrack(UUID trackId) {
        return commentRepository.countByTrackId(trackId);
    }

    /**
     * Publication d'un commentaire : contenu valide (1-500), piste existante,
     * anti-spam 30 s par utilisateur, mots interdits remplaces par ***.
     */
    @Transactional
    public CommentResponse add(UUID trackId, String rawContent) {
        User user = currentUser();

        String content = rawContent == null ? "" : rawContent.trim();
        if (content.isEmpty()) {
            throw new IllegalArgumentException("Le commentaire est vide");
        }
        if (content.length() > 500) {
            throw new IllegalArgumentException("Le commentaire ne peut pas depasser 500 caracteres");
        }

        // La piste doit exister (sinon 404 plutot qu'un rejet silencieux de la FK)
        var track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResourceNotFoundException("Piste introuvable : " + trackId));

        // Anti-spam : 1 commentaire max toutes les 30 s par utilisateur
        commentRepository.findFirstByUserIdOrderByCreatedAtDesc(user.getId()).ifPresent(last -> {
            if (last.getCreatedAt() != null && last.getCreatedAt()
                    .isAfter(LocalDateTime.now().minusSeconds(ANTI_SPAM_SECONDS))) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                        "Doucement ! Attends " + ANTI_SPAM_SECONDS
                                + " secondes entre deux commentaires.");
            }
        });

        String filtered = BAD_WORDS.matcher(content)
                .replaceAll(Matcher.quoteReplacement("***"));

        Comment saved = commentRepository.save(Comment.builder()
                .trackId(trackId)
                .userId(user.getId())
                .content(filtered)
                .build());

        // Notification a l'artiste (Phase 2.4) si ce n'est pas lui qui commente
        if (!track.getArtistId().equals(user.getId())) {
            notificationService.notifyUser(track.getArtistId(), "COMMENT_NEW",
                    "Nouveau commentaire",
                    user.getPseudo() + " a commente \"" + track.getTitle() + "\"",
                    "/track/" + trackId);
        }
        return toResponse(saved);
    }

    /**
     * Suppression : uniquement l'auteur du commentaire ou un administrateur,
     * sinon acces refuse (403). Le controller renvoie 204 en cas de succes.
     */
    @Transactional
    public void delete(UUID commentId) {
        User user = currentUser();
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Commentaire introuvable : " + commentId));

        boolean owner = comment.getUserId().equals(user.getId());
        boolean admin = user.getRole() == UserRole.ADMIN;
        if (!owner && !admin) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Suppression interdite : seul l'auteur du commentaire "
                            + "ou un administrateur peut le supprimer");
        }
        commentRepository.delete(comment);
    }

    /** Construit le CommentResponse en resolvant pseudo/avatar de l'auteur. */
    private CommentResponse toResponse(Comment c) {
        User author = userRepository.findById(c.getUserId()).orElse(null);
        String pseudo = author != null ? author.getPseudo() : "Utilisateur inconnu";
        String avatarUrl = author != null ? author.getAvatarUrl() : null;
        return CommentDtos.from(c, pseudo, avatarUrl);
    }
}
