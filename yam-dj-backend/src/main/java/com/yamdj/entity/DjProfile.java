package com.yamdj.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "dj_profile")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class DjProfile {

    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "dj_name", nullable = false, length = 150)
    private String djName;

    @Column(columnDefinition = "TEXT")
    private String bio;

    @Column(name = "photo_url", length = 500)
    private String photoUrl;

    @Column(name = "balance_xof", nullable = false)
    @Builder.Default
    private long balanceXof = 0;

    @Column(name = "mixtape_count", nullable = false)
    @Builder.Default
    private int mixtapeCount = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
