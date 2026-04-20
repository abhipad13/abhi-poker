// src/main/java/org/example/mypokerspring/ws/dto/ShowdownInfoPayload.java
package org.example.mypokerspring.ws.dto;

import java.util.List;

public record ShowdownInfoPayload(
        String gameId,
        int totalPot,
        List<PlayerView> players,
        boolean showdownOver
) {
    public record PlayerView(
            String name,
            int moneyCents,
            boolean folded,
            boolean allIn
    ) {}
}