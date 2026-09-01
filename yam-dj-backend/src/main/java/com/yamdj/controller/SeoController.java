package com.yamdj.controller;

import com.yamdj.service.SeoService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * SEO (Phase 2.7) : sitemap XML dynamique (pages publiques + pistes +
 * artistes). Public par design : consomme par les crawleurs via la
 * reecriture Vercel /sitemap.xml -> ce endpoint.
 */
@RestController
@RequestMapping("/api/seo")
public class SeoController {

    private final SeoService seoService;

    public SeoController(SeoService seoService) {
        this.seoService = seoService;
    }

    @GetMapping(value = "/sitemap", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<String> sitemap() {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/xml; charset=utf-8"))
                .body(seoService.sitemap());
    }
}
