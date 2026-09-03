package com.yamdj.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.yamdj.security.JwtAuthFilter;
import com.yamdj.security.RateLimitFilter;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final RateLimitFilter rateLimitFilter;

    @Value("${yamdj.cors.origins}")
    private String corsOrigins;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter, RateLimitFilter rateLimitFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.rateLimitFilter = rateLimitFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // Pistes : suppression et "mes pistes" exigent un JWT.
                // Places AVANT le permitAll "/api/tracks/{id}/**" : l'ordre
                // des regles compte (premiere correspondance gagnante) et ce
                // motif couvre aussi DELETE /api/tracks/{id} et /api/tracks/mine.
                .requestMatchers(HttpMethod.DELETE, "/api/tracks/**").authenticated()
                .requestMatchers("/api/tracks/mine").authenticated()
                // Partage in-app : exige un JWT (place AVANT le permitAll
                // "/api/tracks/{id}/**" qui couvre sinon POST .../share).
                .requestMatchers(HttpMethod.POST, "/api/tracks/*/share").authenticated()
                // Relance du traitement (pipeline asynchrone) : proprietaire
                // uniquement — JWT obligatoire, avant le permitAll general.
                .requestMatchers(HttpMethod.POST, "/api/tracks/*/retry").authenticated()
                // Commentaires : lecture publique, ecriture/suppression JWT.
                // Place AVANT le permitAll general : premiere regle gagnante,
                // GET /api/comments/** doit rester ouvert, POST/DELETE non.
                .requestMatchers(HttpMethod.GET, "/api/comments/**").permitAll()
                .requestMatchers("/api/comments/**").authenticated()
                .requestMatchers(
                    "/api/auth/**",
                    "/api/webhook/**",
                    "/api/tracks",
                    "/api/tracks/trending",
                    "/api/tracks/{id}/**",
                    "/api/tracks/feed",
                    "/api/search/**",
                    "/api/artists/{id}",
                    "/api/artists/{id}/tracks",
                    "/api/artists/{id}/follow-status",
                    "/api/mixtapes/public",
                    "/api/playlists/public",
                    "/api/dj/mixtapes/*/stream",
                    "/api/dj/mixtapes/*/play",
                    "/media/**",
                    "/ws/**",
                    "/actuator/**",
                    "/error"
                ).permitAll()
                // Charts hebdo + sitemap : publics (SEO, partage)
                .requestMatchers(HttpMethod.GET, "/api/charts/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/seo/**").permitAll()
                // YouTube : recherche et catalogue libre publics,
                // import d'une video -> JWT exigé (anyRequest authenticated)
                .requestMatchers(HttpMethod.GET, "/api/youtube/search").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/youtube/libre").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/youtube/combined").permitAll()
                // Config pub (Phase 3.5) : publique, le lecteur l'applique
                .requestMatchers(HttpMethod.GET, "/api/ads/config").permitAll()
                // Analytics (V1.1) : evenements anonymes autorises (liste
                // blanche stricte des noms cote service), lecture = admin.
                .requestMatchers(HttpMethod.POST, "/api/analytics/event").permitAll()
                // Cle publique VAPID seule : le reste de /api/notifications
                // exige un JWT (anyRequest authenticated)
                .requestMatchers(HttpMethod.GET, "/api/notifications/vapid-key").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/artist/**").hasAnyRole("ARTIST", "ADMIN")
                .requestMatchers("/api/dj/**").hasAnyRole("DJ", "ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(corsOrigins.split(","))
            .map(String::trim).toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Content-Disposition", "Content-Range"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider(
            com.yamdj.security.UserDetailsServiceImpl userDetailsService,
            PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
