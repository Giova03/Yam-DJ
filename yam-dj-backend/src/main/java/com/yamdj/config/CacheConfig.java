package com.yamdj.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

/**
 * Cache applicatif Caffeine (anti-lenteur V1).
 *
 * Objectif : sur le plan Render gratuit (CPU partage 0.1), chaque requete
 * implique plusieurs allers-retours SQL vers le pooler Supabase en
 * eu-central-1 — les endpoints lus en boucle (feed, trending, latest,
 * charts) meritent une copie memoire.
 *
 * TTL uniforme de 45 s : assez court pour que les compteurs (plays, likes)
 * et les nouveautes restent fres, assez long pour absorber les rafales
 * (un feed appele par 20 visiteurs = 1 seule requete SQL au lieu de 20).
 * Les mutations (upload, like, play, suppression) evictent explicitement
 * le cache — voir @CacheEvict dans TrackService / ChartService.
 *
 * Memoire : quelques centaines de Ko maximum en V1 — negligeable sur 512 Mo.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager("tracksFeed", "chartsCache");
        manager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(45, TimeUnit.SECONDS)
                .maximumSize(200));
        return manager;
    }
}
