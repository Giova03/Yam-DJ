package com.yamdj.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Taches asynchrones du traitement audio (HLS, mixtapes, envois d'emails).
 */
@Configuration
public class StorageConfig {

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
