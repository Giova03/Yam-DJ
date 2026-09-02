package com.yamdj.repository;

import com.yamdj.entity.User;
import com.yamdj.entity.enums.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByEmailIgnoreCaseAndVerificationCode(String email, String code);

    Optional<User> findByResetToken(String resetToken);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByPseudo(String pseudo);

    Optional<User> findByPseudo(String pseudo);

    List<User> findByRole(UserRole role);

    @Query("SELECT u FROM User u WHERE u.pseudo ILIKE %:q% OR u.email ILIKE %:q%")
    List<User> search(@Param("q") String q);
}
