package com.yamdj.controller;

import com.yamdj.dto.NotificationDtos.*;
import com.yamdj.service.NotificationService;
import com.yamdj.service.TrackService;
import com.yamdj.service.WebPushService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Notifications (Phase 2.4) : cle VAPID, abonnements Web Push, centre
 * in-app (liste, non-lus, marquage lu) et notification de test.
 * Lecture de la cle VAPID publique ; tout le reste exige un JWT.
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;
    private final WebPushService webPushService;
    private final TrackService trackService;

    public NotificationController(NotificationService notificationService,
                                  WebPushService webPushService,
                                  TrackService trackService) {
        this.notificationService = notificationService;
        this.webPushService = webPushService;
        this.trackService = trackService;
    }

    /** Cle publique VAPID (base64url, 65 octets) - publique, pour pushManager.subscribe. */
    @GetMapping("/vapid-key")
    public ResponseEntity<VapidKeyResponse> vapidKey() {
        return ResponseEntity.ok(new VapidKeyResponse(webPushService.publicKey()));
    }

    /** Abonnement Web Push du navigateur. */
    @PostMapping("/subscribe")
    public ResponseEntity<Map<String, Object>> subscribe(@Valid @RequestBody SubscribeRequest request) {
        UUID userId = trackService.currentUser().getId();
        notificationService.subscribe(userId, request);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** Desabonnement (changement de navigateur, permission retiree). */
    @PostMapping("/unsubscribe")
    public ResponseEntity<Map<String, Object>> unsubscribe(@RequestBody Map<String, String> body) {
        UUID userId = trackService.currentUser().getId();
        String endpoint = body.get("endpoint");
        if (endpoint == null || endpoint.isBlank()) {
            throw new IllegalArgumentException("endpoint requis");
        }
        notificationService.unsubscribe(userId, endpoint);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** Centre de notifications : liste des plus recentes. */
    @GetMapping("/list")
    public ResponseEntity<List<NotificationResponse>> list(
            @RequestParam(defaultValue = "30") int limit) {
        UUID userId = trackService.currentUser().getId();
        return ResponseEntity.ok(notificationService.list(userId, limit));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<UnreadCountResponse> unreadCount() {
        UUID userId = trackService.currentUser().getId();
        return ResponseEntity.ok(new UnreadCountResponse(notificationService.unreadCount(userId)));
    }

    /** Marquage lu : {ids:[...]} ou {all:true}. */
    @PostMapping("/mark-read")
    public ResponseEntity<Map<String, Object>> markRead(@RequestBody(required = false) MarkReadRequest body) {
        UUID userId = trackService.currentUser().getId();
        List<UUID> ids = body == null ? null : body.ids();
        int updated = notificationService.markRead(userId, ids);
        return ResponseEntity.ok(Map.of("updated", updated));
    }

    /** Notification de test (in-app + push si abonne) - verification du dispositif. */
    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> test() {
        UUID userId = trackService.currentUser().getId();
        notificationService.notifyUser(userId, "TEST",
                "Notification de test YAM DJ",
                "Si tu lis ceci, ton centre de notifications fonctionne ! 🎧",
                null);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
