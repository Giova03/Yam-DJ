package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Chart hebdomadaire : agregation des ecoutes (play_history) par semaine.
 * Reffache chaque heure par le job planifie de ChartService. Le rang stocke
 * est le rang GLOBAL de la semaine ; le rang par pays est derive a la lecture.
 */
@Entity
@Table(name = "weekly_chart",
        uniqueConstraints = @UniqueConstraint(name = "uq_weekly_chart_week_track", columnNames = {"week_start", "track_id"}),
        indexes = {
                @Index(name = "idx_weekly_chart_week", columnList = "week_start, rank"),
                @Index(name = "idx_weekly_chart_country", columnList = "country")
        })
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class WeeklyChart {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    /** Lundi 00:00 de la semaine concernee. */
    @Column(name = "week_start", nullable = false)
    private LocalDate weekStart;

    @Column(name = "track_id", nullable = false)
    private UUID trackId;

    /** Pays de la piste (denormalise pour le filtre par pays). */
    @Column(length = 100)
    private String country;

    /** Rang global de la semaine (1 = le plus ecoute). */
    @Column(nullable = false)
    private int rank;

    /** Nombre d'ecoutes comptabilisees cette semaine. */
    @Column(nullable = false)
    private long plays;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
