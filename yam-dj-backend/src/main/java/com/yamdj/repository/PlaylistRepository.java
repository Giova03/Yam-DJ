package com.yamdj.repository;

import com.yamdj.entity.Playlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, UUID> {

    List<Playlist> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Playlist> findByIdAndUserId(UUID id, UUID userId);

    List<Playlist> findTop20ByIsPublicTrueOrderByCreatedAtDesc();
}
