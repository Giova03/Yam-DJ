package com.yamdj.config;

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
 */
@Configuration
public class R2StorageConfig {

    @Value("${yamdj.r2.account-id}")
    private String accountId;

    @Value("${yamdj.r2.access-key}")
    private String accessKey;

    @Value("${yamdj.r2.secret-key}")
    private String secretKey;

    @Bean
    public S3Client r2S3Client() {
        return S3Client.builder()
                .region(Region.of("auto"))
                .endpointOverride(URI.create("https://" + accountId + ".r2.cloudflarestorage.com"))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKey, secretKey)))
                .forcePathStyle(true)
                .build();
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
