package com.yamdj.repository;

import com.yamdj.entity.UserFollow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserFollowRepository extends JpaRepository<UserFollow, UUID> {

    Optional<UserFollow> findByFollowerIdAndArtistId(UUID followerId, UUID artistId);

    boolean existsByFollowerIdAndArtistId(UUID followerId, UUID artistId);

    long countByArtistId(UUID artistId);

    long countByFollowerId(UUID followerId);

    void deleteByFollowerIdAndArtistId(UUID followerId, UUID artistId);

    List<UserFollow> findTop100ByFollowerIdOrderByCreatedAtDesc(UUID followerId);

    /** Pistes approuvees des artistes suivis, plus recentes d'abord. */
    @Query("""
            SELECT t FROM Track t
            WHERE t.status = com.yamdj.entity.enums.TrackStatus.APPROVED
              AND t.artistId IN (SELECT f.artistId FROM UserFollow f WHERE f.followerId = :followerId)
            ORDER BY t.createdAt DESC
            """)
    List<com.yamdj.entity.Track> findTracksFromFollowed(@Param("followerId") UUID followerId);
}
