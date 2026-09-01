package com.yamdj.controller;

import com.yamdj.service.SupabaseStorageService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

/**
 * Diffusion des medias stockes en mode LOCAL (secours sans Supabase Storage).
 * Sert les playlists HLS (m3u8), segments (.ts), pochettes et mixtapes
 * depuis le dossier yamdj.storage.local-dir. Public : le lecteur hls.js
 * du frontend recupere ces fichiers en cross-origin (CORS global sur /**).
 */
@RestController
@RequestMapping("/media")
public class MediaController {

    private final SupabaseStorageService storage;

    public MediaController(SupabaseStorageService storage) {
        this.storage = storage;
    }

    /** GET /media/{cle} — cle multi-dossiers (covers/xxx.png, tracks/{id}/hq/index.m3u8...). */
    @GetMapping("/{*key}")
    public ResponseEntity<byte[]> serve(@PathVariable String key) throws IOException {
        if (!storage.isLocalMode()) {
            return ResponseEntity.notFound().build();
        }
        String cleanKey = key.startsWith("/") ? key.substring(1) : key;
        File file = storage.localFile(cleanKey);
        if (!file.isFile()) {
            return ResponseEntity.notFound().build();
        }
        byte[] data = Files.readAllBytes(file.toPath());
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable")
                .contentType(MediaType.parseMediaType(contentTypeFor(cleanKey)))
                .body(data);
    }

    private String contentTypeFor(String key) {
        String lower = key.toLowerCase();
        if (lower.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
        if (lower.endsWith(".ts")) return "video/mp2t";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        return "application/octet-stream";
    }
}
