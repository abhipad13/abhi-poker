package org.example.mypokerspring.model;

import org.example.mypokerspring.ws.GameBroadcaster;
import org.example.mypokerspring.ws.GameEventFactory;

import org.example.mypokerspring.exception.NotFoundException;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

public class Game {

    private final String gameId;
    private final ReentrantLock lock = new ReentrantLock();
    private final List<User> players = new ArrayList<>();
    private GameSettings settings;
    private Hand currentHand;
    private String managerId;
    private boolean handHasStarted = false;
    private final List<User> queuedPlayers = new ArrayList<>();
    private final GameLog gameLog;
    private final GameBroadcaster broadcaster;

    public Game(String gameId, GameBroadcaster broadcaster) {
        this.gameId = gameId;
        this.broadcaster = broadcaster;
        this.gameLog = new GameLog(gameId, broadcaster);
    }

    public String getGameId() { return gameId; }

    public ReentrantLock getLock() { return lock; }

    public List<User> getQueuedPlayers() {
        return queuedPlayers;
    }

    public String acceptQueuedPlayer(String name, int startingMoneyCents) {
        String trimmedName = name.trim();

        // Check if already in main players list
        for (User p : players) {
            if (p.getName().equals(trimmedName)) {
                throw new IllegalArgumentException("❌ Player '" + trimmedName + "' is already in the game.");
            }
        }

        // Check if the player is in the queue
        User queuedUser = null;
        for (User q : queuedPlayers) {
            if (q.getName().equals(trimmedName)) {
                queuedUser = q;
                break;
            }
        }

        if (queuedUser == null) {
            throw new IllegalArgumentException("❌ Player '" + trimmedName + "' is not in the queue.");
        }

        // Set their starting money and move them into the game
        queuedUser.setMoneyCents(startingMoneyCents);
        players.add(queuedUser);
        queuedPlayers.remove(queuedUser);

        gameLog.log(
                LogEventType.JOIN_LEAVE,
                trimmedName + " accepted into game with $" + MoneyUtils.formatCentsAsDollars(startingMoneyCents) + "."
        , false, false);

        return "✅ Player '" + trimmedName + "' accepted into game with $" +
                MoneyUtils.formatCentsAsDollars(startingMoneyCents) + ".";
    }

    // ✅ Add players before starting a hand
    public String addPlayer(String name) {
        String trimmedName = name.trim();

        // Check for duplicates
        boolean alreadyExists = players.stream().anyMatch(p -> p.getName().equals(trimmedName));
        if (alreadyExists) {
            throw new IllegalArgumentException("❌ Player with name '" + trimmedName + "' already exists in this game.");
        }

        // If no hand yet AND settings already exist, give them starting money now
        int starting = 0;
        if (!handHasStarted && settings != null) {
            starting = settings.getCustomStartingMoneyCents()
                    .getOrDefault(trimmedName, settings.getDefaultStartingMoneyCents());
        }

        User newUser = new User(trimmedName, starting); // Money is set during settings

        if (!handHasStarted) {
            players.add(newUser);
            gameLog.log(LogEventType.JOIN_LEAVE, "➕ " + trimmedName + " joined the game.", false, false);
            gameLog.enqueueBroadcast(() -> broadcaster.sendTableUpdate(
                    GameEventFactory.tableUpdate(gameId, settings, players, managerId)));
            gameLog.enqueueBroadcast(() -> broadcaster.sendPlayerState(
                    GameEventFactory.playerState(gameId, currentHand, players)));
            return "✅ Player '" + trimmedName + "' added to game.";
        } else {
            getQueuedPlayers().add(newUser);
            gameLog.log(LogEventType.JOIN_LEAVE,"🕒 " + trimmedName + " added to queue.", true, false);
            gameLog.enqueueBroadcast(() -> broadcaster.sendTableUpdate(
                    GameEventFactory.tableUpdate(gameId, settings, players, managerId)));
            gameLog.enqueueBroadcast(() -> broadcaster.sendPlayerState(
                    GameEventFactory.playerState(gameId, currentHand, players)));
            return "🕒 Player '" + trimmedName + "' added to queue (game already in progress).";
        }
    }

