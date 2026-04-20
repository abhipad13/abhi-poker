package org.example.mypokerspring.model;

import org.example.mypokerspring.ws.GameBroadcaster;
import org.example.mypokerspring.ws.dto.LogPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

public class GameLog {
    private static final Logger log = LoggerFactory.getLogger(GameLog.class);

    private final Map<Integer, List<LogPayload>> handLogs = new LinkedHashMap<>();
    private int currentHandNumber = 0;
    private final List<Runnable> pendingBroadcasts = new ArrayList<>();

    private final String gameId;
    private final GameBroadcaster broadcaster;

    public String getGameId() {
        return gameId;
    }

    public GameBroadcaster getBroadcaster() {
        return broadcaster;
    }

    public GameLog(String gameId, GameBroadcaster broadcaster) {
        this.gameId = gameId;
        this.broadcaster = broadcaster;
    }

    public void startNewHand() {
        currentHandNumber++;
        handLogs.put(currentHandNumber, new ArrayList<>());
    }

    public void log(LogEventType eventType, String message, boolean broadcast, boolean error) {
        if (!handLogs.containsKey(currentHandNumber)) {
            handLogs.put(currentHandNumber, new ArrayList<>());
        }

        LogPayload payload = new LogPayload(
                gameId,
                eventType.name(),
                message,
                error
        );

        handLogs.get(currentHandNumber).add(payload);
        if (broadcast) {
            pendingBroadcasts.add(() -> this.broadcaster.sendLog(payload));
        }
    }

    public void enqueueBroadcast(Runnable broadcast) {
        pendingBroadcasts.add(broadcast);
    }

    public void flushBroadcasts() {
        List<Runnable> toFlush = new ArrayList<>(pendingBroadcasts);
        pendingBroadcasts.clear();
        for (Runnable r : toFlush) {
            try {
                r.run();
            } catch (Exception e) {
                log.warn("Failed to send broadcast: {}", e.getMessage());
            }
        }
    }

    public List<LogPayload> getCurrentHandLogs() {
        return handLogs.getOrDefault(currentHandNumber, new ArrayList<>());
    }

    public Map<Integer, List<LogPayload>> getAllLogs() {
        return handLogs;
    }

}