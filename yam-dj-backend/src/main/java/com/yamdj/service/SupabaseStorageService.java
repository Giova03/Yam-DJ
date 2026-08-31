package com.yamdj.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

/**
 * Stockage des medias : Supabase Storage (bucket du projet Supabase).
 *
 * Mode SUPABASE (production durable) : si SUPABASE_URL et SUPABASE_SERVICE_KEY
 * sont renseignes, les fichiers sont envoyes vers le bucket via l'API REST
 * ({SUPABASE_URL}/storage/v1/object/...) et exposes publiquement via
 * {SUPABASE_URL}/storage/v1/object/public/{bucket}/{cle}. Le bucket "media"
 * (public, limite 50 Mo/fichier) est cree par le schema / le dashboard.
 *
 * Mode LOCAL (secours automatique) : sans cle service, les fichiers sont
 * ecrits sur le disque du service (dossier yamdj.storage.local-dir) et servis
 * par MediaController sur {APP_BASE_URL}/media/{cle}. La plateforme reste
 * pleinement fonctionnelle (upload, mastering FFmpeg, streaming HLS,
 * pochettes). Limitation : sur Render gratuit le disque est ephemere, les
 * fichiers uploades sont perdus a chaque redploiement. Des que
 * SUPABASE_SERVICE_KEY est renseignee (dashboard Supabase, Settings > API,
 * "service_role secret"), le service bascule automatiquement en mode durable
 * sans changement de code.
 */
@Service
public class SupabaseStorageService {

    private static final Logger log = LoggerFactory.getLogger(SupabaseStorageService.class);

    private final RestTemplate http;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String supabaseUrl;
    private final String serviceKey;
    private final String bucket;
    private final boolean localMode;
    private final Path localDir;
    private final String appBaseUrl;

    public SupabaseStorageService(@Value("${yamdj.supabase.url:}") String supabaseUrl,
                                   @Value("${yamdj.supabase.service-key:}") String serviceKey,
                                   @Value("${yamdj.supabase.bucket:media}") String bucket,
                                   @Value("${yamdj.storage.local-dir:./yam-media}") String localDir,
                                   @Value("${yamdj.app.base-url}") String appBaseUrl) throws IOException {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(15_000);
        factory.setReadTimeout(120_000);
        this.http = new RestTemplate(factory);
        this.supabaseUrl = stripSlash(supabaseUrl);
        this.serviceKey = serviceKey;
        this.bucket = bucket;
        this.localMode = !isSet(supabaseUrl) || !isSet(serviceKey);
        this.localDir = Paths.get(localDir).toAbsolutePath().normalize();
        this.appBaseUrl = appBaseUrl;

        if (localMode) {
            Files.createDirectories(this.localDir);
            log.info("Stockage medias : MODE LOCAL (Supabase Storage non configure). Dossier : {} — fichiers servis sur {}/media/**",
                    this.localDir, stripSlash(appBaseUrl));
        } else {
            log.info("Stockage medias : MODE SUPABASE ({}/storage/v1/object/public/{})",
                    this.supabaseUrl, this.bucket);
        }
    }

