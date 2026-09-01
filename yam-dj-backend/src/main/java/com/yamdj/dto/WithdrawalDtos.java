package com.yamdj.dto;

import com.yamdj.entity.WithdrawalRequest;

import java.time.LocalDateTime;
import java.util.UUID;

/** DTOs des retraits artistes. */
public final class WithdrawalDtos {

    private WithdrawalDtos() {}

    public record WithdrawalCreateRequest(
            Integer amountXof,
            String operator,
            String phone
    ) {}

    public record WithdrawalResponse(
            UUID id,
            UUID userId,
            String pseudo,
            int amountXof,
            String operator,
            String phone,
            String status,
            String adminNote,
            LocalDateTime createdAt,
            LocalDateTime processedAt
    ) {
        public static WithdrawalResponse from(WithdrawalRequest w, String pseudo) {
            return new WithdrawalResponse(w.getId(), w.getUserId(), pseudo,
                    w.getAmountXof(), w.getOperator(), w.getPhone(),
                    w.getStatus().name(), w.getAdminNote(),
                    w.getCreatedAt(), w.getProcessedAt());
        }
    }

    public record RejectRequest(String note) {}
}
