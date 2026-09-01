package com.yamdj.repository;

import com.yamdj.entity.WeeklyChart;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface WeeklyChartRepository extends JpaRepository<WeeklyChart, UUID> {

    /** Chart global de la semaine (trie par rang). */
    List<WeeklyChart> findTop100ByWeekStartOrderByRankAsc(LocalDate weekStart);

    /** Supprime le chart de la semaine avant reinsertion (refresh idempotent). */
    @Modifying
    @Query("DELETE FROM WeeklyChart w WHERE w.weekStart = :weekStart")
    void deleteByWeekStart(@Param("weekStart") LocalDate weekStart);

    /** Derniere semaine materialisee (pour l'affichage). */
    @Query("SELECT MAX(w.weekStart) FROM WeeklyChart w")
    LocalDate findLatestWeek();
}
