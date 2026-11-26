package com.diagramio.config;

import com.diagramio.domain.TransactionRunner;
import com.diagramio.domain.auth.AuthService;
import com.diagramio.domain.auth.PasswordHasher;
import com.diagramio.domain.auth.RefreshTokenRepository;
import com.diagramio.domain.auth.TokenIssuer;
import com.diagramio.domain.user.UserRepository;
import com.diagramio.domain.user.UserService;
import com.diagramio.infrastructure.security.JwtProperties;
import java.time.Clock;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.validation.ValidationBindHandler;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

/** Lắp ghép phần xác thực và tài khoản người dùng. */
@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class AuthConfig {

    /** Kiểm tra cấu hình JWT trước khi Spring khởi tạo DB và chạy Flyway. */
    public static void validateJwtProperties(ConfigurableApplicationContext context) {
        try (var validator = new LocalValidatorFactoryBean()) {
            validator.afterPropertiesSet();
            Binder.get(context.getEnvironment())
                    .bind("jwt", Bindable.of(JwtProperties.class), new ValidationBindHandler(validator))
                    .orElseThrow(() -> new IllegalStateException("JWT_SECRET is required"));
        }
    }

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    public AuthService authService(UserRepository userRepository,
                                   RefreshTokenRepository refreshTokenRepository,
                                   PasswordHasher passwordHasher,
                                   TokenIssuer tokenIssuer,
                                   TransactionRunner transactionRunner,
                                   JwtProperties jwtProperties,
                                   Clock clock) {
        return new AuthService(userRepository, refreshTokenRepository, passwordHasher, tokenIssuer,
                transactionRunner, Duration.ofDays(jwtProperties.refreshTokenDays()), clock);
    }

    @Bean
    public UserService userService(UserRepository userRepository, PasswordHasher passwordHasher) {
        return new UserService(userRepository, passwordHasher);
    }
}
