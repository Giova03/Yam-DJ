package com.yamdj.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

import java.net.URI;

/**
 * Configuration du client S3 pointe vers Cloudflare R2
 * (endpoint : https://{accountId}.r2.cloudflarestorage.com).
 *
 * TOLERANCE : si les identifiants R2 ne sont pas renseignes (variables vides),
 * le bean est quand meme cree avec des valeurs de substitution afin que
 * l'application demarre — seuls les uploads/telechargements R2 echoueront
 * avec une erreur claire. Sans cette precaution, l'AWS SDK leve
 * "Secret access key cannot be blank" (NullPointerException) au demarrage
 * et empeche tout le backend de booter.
 */
@Configuration
public class R2StorageConfig {

    private static final Logger log = LoggerFactory.getLogger(R2StorageConfig.class);

    @Value("${yamdj.r2.account-id:}")
    private String accountId;

    @Value("${yamdj.r2.access-key:}")
    private String accessKey;

    @Value("${yamdj.r2.secret-key:}")
    private String secretKey;

    @Bean
    public S3Client r2S3Client() {
        boolean configured = isSet(accountId) && isSet(accessKey) && isSet(secretKey);

        if (!configured) {
            log.warn("R2 non configure (R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY incomplets). "
                    + "L'application demarre en mode degrades : le stockage audio est desactive "
                    + "jusqu'a renseignement des variables d'environnement.");
        }

        String effAccount = configured ? accountId : "000000000000";
        String effAccess  = isSet(accessKey)  ? accessKey  : "r2-not-configured";
        String effSecret  = isSet(secretKey)  ? secretKey  : "r2-not-configured";

        return S3Client.builder()
                .region(Region.of("auto"))
                .endpointOverride(URI.create("https://" + effAccount + ".r2.cloudflarestorage.com"))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(effAccess, effSecret)))
                .forcePathStyle(true)
                .build();
    }

    private boolean isSet(String value) {
        return value != null && !value.isBlank();
    }

    @Bean(name = "audioTaskExecutor")
    public ThreadPoolTaskExecutor audioTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("audio-proc-");
        executor.initialize();
        return executor;
    }
}
