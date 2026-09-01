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

    /** Recherche avec utilisateur pre-charge (JOIN FETCH, anti N+1 lazy). */
    @Query("SELECT a FROM ArtistProfile a JOIN FETCH a.user WHERE a.stageName ILIKE %:q%")
    List<ArtistProfile> searchByStageNameWithUser(@Param("q") String q);

    @Query("SELECT a FROM ArtistProfile a WHERE a.stageName ILIKE %:q%")
    List<ArtistProfile> searchByStageName(@Param("q") String q);
}
