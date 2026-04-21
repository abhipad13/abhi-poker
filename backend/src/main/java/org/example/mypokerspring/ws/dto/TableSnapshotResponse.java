// src/main/java/org/example/mypokerspring/ws/dto/TableSnapshotResponse.java
package org.example.mypokerspring.ws.dto;

import java.util.List;
import java.util.Map;

public record TableSnapshotResponse(
        String gameId,
        String roundName,
        String turnPlayer,      // null if no hand/turn// nullable
        int totalPot,            // pots + in-round contributions
        List<PlayerView> players,
        Map<String, Integer> chipValues,
        int minRaiseAmt,
        int minCallAmt,// includes per-player contribution + displayCents
        Integer smallBlindCents,
        Integer bigBlindCents
) {
    public record PlayerView(
            String name,
            int displayCents,
            int contributionCents,
            boolean folded,
            boolean allIn
    ) {}
}