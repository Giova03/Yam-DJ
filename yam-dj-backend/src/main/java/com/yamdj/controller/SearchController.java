package com.yamdj.controller;

import com.yamdj.dto.CommonDtos.SearchResponse;
import com.yamdj.service.SearchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Recherche globale : pistes, artistes, DJs.
 */
@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final SearchService searchService;

    public SearchController(SearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping
    public ResponseEntity<SearchResponse> search(@RequestParam(required = false) String q) {
        return ResponseEntity.ok(searchService.globalSearch(q));
    }
}
