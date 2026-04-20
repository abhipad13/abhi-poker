// src/main/java/org/example/mypokerspring/ws/dto/ContributionsPayload.java
package org.example.mypokerspring.ws.dto;
import java.util.Map;

public record ContributionsPayload(
        String gameId,
        Map<String,Integer> contributionsCents
) {}