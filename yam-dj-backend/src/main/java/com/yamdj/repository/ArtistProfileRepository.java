package com.yamdj.repository;

import com.yamdj.entity.ArtistProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ArtistProfileRepository extends JpaRepository<ArtistProfile, UUID> {

    Optional<ArtistProfile> findByUserId(UUID userId);

    /** Resolution en lot des profils (anti N+1 : 1 requete pour N pistes). */
    List<ArtistProfile> findByUserIdIn(java.util.Collection<UUID> userIds);

    @Query("SELECT a FROM ArtistProfile a WHERE a.stageName ILIKE %:q%")
    List<ArtistProfile> searchByStageName(@Param("q") String q);
}
