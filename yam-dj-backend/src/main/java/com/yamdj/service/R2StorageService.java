package com.yamdj.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

/**
 * Stockage des medias : Cloudflare R2 (compatible S3) OU disque local.
 *
 * Mode R2 (production durable) : si R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY
 * sont renseignes, les fichiers sont envoyes vers le bucket et exposes via
 * R2_PUBLIC_URL.
 *
 * Mode LOCAL (secours automatique) : sans identifiants R2, les fichiers sont
 * ecrits sur le disque du service (dossier yamdj.storage.local-dir) et servis
 * par MediaController sur {APP_BASE_URL}/media/{cle}. La plateforme reste ainsi
 * pleinement fonctionnelle (upload, mastering FFmpeg, streaming HLS, pochettes)
 * sans configuration R2. Limitation : sur Render gratuit le disque est ephemere,
 * les fichiers uploades sont perdus a chaque redploiement. Des que les 3
 * variables R2 sont renseignees, le service bascule automatiquement en mode
 * durable sans changement de code.
 */
@Service
public class R2StorageService {

    private static final Logger log = LoggerFactory.getLogger(R2StorageService.class);

    private final S3Client s3;
    private final String bucket;
    private final String publicUrl;
    private final boolean localMode;
    private final Path localDir;
    private final String appBaseUrl;

    public R2StorageService(S3Client s3Client,
                            @Value("${yamdj.r2.bucket}") String bucket,
                            @Value("${yamdj.r2.public-url:}") String publicUrl,
                            @Value("${yamdj.r2.account-id:}") String accountId,
                            @Value("${yamdj.r2.access-key:}") String accessKey,
                            @Value("${yamdj.r2.secret-key:}") String secretKey,
                            @Value("${yamdj.storage.local-dir:./yam-media}") String localDir,
                            @Value("${yamdj.app.base-url}") String appBaseUrl) throws IOException {
        this.s3 = s3Client;
        this.bucket = bucket;
        this.publicUrl = publicUrl;
        this.localMode = !(isSet(accountId) && isSet(accessKey) && isSet(secretKey));
        this.localDir = Paths.get(localDir).toAbsolutePath().normalize();
        this.appBaseUrl = appBaseUrl;

        if (localMode) {
            Files.createDirectories(this.localDir);
            log.info("Stockage medias : MODE LOCAL (R2 non configure). Dossier : {} — fichiers servis sur {}/media/**",
                    this.localDir, stripSlash(appBaseUrl));
        } else {
            log.info("Stockage medias : MODE R2 (bucket {}, domaine public {})", bucket, publicUrl);
        }
    }

    /** Genere une cle unique : dossier/nom-timestamp-uuid.ext */
    public String buildKey(String folder, String originalFilename) {
        String ext = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            ext = originalFilename.substring(originalFilename.lastIndexOf('.'));
        }
        return folder + "/" + UUID.randomUUID() + ext;
    }

    /** Upload d'un fichier Multipart (pochette, audio brut). Retourne la cle. */
    public String uploadMultipart(MultipartFile file, String folder) throws IOException {
        String key = buildKey(folder, file.getOriginalFilename());
        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        if (localMode) {
            Path target = resolveLocal(key);
            Files.createDirectories(target.getParent());
            try (var in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            return key;
        }
        s3.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType(contentType)
                        .cacheControl("public, max-age=31536000, immutable")
                        .build(),
                RequestBody.fromInputStream(file.getInputStream(), file.getSize())
        );
        return key;
    }

    /** Upload d'un fichier local (segments HLS, mix genere). Retourne la cle. */
    public String uploadFile(File file, String key, String contentType) throws IOException {
        if (localMode) {
            Path target = resolveLocal(key);
            Files.createDirectories(target.getParent());
            Files.copy(file.toPath(), target, StandardCopyOption.REPLACE_EXISTING);
            return key;
        }
        s3.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType(contentType)
                        .cacheControl("public, max-age=31536000, immutable")
                        .build(),
                RequestBody.fromFile(file.toPath())
        );
        return key;
    }

    /**
     * URL publique d'une cle. En mode local, les fichiers sont servis par
     * MediaController ({APP_BASE_URL}/media/{cle}).
     * Toleance : si la valeur passee est deja une URL absolue (http/https),
     * elle est retournee telle quelle — permet de stocker des URL completes
     * dans les entites tout en gardant les appels avec des cles.
     */
    public String publicUrl(String key) {
        if (key == null || key.isBlank()) return null;
        if (key.startsWith("http://") || key.startsWith("https://")) return key;
        if (localMode) return stripSlash(appBaseUrl) + "/media/" + key;
        if (publicUrl == null || publicUrl.isBlank()) return key;
        return stripSlash(publicUrl) + "/" + key;
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
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }

    /** Telechargement d'un objet (proxy streaming). */
    public byte[] download(String key) throws IOException {
        if (key == null || key.isBlank()) throw new IOException("Cle de stockage vide");
        if (key.startsWith("http://") || key.startsWith("https://")) {
            throw new IOException("Telechargement direct d'URL non supporte : " + key);
        }
        if (localMode) {
            Path p = resolveLocal(key);
            if (!Files.isRegularFile(p)) throw new IOException("Fichier local introuvable : " + key);
            return Files.readAllBytes(p);
        }
        var response = s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
        return response.readAllBytes();
    }

    /** Dossier temporaire local pour le traitement FFmpeg. */
    public File createTempDir(String prefix) throws IOException {
        File dir = Files.createTempDirectory(prefix).toFile();
        dir.deleteOnExit();
        return dir;
    }

    /** Le stockage R2 est-il actif ? (false = mode local) */
    public boolean isLocalMode() {
        return localMode;
    }

    /** Fichier local correspondant a une cle (avec protection path traversal). */
    public File localFile(String key) throws IOException {
        return resolveLocal(key).toFile();
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
}
