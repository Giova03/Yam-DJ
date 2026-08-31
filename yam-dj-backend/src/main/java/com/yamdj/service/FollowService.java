package com.yamdj.service;

import com.yamdj.dto.TrackDtos;
import com.yamdj.entity.User;
import com.yamdj.entity.UserFollow;
import com.yamdj.entity.enums.UserRole;
import com.yamdj.exception.ResourceNotFoundException;
import com.yamdj.repository.ArtistProfileRepository;
import com.yamdj.repository.TrackRepository;
import com.yamdj.repository.UserFollowRepository;
import com.yamdj.repository.UserRepository;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Abonnements fans -> artistes : follow/unfollow, compteur de fans,
 * feed "Abonnements" (nouvelles pistes des artistes suivis).
 */
@Service
public class FollowService {

    private final UserFollowRepository followRepository;
    private final UserRepository userRepository;
    private final ArtistProfileRepository artistProfileRepository;
    private final TrackRepository trackRepository;

    public FollowService(UserFollowRepository followRepository,
                         UserRepository userRepository,
                         ArtistProfileRepository artistProfileRepository,
                         TrackRepository trackRepository) {
        this.followRepository = followRepository;
        this.userRepository = userRepository;
        this.artistProfileRepository = artistProfileRepository;
        this.trackRepository = trackRepository;
    }

    /** Abonnement (idempotent). Retourne true si nouvel abonnement. */
    @Transactional
    public boolean follow(UUID artistId) {
        User fan = currentUser();
        if (fan.getId().equals(artistId)) {
            throw new IllegalArgumentException("Impossible de se suivre soi-meme");
        }
        User artist = userRepository.findById(artistId)
                .orElseThrow(() -> new ResourceNotFoundException("Artiste introuvable"));
        if (artist.getRole() != UserRole.ARTIST && artist.getRole() != UserRole.ADMIN) {
            throw new IllegalArgumentException("Cet utilisateur n'est pas un artiste");
        }
        if (followRepository.existsByFollowerIdAndArtistId(fan.getId(), artistId)) {
            return false;
        }
        followRepository.save(UserFollow.builder()
                .followerId(fan.getId())
                .artistId(artistId)
                .build());
        return true;
    }

    /** Desabonnement (idempotent). Retourne true si un abonnement a ete supprime. */
    @Transactional
    public boolean unfollow(UUID artistId) {
        User fan = currentUser();
        if (!followRepository.existsByFollowerIdAndArtistId(fan.getId(), artistId)) {
            return false;
        }
        followRepository.deleteByFollowerIdAndArtistId(fan.getId(), artistId);
        return true;
    }

    /** Statut d'abonnement + compteur de fans de l'artiste. */
    @Transactional(readOnly = true)
    public FollowStatus status(UUID artistId) {
        userRepository.findById(artistId)
                .orElseThrow(() -> new ResourceNotFoundException("Artiste introuvable"));
        boolean following = false;
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !auth.getPrincipal().equals("anonymousUser")) {
            following = userRepository.findByEmail(auth.getName())
                    .map(u -> followRepository.existsByFollowerIdAndArtistId(u.getId(), artistId))
                    .orElse(false);
        }
        return new FollowStatus(following, followRepository.countByArtistId(artistId));
    }

    /** Artistes suivis par l'utilisateur courant (pour la page abonnements). */
    @Transactional(readOnly = true)
    public List<FollowedArtist> myFollowing() {
        User fan = currentUser();
        return followRepository.findTop100ByFollowerIdOrderByCreatedAtDesc(fan.getId()).stream()
                .map(f -> {
                    String stageName = userRepository.findById(f.getArtistId())
                            .map(u -> artistProfileRepository.findByUserId(u.getId())
                                    .map(p -> p.getStageName()).orElse(u.getPseudo()))
                            .orElse("Artiste inconnu");
                    long fans = followRepository.countByArtistId(f.getArtistId());
                    return new FollowedArtist(f.getArtistId(), stageName, fans);
                })
                .collect(Collectors.toList());
    }

    /** Feed "Abonnements" : dernieres pistes approuvees des artistes suivis. */
    @Transactional(readOnly = true)
    public List<TrackDtos.TrackResponse> followedFeed(int limit) {
        User fan = currentUser();
        return followRepository.findTracksFromFollowed(fan.getId()).stream()
                .limit(limit)
                .map(t -> TrackDtos.from(t,
                        userRepository.findById(t.getArtistId())
                                .map(u -> artistProfileRepository.findByUserId(u.getId())
                                        .map(p -> p.getStageName()).orElse(u.getPseudo()))
                                .orElse("Artiste inconnu"),
                        userRepository.findById(t.getArtistId()).map(User::getPseudo).orElse("unknown")))
                .collect(Collectors.toList());
    }

    private User currentUser() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            throw new IllegalStateException("Authentification requise");
        }
        return userRepository.findByEmail(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    public record FollowStatus(boolean following, long followers) {}

    public record FollowedArtist(UUID artistId, String stageName, long fans) {}
}
