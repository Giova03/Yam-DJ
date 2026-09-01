package com.yamdj.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Recalcul du chart hebdomadaire au demarrage de l'application.
 *
 * Composant SEPARE de ChartService : l'appel transite par le bean injecte
 * (proxy Spring), ce qui active @Transactional sur refreshWeeklyChart.
 * Une auto-invocation interne (this.refreshWeeklyChart()) contournerait
 * le proxy et ferait echouer le JPQL @Modifying (TransactionRequiredException).
 */
@Component
public class ChartStartupRefresher {

    private static final Logger log = LoggerFactory.getLogger(ChartStartupRefresher.class);

    private final ChartService chartService;

    public ChartStartupRefresher(ChartService chartService) {
        this.chartService = chartService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            chartService.refreshWeeklyChart();
        } catch (Exception e) {
            log.warn("Chart initial non calcule : {}", e.getMessage());
        }
    }
}
