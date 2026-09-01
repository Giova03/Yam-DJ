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

    /**
     * Agregation des ecoutes par piste depuis une date (charts hebdo).
     * Requete native : le JOIN avec track + le COUNT en SQL pur evitent
     * de charger l'historique complet en memoire.
     */
    @Query(value = """
            SELECT ph.track_id AS trackId, t.country AS country, COUNT(*) AS plays
            FROM play_history ph
            JOIN track t ON t.id = ph.track_id
            WHERE ph.played_at >= :since AND t.status = 'APPROVED'
            GROUP BY ph.track_id, t.country
            ORDER BY plays DESC
            LIMIT 500
            """, nativeQuery = true)
    List<Object[]> aggregatePlaysSince(@Param("since") java.time.LocalDateTime since);

    /**
     * Ecoutes comptees par ARTISTE sur une periode (redevances mensuelles
     * Phase 3.3 — repartition au prorata). Uniquement les pistes approuvees.
     */
    @Query(value = """
            SELECT t.artist_id AS artistId, COUNT(*) AS plays
            FROM play_history ph
            JOIN track t ON t.id = ph.track_id
            WHERE ph.played_at >= :from AND ph.played_at < :to AND t.status = 'APPROVED'
            GROUP BY t.artist_id
            ORDER BY plays DESC
            """, nativeQuery = true)
    List<Object[]> countPlaysByArtistBetween(@Param("from") java.time.LocalDateTime from,
                                             @Param("to") java.time.LocalDateTime to);
}
