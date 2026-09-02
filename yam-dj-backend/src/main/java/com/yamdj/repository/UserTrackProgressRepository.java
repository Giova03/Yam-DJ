package com.yamdj.repository;

import com.yamdj.entity.UserTrackProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface UserTrackProgressRepository
        extends JpaRepository<UserTrackProgress, UserTrackProgress.UserTrackProgressId> {

    List<UserTrackProgress> findByIdUserIdOrderByUpdatedAtDesc(UUID userId);
}