    /** Genere une cle unique : dossier/nom-uuid.ext */
    public String buildKey(String folder, String originalFilename) {
        String ext = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            ext = originalFilename.substring(originalFilename.lastIndexOf('.'));
        }
        String base = originalFilename != null && originalFilename.contains(".")
                ? originalFilename.substring(0, originalFilename.lastIndexOf('.'))
                : (originalFilename == null ? "fichier" : originalFilename);
        return folder + "/" + base + "-" + UUID.randomUUID() + ext;
    }

    /** Upload d'un fichier Multipart (pochette, mix exporte). Retourne la cle. */
    public String uploadMultipart(MultipartFile file, String folder) throws IOException {
        String key = buildKey(folder, file.getOriginalFilename());
        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        upload(key, file.getBytes(), contentType);
        return key;
    }

    /** Upload d'un fichier local (segments HLS, mix genere). Retourne la cle. */
    public String uploadFile(File file, String key, String contentType) throws IOException {
        upload(key, Files.readAllBytes(file.toPath()), contentType);
        return key;
    }

    /** URL publique d'une cle (ou URL absolue passee telle quelle). */
    public String publicUrl(String key) {
        if (key == null || key.isBlank()) return null;
        if (key.startsWith("http://") || key.startsWith("https://")) return key;
        if (localMode) return stripSlash(appBaseUrl) + "/media/" + key;
        return supabaseUrl + "/storage/v1/object/public/" + bucket + "/" + encodePath(key);
    }

    /** Suppression d'un objet. */
    public void delete(String key) {
        if (key == null || key.isBlank()) return;
        if (key.startsWith("http://") || key.startsWith("https://")) return;
        if (localMode) {
            try {
                Files.deleteIfExists(resolveLocal(key));
            } catch (IOException e) {
                log.warn("Suppression locale impossible : {}", key);
            }
            return;
        }
        try {
            HttpHeaders headers = authHeaders();
            http.exchange(objectUrl(key), HttpMethod.DELETE, new HttpEntity<>(headers), String.class);
        } catch (Exception e) {
            log.warn("Suppression Supabase impossible (cle {}) : {}", key, e.getMessage());
        }
    }

    /**
     * Extrait la cle de stockage d'une URL publique generee par publicUrl().
     * Mode Supabase : {SUPABASE_URL}/storage/v1/object/public/{bucket}/{cle}
     * Mode local    : {APP_BASE_URL}/media/{cle}
     * Retourne null si l'URL ne correspond pas a ce stockage (URL externe, vide...).
     */
    public String keyFromUrl(String url) {
        if (url == null || url.isBlank()) return null;
        String u = url.trim();
        if (isSet(supabaseUrl)) {
            String prefix = supabaseUrl + "/storage/v1/object/public/" + bucket + "/";
            if (u.startsWith(prefix)) {
                return urlDecode(u.substring(prefix.length()));
            }
        }
        String localPrefix = stripSlash(appBaseUrl) + "/media/";
        if (u.startsWith(localPrefix)) {
            return urlDecode(u.substring(localPrefix.length()));
        }
        return null;
    }

    /** Telechargement des octets d'un objet. */
    public byte[] download(String key) throws IOException {
        if (key == null || key.isBlank()) throw new IOException("Cle de stockage vide");
        if (key.startsWith("http://") || key.startsWith("https://")) {
            // URL publique : telechargement direct sans authentification
            try {
                ResponseEntity<byte[]> resp = http.getForEntity(key, byte[].class);
                return resp.getBody() != null ? resp.getBody() : new byte[0];
            } catch (Exception e) {
                throw new IOException("Telechargement impossible : " + key + " : " + e.getMessage());
            }
        }
        if (localMode) {
            Path p = resolveLocal(key);
            if (!Files.isRegularFile(p)) throw new IOException("Fichier local introuvable : " + key);
            return Files.readAllBytes(p);
        }
        try {
            ResponseEntity<byte[]> resp = http.exchange(
                    objectUrl(key), HttpMethod.GET, new HttpEntity<>(authHeaders()), byte[].class);
            return resp.getBody() != null ? resp.getBody() : new byte[0];
        } catch (Exception e) {
            throw new IOException("Telechargement Supabase impossible (cle " + key + ") : " + e.getMessage());
        }
    }

    /** Dossier temporaire local pour le traitement FFmpeg. */
    public File createTempDir(String prefix) throws IOException {
        File dir = Files.createTempDirectory(prefix).toFile();
        dir.deleteOnExit();
        return dir;
    }

    /** Le stockage durable Supabase est-il actif ? (false = mode local) */
    public boolean isLocalMode() {
        return localMode;
    }

    /** Fichier local correspondant a une cle (protection path traversal). */
    public File localFile(String key) throws IOException {
        return resolveLocal(key).toFile();
    }

    // ============================== Interne ==============================

    private void upload(String key, byte[] bytes, String contentType) throws IOException {
        if (localMode) {
            Path target = resolveLocal(key);
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
            return;
        }
        try {
            HttpHeaders headers = authHeaders();
            headers.setContentType(MediaType.parseMediaType(contentType));
            headers.set("x-upsert", "true");
            ResponseEntity<String> resp = http.postForEntity(
                    objectUrl(key), new HttpEntity<>(bytes, headers), String.class);
            if (!resp.getStatusCode().is2xxSuccessful()) {
                throw new IOException("Statut " + resp.getStatusCode());
            }
            if (log.isDebugEnabled()) {
                log.debug("Supabase upload {} ({} octets) -> {}", key, bytes.length, resp.getStatusCode());
            }
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            String detail = e.getMessage();
            if (detail != null && detail.contains("401")) {
                log.error("Supabase 401 : SUPABASE_SERVICE_KEY invalide — verifie le service_role secret");
            }
            throw new IOException("Upload Supabase impossible (cle " + key + ") : " + detail);
        }
    }

    private HttpHeaders authHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(serviceKey);
        return headers;
    }

    private String objectUrl(String key) {
        return supabaseUrl + "/storage/v1/object/" + bucket + "/" + encodePath(key);
    }

    /** Encode chaque segment du chemin (les "/" sont conserves). */
    private static String encodePath(String key) {
        String[] parts = key.split("/");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append('/');
            sb.append(URLEncoder.encode(parts[i], StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    private Path resolveLocal(String key) throws IOException {
        Path resolved = localDir.resolve(key).normalize();
        if (!resolved.startsWith(localDir)) {
            throw new IOException("Chemin de stockage invalide (traversal) : " + key);
        }
        return resolved;
    }

    private static String stripSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private static boolean isSet(String value) {
        return value != null && !value.isBlank();
    }

    /** Decodage permissif : une sequence invalide est rendue telle quelle. */
    private static String urlDecode(String value) {
        try {
            return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return value;
        }
    }
}
