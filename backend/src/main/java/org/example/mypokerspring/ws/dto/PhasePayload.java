// src/main/java/org/example/mypokerspring/ws/dto/PhasePayload.java
package org.example.mypokerspring.ws.dto;

public record PhasePayload(
        String gameId,
        String phase   // "Pre-Flop","Flop","Turn","River","Showdown"
) {}