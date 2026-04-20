// WebSocketConfig.java
package org.example.mypokerspring.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    
    @Value("${websocket.allowed-origin-patterns:*}")
    private String allowedOriginPatterns;
    
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // In production with static hosting, you can restrict to your domain
        // For now, allowing all for flexibility (can be restricted via application.properties)
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOriginPatterns.split(","))
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }
}