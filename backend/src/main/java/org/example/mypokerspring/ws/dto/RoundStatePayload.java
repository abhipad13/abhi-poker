// src/main/java/org/example/mypokerspring/ws/dto/RoundStatePayload.java
package org.example.mypokerspring.ws.dto;
import java.util.List;

public record RoundStatePayload(
        String gameId,
        int roundNumber,
        String roundName,
        String turnPlayer,
        int turnIndex,
        int highestBetCents,
        Integer minRaiseToCents,         // nullable when not applicable
        List<String> legalActions        // e.g. ["CALL_RAISE","FOLD","CHECK"]
) {}