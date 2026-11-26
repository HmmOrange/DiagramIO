package com.diagramio.infrastructure.security;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** Cấu hình JWT đọc từ mục jwt.* trong application.yml. */
@ConfigurationProperties(prefix = "jwt")
@Validated
public record JwtProperties(@NotBlank(message = "JWT_SECRET is required") String secret,
                            long accessTokenMinutes, long refreshTokenDays) {

    @AssertTrue(message = "JWT_SECRET must be non-blank and at least 32 UTF-8 bytes")
    public boolean isSecretNonBlankAndLongEnough() {
        return secret == null || (!secret.isBlank() && secret.getBytes(StandardCharsets.UTF_8).length >= 32);
    }

    @AssertTrue(message = "JWT_SECRET must not use a legacy default or example value")
    public boolean isSecretNotPublic() {
        return !"dev-only-secret-please-change-it-32chars".equals(secret)
                && !"replace_with_a_long_random_secret".equals(secret);
    }
}
