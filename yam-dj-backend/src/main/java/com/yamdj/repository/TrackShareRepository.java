package com.yamdj.repository;

import com.yamdj.entity.TrackShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TrackShareRepository extends JpaRepository<TrackShare, UUID> {

    /** Partages recus par un utilisateur (les plus recents d'abord). */
    List<TrackShare> findByToUserIdOrderByCreatedAtDesc(UUID toUserId);
}
