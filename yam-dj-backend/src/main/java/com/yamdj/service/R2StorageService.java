package com.yamdj.service;

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
import java.time.Duration;
import java.util.UUID;

/**
 * Stockage Cloudflare R2 (compatible S3) : audio HLS, pochettes, mixtapes.
 */
@Service
public class R2StorageService {

    private final S3Client s3;
    private final String bucket;
    private final String publicUrl;

    public R2StorageService(S3Client s3Client,
                            @Value("${yamdj.r2.bucket}") String bucket,
                            @Value("${yamdj.r2.public-url}") String publicUrl) {
        this.s3 = s3Client;
        this.bucket = bucket;
        this.publicUrl = publicUrl;
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

    /** URL publique d'un objet expose via le domaine public R2. */
    public String publicUrl(String key) {
        if (key == null || key.isBlank()) return null;
        return publicUrl + "/" + key;
    }

    /** Suppression d'un objet. */
    public void delete(String key) {
        if (key == null || key.isBlank()) return;
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }

    /** Telechargement d'un objet (proxy streaming). */
    public byte[] download(String key) throws IOException {
        var response = s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
        return response.readAllBytes();
    }

    /** Dossier temporaire local pour le traitement FFmpeg. */
    public File createTempDir(String prefix) throws IOException {
        File dir = Files.createTempDirectory(prefix).toFile();
        dir.deleteOnExit();
        return dir;
    }
}
