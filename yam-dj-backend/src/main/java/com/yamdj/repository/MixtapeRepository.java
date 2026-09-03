package com.yamdj.repository;

import com.yamdj.entity.Mixtape;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface MixtapeRepository extends JpaRepository<Mixtape, UUID> {

    List<Mixtape> findByDjIdOrderByCreatedAtDesc(UUID djId);

    List<Mixtape> findTop20ByOrderByPlayCountDesc();
}
