package com.yamdj.service;

import com.yamdj.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

/**
 * Acces lecteur aux utilisateurs (utilise par la moderation admin).
 */
@Service
public class UserRepositoryHolder {

    private final UserRepository userRepository;

    public UserRepositoryHolder(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public Optional<String> emailOf(UUID userId) {
        return userRepository.findById(userId).map(u -> u.getEmail());
    }
}
