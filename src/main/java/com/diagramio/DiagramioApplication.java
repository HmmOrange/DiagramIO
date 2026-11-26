package com.diagramio;

import com.diagramio.config.AuthConfig;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DiagramioApplication {

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(DiagramioApplication.class);
        application.addInitializers(AuthConfig::validateJwtProperties);
        application.run(args);
    }
}
