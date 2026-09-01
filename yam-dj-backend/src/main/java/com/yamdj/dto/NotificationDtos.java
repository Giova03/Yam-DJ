package com.yamdj.dto;

import com.yamdj.entity.AppNotification;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** DTOs des notifications in-app + Web Push. */
public final class NotificationDtos {

    private NotificationDtos() {}

    /** Abonnement push envoye par le navigateur (PushSubscription.toJSON()). */
    public record SubscribeRequest(
            String endpoint,
            Keys keys
    ) {
        public record Keys(String p256dh, String auth) {}
    }

    /** Marquage lu : liste d'ids ou tout. */
    public record MarkReadRequest(List<UUID> ids, Boolean all) {}

    public record NotificationResponse(
            UUID id,
            String type,
            String title,
            String body,
            String linkUrl,
            boolean read,
            LocalDateTime createdAt
    ) {
        public static NotificationResponse from(AppNotification n) {
            return new NotificationResponse(n.getId(), n.getType(), n.getTitle(),
                    n.getBody(), n.getLinkUrl(), n.isRead(), n.getCreatedAt());
        }
    }

    public record VapidKeyResponse(String publicKey) {}

    public record UnreadCountResponse(long count) {}
}
