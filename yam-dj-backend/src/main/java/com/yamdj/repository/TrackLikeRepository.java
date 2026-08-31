package com.yamdj.repository;

import com.yamdj.entity.TrackLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TrackLikeRepository extends JpaRepository<TrackLike, UUID> {

    Optional<TrackLike> findByUserIdAndTrackId(UUID userId, UUID trackId);

    void deleteByUserIdAndTrackId(UUID userId, UUID trackId);

    List<TrackLike> findByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserId(UUID userId);

    void deleteByTrackId(UUID trackId);
}
