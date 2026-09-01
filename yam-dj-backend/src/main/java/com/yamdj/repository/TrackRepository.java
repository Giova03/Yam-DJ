package com.yamdj.repository;

import com.yamdj.entity.Track;
import com.yamdj.entity.enums.TrackStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TrackRepository extends JpaRepository<Track, UUID> {

    List<Track> findByArtistIdOrderByCreatedAtDesc(UUID artistId);

    Page<Track> findByStatus(TrackStatus status, Pageable pageable);

    // CAST explicites : les parametres String nulls lies dans un test "IS NULL"
    // n'ont aucun contexte de type pour PostgreSQL (bytea ou indeterminable selon
    // le mode du driver) — le cast force varchar et rend la requete deterministe.
    // Le CAST dans le CONCAT est indispensable : c'est la occurrence qui perd
    // l'inference de type Hibernate quand q est null ('%'||bytea -> erreur).
    @Query("SELECT t FROM Track t WHERE t.status = 'APPROVED' " +
           "AND (CAST(:genre AS string) IS NULL OR t.genre = :genre) " +
           "AND (CAST(:country AS string) IS NULL OR t.country = :country) " +
           "AND (CAST(:q AS string) IS NULL OR LOWER(t.title) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')))")
    Page<Track> searchTracks(@Param("q") String q,
                             @Param("genre") String genre,
                             @Param("country") String country,
                             Pageable pageable);

    @Query("SELECT t FROM Track t WHERE t.status = 'APPROVED' ORDER BY t.playCount DESC, t.createdAt DESC")
    List<Track> findTrending(Pageable pageable);

    @Query("SELECT t FROM Track t WHERE t.status = 'APPROVED' AND t.country = :country ORDER BY t.playCount DESC")
    List<Track> findTrendingByCountry(@Param("country") String country, Pageable pageable);

    @Query("SELECT t FROM Track t WHERE t.status = 'APPROVED' ORDER BY t.createdAt DESC")
    List<Track> findLatest(Pageable pageable);

    @Query("SELECT COUNT(t) FROM Track t WHERE t.artistId = :artistId AND t.status = 'APPROVED'")
    long countApprovedByArtist(@Param("artistId") UUID artistId);

    /** Comptage GROUPE anti N+1 : 1 seule requete pour tous les artistes. */
    @Query("SELECT t.artistId AS artistId, COUNT(t) AS cnt FROM Track t "
            + "WHERE t.artistId IN :artistIds AND t.status = 'APPROVED' GROUP BY t.artistId")
    java.util.List<Object[]> countApprovedByArtists(@Param("artistIds") java.util.Collection<UUID> artistIds);

    @Query("SELECT COALESCE(SUM(t.playCount), 0) FROM Track t WHERE t.artistId = :artistId")
    long sumPlaysByArtist(@Param("artistId") UUID artistId);

    @Query("SELECT t FROM Track t WHERE t.status = 'APPROVED' AND t.bpm IS NOT NULL AND t.id IN :ids")
    List<Track> findAllByIdWithAudio(@Param("ids") List<UUID> ids);
}
