package com.yamdj.repository;

import com.yamdj.entity.RoyaltyDistribution;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RoyaltyDistributionRepository extends JpaRepository<RoyaltyDistribution, UUID> {

    List<RoyaltyDistribution> findByArtistIdOrderByPeriodMonthDesc(UUID artistId);

    List<RoyaltyDistribution> findByPoolIdOrderByAmountXofDesc(UUID poolId);

    long countByArtistId(UUID artistId);
}
