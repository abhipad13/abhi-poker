// src/main/java/org/example/mypokerspring/ws/dto/TableSnapshotPayload.java
package org.example.mypokerspring.ws.dto;

import java.util.List;
import java.util.Map;

public record TableSnapshotPayload(
        String gameId,
        String roundName,   // "Waiting", "Pre-Flop", "Flop", "Turn", "River", "Showdown"
        String turnPlayer,  // null if none
        int totalPot,       // cents
        List<PlayerView> players,
        Map<String,Integer> chipValues,
        int minRaiseAmt,
        int minCallAmt
) {
    public record PlayerView(
            String name,
            int displayCents,     // stack - current contribution
            int contributionCents,
            boolean folded,
            boolean allIn
    ) {}
}