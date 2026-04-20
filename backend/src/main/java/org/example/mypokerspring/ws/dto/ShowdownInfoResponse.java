package org.example.mypokerspring.ws.dto;

// src/main/java/org/example/mypokerspring/ws/dto/ShowdownInfoResponse.java

import java.util.List;

public record ShowdownInfoResponse(
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
