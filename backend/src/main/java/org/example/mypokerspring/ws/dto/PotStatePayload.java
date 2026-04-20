// src/main/java/org/example/mypokerspring/ws/dto/PotStatePayload.java
package org.example.mypokerspring.ws.dto;
import java.util.List;

public record PotStatePayload(
        String gameId,
        List<PotView> pots,
        int totalPot
) {
    public record PotView(int totalCents, List<String> eligible) {}
}