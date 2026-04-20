// src/main/java/org/example/mypokerspring/ws/GameBroadcaster.java
package org.example.mypokerspring.ws;

import org.example.mypokerspring.ws.dto.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
public class GameBroadcaster {
    private final SimpMessagingTemplate messaging;

    public GameBroadcaster(SimpMessagingTemplate messaging) {
        this.messaging = messaging;
    }

    private String topic(String gameId, String key) {
        return "/topic/game." + gameId + "." + key;
    }

    public void sendTurnContext(TurnContextPayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "turn"), payload);
    }

    public void sendRoundState(RoundStatePayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "round"), payload);
    }
    public void sendShowdownInfo(ShowdownInfoPayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "showdown"), payload);
    }

    public void sendWinnings(WinningsPayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "winnings"), payload);
    }

    public void sendPlayerState(PlayerStatePayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "players"), payload);
    }

    public void sendPotState(PotStatePayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "pots"), payload);
    }

    public void sendContributions(ContributionsPayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "contrib"), payload);
    }

    public void sendPhase(PhasePayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "phase"), payload);
    }

    public void sendLog(LogPayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "log"), payload);
    }

    public void sendTableUpdate(TableUpdatePayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "table"), payload);
    }

    public void sendSnapshot(TableSnapshotPayload payload) {
        messaging.convertAndSend(topic(payload.gameId(), "snapshot"), payload);
    }
}