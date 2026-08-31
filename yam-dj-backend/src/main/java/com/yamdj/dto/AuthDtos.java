package com.yamdj.dto;

import jakarta.validation.constraints.*;

/**
 * DTOs d'authentification (Java records immuables).
 */
public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotBlank @Size(min = 3, max = 50) String pseudo,
            @Pattern(regexp = "^(USER|ARTIST|DJ)$", message = "Role invalide (USER, ARTIST ou DJ)")
            String role,
            String phone,
            String country,
            String stageName
    ) {}

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {}

    public record VerifyRequest(
            @NotBlank @Email String email,
            // Tolere les espaces (copier-coller) : le service nettoie le code
            @NotBlank @Size(min = 6, max = 12) String code
    ) {}

    public record AuthResponse(
            String token,
            String email,
            String pseudo,
            String role,
            boolean emailVerified,
            String message
    ) {}

    public record MessageResponse(String message) {}
}
