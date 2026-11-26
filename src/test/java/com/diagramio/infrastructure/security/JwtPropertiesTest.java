package com.diagramio.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.diagramio.DiagramioApplication;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

class JwtPropertiesTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(JwtBindingConfig.class)
            .withPropertyValues("spring.config.location=classpath:/application.yml")
            .withInitializer(context -> {
                var sources = context.getEnvironment().getPropertySources();
                sources.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
                sources.remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
                new ConfigDataApplicationContextInitializer().initialize(context);
            });

    @Test
    void missingSecretPreventsStartup() {
        contextRunner.run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining("JWT_SECRET");
        });
    }

    @Test
    void applicationReportsInvalidSecretBeforeConnectingToDatabase() {
        assertThatThrownBy(() -> DiagramioApplication.main(new String[] {
                "--jwt.secret=",
                "--spring.datasource.url=jdbc:postgresql://127.0.0.1:1/diagram_app",
                "--server.port=0"
        })).hasStackTraceContaining("JWT_SECRET is required");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "                                "})
    void blankSecretPreventsStartup(String secret) {
        assertRejected(secret, "JWT_SECRET is required");
    }

    @Test
    void unicodeWhitespaceOnlySecretPreventsStartup() {
        assertRejected("\u3000".repeat(11), "JWT_SECRET must be non-blank");
    }

    @Test
    void secretShorterThan32Utf8BytesPreventsStartup() {
        assertRejected("é".repeat(15) + "a", "at least 32 UTF-8 bytes");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "dev-only-secret-please-change-it-32chars",
            "replace_with_a_long_random_secret"
    })
    void publicSecretPreventsStartup(String secret) {
        assertRejected(secret, "JWT_SECRET must not use a legacy default or example value");
    }

    @Test
    void secretWithExactly32Utf8BytesAllowsStartup() {
        String secret = "é".repeat(16);

        withSecret(secret).run(context -> {
            assertThat(context).hasNotFailed();
            JwtProperties properties = context.getBean(JwtProperties.class);
            assertThat(properties.secret()).isEqualTo(secret);
            assertThat(properties.accessTokenMinutes()).isEqualTo(15);
            assertThat(properties.refreshTokenDays()).isEqualTo(7);
        });
    }

    private void assertRejected(String secret, String reason) {
        withSecret(secret).run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining(reason);
        });
    }

    private ApplicationContextRunner withSecret(String secret) {
        return contextRunner.withInitializer(context -> context.getEnvironment().getPropertySources()
                .addFirst(new MapPropertySource("jwtSecretFixture", Map.of("JWT_SECRET", secret))));
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableConfigurationProperties(JwtProperties.class)
    static class JwtBindingConfig {
    }
}
