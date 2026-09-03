package com.yamdj.repository;

import com.yamdj.entity.MixtapeTrack;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MixtapeTrackRepository extends JpaRepository<MixtapeTrack, UUID> {

    List<MixtapeTrack> findByMixtapeIdOrderByPositionAsc(UUID mixtapeId);

    Optional<MixtapeTrack> findByMixtapeIdAndTrackId(UUID mixtapeId, UUID trackId);

    void deleteByMixtapeId(UUID mixtapeId);

    void deleteByTrackId(UUID trackId);

    long countByMixtapeId(UUID mixtapeId);
}
