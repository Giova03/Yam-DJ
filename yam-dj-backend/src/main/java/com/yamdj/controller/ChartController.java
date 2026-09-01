package com.yamdj.controller;

import com.yamdj.dto.ChartDtos.ChartEntryResponse;
import com.yamdj.service.ChartService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Charts hebdomadaires (Phase 2.6) : classement des pistes les plus
 * ecoutees de la semaine, global ou par pays. Public (SEO + partage).
 */
@RestController
@RequestMapping("/api/charts")
public class ChartController {

    private final ChartService chartService;

    public ChartController(ChartService chartService) {
        this.chartService = chartService;
    }

    /** Chart de la semaine : GET /api/charts?country=Burkina%20Faso&limit=20. */
    @GetMapping
    public ResponseEntity<List<ChartEntryResponse>> chart(
            @RequestParam(required = false) String country,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(chartService.currentChart(country, limit));
    }

    /** Pays representes dans le chart courant. */
    @GetMapping("/countries")
    public ResponseEntity<List<String>> countries() {
        return ResponseEntity.ok(chartService.chartCountries());
    }
}
