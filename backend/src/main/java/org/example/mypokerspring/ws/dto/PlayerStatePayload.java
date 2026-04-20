// src/main/java/org/example/mypokerspring/ws/dto/PlayerStatePayload.java
package org.example.mypokerspring.ws.dto;
import java.util.List;

public record PlayerStatePayload(
        String gameId,
        List<PlayerView> players
) {
    public record PlayerView(String name, int chipsCents, boolean folded, boolean allIn, int contributionCents, int displayCents) {}
}