package com.yamdj.repository;

import com.yamdj.entity.DjProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DjProfileRepository extends JpaRepository<DjProfile, UUID> {

    Optional<DjProfile> findByUserId(UUID userId);

    @Query("SELECT d FROM DjProfile d WHERE d.djName ILIKE %:q%")
    List<DjProfile> searchByDjName(@Param("q") String q);
}
