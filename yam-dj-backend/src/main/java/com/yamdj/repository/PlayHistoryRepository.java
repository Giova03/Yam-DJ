package com.yamdj.repository;

import com.yamdj.entity.PlayHistory;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PlayHistoryRepository extends JpaRepository<PlayHistory, UUID> {

    List<PlayHistory> findByUserIdOrderByPlayedAtDesc(UUID userId, Pageable pageable);

    @Query("SELECT ph.trackId, COUNT(ph) as cnt FROM PlayHistory ph " +
           "WHERE ph.userId = :userId GROUP BY ph.trackId ORDER BY cnt DESC")
    List<Object[]> findMostPlayedTrackIds(@Param("userId") UUID userId, Pageable pageable);

    @Query("SELECT DISTINCT ph.trackId FROM PlayHistory ph WHERE ph.userId = :userId")
    List<UUID> findDistinctTrackIds(@Param("userId") UUID userId);

    /** Suppression en masse de l'historique d'une piste (JPQL bulk delete,
     * plus portable que le ON DELETE CASCADE de la base). */
    @Modifying
    @Query("DELETE FROM PlayHistory ph WHERE ph.trackId = :trackId")
    int deleteByTrackId(@Param("trackId") UUID trackId);
}
