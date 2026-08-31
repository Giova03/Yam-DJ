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

    @Query("SELECT t FROM Track t WHERE t.status = 'APPROVED' " +
           "AND (:genre IS NULL OR t.genre = :genre) " +
           "AND (:country IS NULL OR t.country = :country) " +
           "AND (:q IS NULL OR LOWER(t.title) LIKE LOWER(CONCAT('%', :q, '%')))")
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

    @Query("SELECT COALESCE(SUM(t.playCount), 0) FROM Track t WHERE t.artistId = :artistId")
    long sumPlaysByArtist(@Param("artistId") UUID artistId);

    @Query("SELECT t FROM Track t WHERE t.status = 'APPROVED' AND t.bpm IS NOT NULL AND t.id IN :ids")
    List<Track> findAllByIdWithAudio(@Param("ids") List<UUID> ids);
}
