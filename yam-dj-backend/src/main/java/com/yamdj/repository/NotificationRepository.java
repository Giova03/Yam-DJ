package com.yamdj.repository;

import com.yamdj.entity.AppNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface NotificationRepository extends JpaRepository<AppNotification, UUID> {

    List<AppNotification> findTop100ByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserIdAndReadFalse(UUID userId);

    /** Marquage en lot (JPQL bulk). */
    @Modifying
    @Query("UPDATE AppNotification n SET n.read = true WHERE n.userId = :userId AND n.read = false")
    int markAllRead(@Param("userId") UUID userId);

    @Modifying
    @Query("UPDATE AppNotification n SET n.read = true WHERE n.userId = :userId AND n.read = false AND n.id IN :ids")
    int markRead(@Param("userId") UUID userId, @Param("ids") List<UUID> ids);

    /** Purge : notifications de plus de 90 jours (RGPD leger). */
    @Modifying
    @Query("DELETE FROM AppNotification n WHERE n.createdAt < :before")
    int purgeOlderThan(@Param("before") LocalDateTime before);
}
