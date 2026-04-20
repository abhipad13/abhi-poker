// src/main/java/org/example/mypokerspring/ws/dto/LogPayload.java
package org.example.mypokerspring.ws.dto;

public record LogPayload(
        String gameId,
        String event,     // e.g. "PLAYER_ACTION"
        String message,
        boolean error
) {}