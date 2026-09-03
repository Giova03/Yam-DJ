package com.yamdj.repository;

import com.yamdj.entity.PlaylistTrack;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlaylistTrackRepository extends JpaRepository<PlaylistTrack, UUID> {

    /** Pistes d'une playlist, dans l'ordre. */
    List<PlaylistTrack> findByPlaylistIdOrderByPositionAsc(UUID playlistId);

    Optional<PlaylistTrack> findByPlaylistIdAndTrackId(UUID playlistId, UUID trackId);

    void deleteByPlaylistIdAndTrackId(UUID playlistId, UUID trackId);

    void deleteByPlaylistId(UUID playlistId);

    /** Nettoyage quand une piste disparait (suppression admin/artiste). */
    void deleteByTrackId(UUID trackId);

    long countByPlaylistId(UUID playlistId);
}
