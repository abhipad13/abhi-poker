package org.example.mypokerspring.service;

import org.example.mypokerspring.exception.NotFoundException;
import org.example.mypokerspring.model.Game;
import org.example.mypokerspring.ws.GameBroadcaster;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GameService {

    private static final Logger log = LoggerFactory.getLogger(GameService.class);
    private static final int EXPIRY_HOURS = 4;

    private final Map<String, Game> games = new ConcurrentHashMap<>();
    private final Map<String, Instant> lastActivity = new ConcurrentHashMap<>();
    private final GameBroadcaster broadcaster;

    public GameService(GameBroadcaster broadcaster) {
        this.broadcaster = broadcaster;
    }

    public Game createGame(String gameId, String managerId) {
        Game game = new Game(gameId, broadcaster);
        game.addPlayer(managerId);
        game.setManagerId(managerId);
        games.put(gameId, game);
        lastActivity.put(gameId, Instant.now());
        return game;
    }

    public Game getGame(String gameId) {
        Game game = games.get(gameId);
        if (game == null) {
            throw new NotFoundException("Game not found: " + gameId);
        }
        lastActivity.put(gameId, Instant.now());
        return game;
    }

    public Map<String, Game> getAllGames() {
        return games;
    }

    // Runs every 30 minutes. Removes games with no activity for EXPIRY_HOURS.
    @Scheduled(fixedDelay = 30 * 60 * 1000)
    public void evictExpiredGames() {
        Instant cutoff = Instant.now().minus(EXPIRY_HOURS, ChronoUnit.HOURS);
        lastActivity.entrySet().removeIf(entry -> {
            if (entry.getValue().isBefore(cutoff)) {
                games.remove(entry.getKey());
                log.info("Evicted expired game {}", entry.getKey());
                return true;
            }
            return false;
        });
    }
}

