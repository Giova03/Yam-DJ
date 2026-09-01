package com.yamdj.service;

import com.yamdj.dto.NotificationDtos.NotificationResponse;
import com.yamdj.dto.NotificationDtos.SubscribeRequest;
import com.yamdj.entity.AppNotification;
import com.yamdj.entity.PushSubscription;
import com.yamdj.repository.NotificationRepository;
import com.yamdj.repository.PushSubscriptionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Centre de notifications : entites in-app + relais WebSocket temps reel
 * + declenchement des Web Push vers les abonnements du navigateur.
 *
 * Evenements emets (types) : TIP_RECEIVED, TRACK_APPROVED, NEW_TRACK,
 * COMMENT_NEW, WITHDRAWAL_APPROVED, WITHDRAWAL_REJECTED,
 * PREMIUM_ACTIVATED, TEST.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final PushSubscriptionRepository pushRepository;
    private final WebPushService webPushService;
    private final SimpMessagingTemplate messagingTemplate;

    public NotificationService(NotificationRepository notificationRepository,
                               PushSubscriptionRepository pushRepository,
                               WebPushService webPushService,
                               SimpMessagingTemplate messagingTemplate) {
        this.notificationRepository = notificationRepository;
        this.pushRepository = pushRepository;
        this.webPushService = webPushService;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Cree une notification, la diffuse en WebSocket (topic existant du
     * dashboard artiste) et tente les Web Push. Non bloquant (async) :
     * un echec push n'entraine jamais l'echec de l'action d'origine.
     */
    @Async
    @Transactional
    public void notifyUser(UUID userId, String type, String title, String body, String linkUrl) {
        if (userId == null) return;
        try {
            AppNotification n = notificationRepository.save(AppNotification.builder()
                    .userId(userId)
                    .type(type == null ? "INFO" : type)
                    .title(sanitize(title, 150))
                    .body(sanitize(body, 500))
                    .linkUrl(linkUrl)
                    .build());

            // Relais temps reel (meme topic que les notifications de tips)
            try {
                messagingTemplate.convertAndSend("/topic/notifications/" + userId,
                        java.util.Map.of(
                                "type", type,
                                "title", n.getTitle(),
                                "body", n.getBody(),
                                "linkUrl", n.getLinkUrl() == null ? "" : n.getLinkUrl(),
                                "id", n.getId().toString(),
                                "timestamp", System.currentTimeMillis()));
            } catch (Exception e) {
                log.debug("WebSocket indisponible : {}", e.getMessage());
            }

            // Tentative Web Push sur chaque appareil abonne
            for (PushSubscription sub : pushRepository.findByUserId(userId)) {
                try {
                    webPushService.send(sub.getEndpoint());
                } catch (WebPushService.PushGoneException e) {
                    pushRepository.delete(sub);
                    log.info("Abonnement push expire supprime (user {})", userId);
                }
            }
        } catch (Exception e) {
            log.warn("Notification non creee (user {}) : {}", userId, e.getMessage());
        }
    }

    /** Liste des notifications de l'utilisateur (plus recentes d'abord). */
    @Transactional(readOnly = true)
    public List<NotificationResponse> list(UUID userId, int limit) {
        return notificationRepository.findTop100ByUserIdOrderByCreatedAtDesc(userId).stream()
                .limit(Math.max(1, Math.min(limit, 100)))
                .map(NotificationResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    /** Marquage lu : ids precis, ou toutes si ids vide/null. */
    @Transactional
    public int markRead(UUID userId, List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return notificationRepository.markAllRead(userId);
        }
        return notificationRepository.markRead(userId, ids);
    }

    /** Enregistre/met a jour un abonnement push du navigateur. */
    @Transactional
    public void subscribe(UUID userId, SubscribeRequest request) {
        if (request == null || request.endpoint() == null || request.endpoint().isBlank()
                || request.endpoint().length() > 600) {
            throw new IllegalArgumentException("Abonnement push invalide");
        }
        PushSubscription sub = pushRepository.findByEndpoint(request.endpoint())
                .orElseGet(PushSubscription::new);
        sub.setUserId(userId);
        sub.setEndpoint(request.endpoint());
        if (request.keys() != null) {
            if (request.keys().p256dh() != null) sub.setP256dh(request.keys().p256dh());
            if (request.keys().auth() != null) sub.setAuth(request.keys().auth());
        }
        pushRepository.save(sub);
        log.info("Abonnement push enregistre pour l'utilisateur {}", userId);
    }

    @Transactional
    public void unsubscribe(UUID userId, String endpoint) {
        pushRepository.findByEndpoint(endpoint).ifPresent(sub -> {
            if (sub.getUserId().equals(userId)) {
                pushRepository.delete(sub);
            }
        });
    }

    /** Purge mensuelle des notifications de plus de 90 jours. */
    @Scheduled(cron = "0 30 3 1 * *")
    @Transactional
    public void purgeOldNotifications() {
        int purged = notificationRepository.purgeOlderThan(LocalDateTime.now().minusDays(90));
        if (purged > 0) log.info("Purge notifications : {} anciennes entrees supprimees", purged);
    }

    private static String sanitize(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max - 1) + "…" : s;
    }
}
