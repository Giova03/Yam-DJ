package com.yamdj.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Executeur dedie au pipeline audio asynchrone (directive equipe :
 * "ne plus faire du traitement FFmpeg lourd dans la requete HTTP").
 *
 * 2 workers suffisent sur le plan Render (0.1 CPU / 512 Mo) : FFmpeg tourne
 * dans des processus separes, les threads n'orchestrent que les I/O.
 * La file d'attente est bornee : au-dela, l'upload est rejete proprement
 * (l'artiste est invite a reessayer) plutot que de saturer la memoire.
 */
@Configuration
public class AsyncConfig {

    @Bean("trackProcessingExecutor")
    public TaskExecutor trackProcessingExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(20);
        executor.setThreadNamePrefix("yam-audio-");
        executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
        executor.initialize();
        return executor;
    }
}
