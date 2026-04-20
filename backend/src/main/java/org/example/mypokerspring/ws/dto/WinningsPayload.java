package org.example.mypokerspring.ws.dto;

// src/main/java/org/example/mypokerspring/ws/dto/WinningsPayload.java

import java.util.Map;

public record WinningsPayload(
        String gameId,
        Map<String, Integer> winningsCents,
        boolean showdownOver// playerName -> amount won
) {}
