package org.example.mypokerspring.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@ConditionalOnProperty(name = "app.serve-static", havingValue = "true")
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addViewControllers(@NonNull ViewControllerRegistry registry) {
        // Forward non-file routes to index.html for SPA, but do NOT capture asset requests (paths containing a dot)
        registry.addViewController("/{path:[^\\.]*}").setViewName("forward:/index.html");
        registry.addViewController("/{p1:[^\\.]*}/{p2:[^\\.]*}").setViewName("forward:/index.html");
        registry.addViewController("/{p1:[^\\.]*}/{p2:[^\\.]*}/{p3:[^\\.]*}").setViewName("forward:/index.html");
        registry.addViewController("/{p1:[^\\.]*}/{p2:[^\\.]*}/{p3:[^\\.]*}/{p4:[^\\.]*}").setViewName("forward:/index.html");
    }
}
