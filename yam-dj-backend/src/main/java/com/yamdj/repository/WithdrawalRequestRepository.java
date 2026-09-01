package com.yamdj.repository;

import com.yamdj.entity.WithdrawalRequest;
import com.yamdj.entity.enums.WithdrawalStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface WithdrawalRequestRepository extends JpaRepository<WithdrawalRequest, UUID> {

    List<WithdrawalRequest> findTop100ByUserIdOrderByCreatedAtDesc(UUID userId);

    List<WithdrawalRequest> findTop100ByStatusOrderByCreatedAtDesc(WithdrawalStatus status);

    List<WithdrawalRequest> findTop100ByOrderByCreatedAtDesc();
}
