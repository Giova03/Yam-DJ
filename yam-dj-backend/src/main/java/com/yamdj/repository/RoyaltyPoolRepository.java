package com.yamdj.repository;

import com.yamdj.entity.RoyaltyPool;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RoyaltyPoolRepository extends JpaRepository<RoyaltyPool, UUID> {

    Optional<RoyaltyPool> findByPeriodMonth(String periodMonth);

    boolean existsByPeriodMonth(String periodMonth);
}
