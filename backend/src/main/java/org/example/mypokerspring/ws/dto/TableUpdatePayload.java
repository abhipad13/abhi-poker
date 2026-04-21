// src/main/java/org/example/mypokerspring/ws/dto/TableUpdatePayload.java
package org.example.mypokerspring.ws.dto;
import java.util.List;
import java.util.Map;

public record TableUpdatePayload(
        String gameId,
        Map<String,Integer> settings,      // e.g. smallBlindCents, bigBlindCents
        Map<String,Integer> chipValues,    // white/red/green/blue/black
        List<String> order,
        String manager,
        Integer defaultStartingMoneyCents,
        Map<String, Integer> customStartingMoneyCents,
        List<String> queuedPlayers
) {}