    // ✅ Optional: remove player (if someone leaves the table)
    public void removePlayer(String name, String requesterId) {
        if (!isManager(requesterId)) {
            throw new IllegalArgumentException("❌ Only the game manager can remove players.");
        }

        if (hasHandInProgress()) {
            throw new IllegalStateException("❌ Cannot remove players during an active hand.");
        }

        boolean removed = players.removeIf(p -> p.getName().equals(name.trim()));
        if (!removed) {
            throw new IllegalArgumentException("❌ Player '" + name + "' not found in the game.");
        }
        gameLog.log(LogEventType.JOIN_LEAVE, name + " was removed from the game by the manager.", false, false);
    }

    public void reorderPlayers(List<String> newOrder) {
        // Validate all names exist and no duplicates
        Set<String> existingNames = players.stream()
                .map(User::getName)
                .collect(Collectors.toSet());

        if (newOrder.size() != players.size() || !existingNames.containsAll(newOrder)) {
            throw new IllegalArgumentException("❌ Invalid player list. Ensure all player names match and are unique.");
        }

        List<User> reordered = new ArrayList<>();
        for (String name : newOrder) {
            for (User player : players) {
                if (player.getName().equals(name)) {
                    reordered.add(player);
                    break;
                }
            }
        }

        this.players.clear();
        this.players.addAll(reordered);

        gameLog.log(LogEventType.SYSTEM, "🔁 Player order updated: " +
                String.join(", ", this.players.stream().map(User::getName).toList()), false, false);
    }

    // ✅ Set blinds and other settings before starting a hand
    // Game.java
    public void setSettings(GameSettings settings) {
        settings.validate();
        this.settings = settings;
        if (!handHasStarted) {
            applyInitialMoney();
        }
    }

    public void rotatePlayers() {
        if (!players.isEmpty()) {
            User first = players.remove(0);
            players.add(first);
        }
    }

    // ✅ Start a new hand (enforces game rules)
    public Hand startNewHand() {
        if (settings == null) {
            throw new IllegalStateException("Game settings must be set before starting a hand.");
        }
        if (players.size() < 2) {
            throw new IllegalStateException("At least 2 players are required to start a hand.");
        }

        currentHand = new Hand(new ArrayList<>(players), settings, gameLog);
        handHasStarted = true;

        gameLog.startNewHand();
        gameLog.log(LogEventType.SYSTEM ,"➡️ Starting Pre-Flop", false, false);

        return currentHand;
    }

    public Hand getCurrentHand() {
        return currentHand;
    }

    public boolean hasHandInProgress() {
        return currentHand != null && !currentHand.isShowdownStarted();
    }

    public List<User> getPlayers() {
        return players;
    }

    public GameSettings getSettings() {
        return settings;
    }

    public void applyInitialMoney() {
        for (User player : players) {
            int money = settings.getCustomStartingMoneyCents()
                    .getOrDefault(player.getName(), settings.getDefaultStartingMoneyCents());
            player.setMoneyCents(money);
        }
    }

    public void setManagerId(String newManagerId) {
        boolean exists = players.stream().anyMatch(p -> p.getName().equals(newManagerId));
        if (!exists) {
            throw new IllegalArgumentException("❌ New manager must be a current player.");
        }
        this.managerId = newManagerId;
        gameLog.log(LogEventType.JOIN_LEAVE, "👑 " + newManagerId + " is now the game manager.", false, false);
        gameLog.enqueueBroadcast(() -> broadcaster.sendTableUpdate(
                GameEventFactory.tableUpdate(gameId, settings, players, this.managerId)));
    }

    public String getManagerId() {
        return managerId;
    }

    public boolean isManager(String playerId) {
        return playerId != null && playerId.equals(managerId);
    }

    public void requireManager(String requesterId) {
        if (!isManager(requesterId)) {
            throw new IllegalArgumentException("❌ Only the game manager can perform this action.");
        }
    }

    public Hand requireActiveHand() {
        if (currentHand == null) {
            throw new IllegalStateException("No hand is currently active. Start a hand first.");
        }
        return currentHand;
    }

    public User requirePlayer(String name) {
        User player = findPlayer(name);
        if (player == null) {
            throw new NotFoundException("Player '" + name + "' not found in this game.");
        }
        return player;
    }

    public boolean hasHandStarted() {
        return handHasStarted;
    }

    public User findPlayer(String name) {
        for (User player : players) {
            if (name.equals(player.getName())) {
                return player;
            }
        }
        return null;
    }

    public GameLog getGameLog() {
        return gameLog;
    }
}