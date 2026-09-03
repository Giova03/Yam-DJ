package com.yamdj.repository;

import com.yamdj.entity.AnalyticsEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AnalyticsEventRepository extends JpaRepository<AnalyticsEvent, java.util.UUID> {

    long countByEventName(String eventName);

    long countByEventNameAndCreatedAtAfter(String eventName, java.time.LocalDateTime since);

    @Query("SELECT e.eventName, count(e) FROM AnalyticsEvent e " +
           "WHERE e.createdAt >= :since GROUP BY e.eventName")
    List<Object[]> countsSince(@Param("since") java.time.LocalDateTime since);

    @Query("SELECT count(DISTINCT e.userId) FROM AnalyticsEvent e " +
           "WHERE e.eventName = 'track_played' AND e.createdAt >= :since")
    long activeListenersSince(@Param("since") java.time.LocalDateTime since);
}
