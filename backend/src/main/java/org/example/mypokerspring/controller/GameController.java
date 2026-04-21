package org.example.mypokerspring.controller;

import org.example.mypokerspring.ws.GameBroadcaster;
import org.example.mypokerspring.ws.GameEventFactory;
import org.example.mypokerspring.ws.dto.ShowdownInfoPayload;
import org.example.mypokerspring.ws.dto.ShowdownInfoResponse;
import org.example.mypokerspring.ws.dto.TableSnapshotResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.example.mypokerspring.service.GameService;
import org.example.mypokerspring.model.*;
import org.example.mypokerspring.ws.dto.LogPayload;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/game")
public class GameController {

    private final GameService gameService;
    private static final Logger log = LoggerFactory.getLogger(GameController.class);
    private final GameBroadcaster broadcaster;

    public GameController(GameService gameService, GameBroadcaster gameBroadcaster) {
        this.gameService = gameService;
        this.broadcaster = gameBroadcaster;
    }

    @PostMapping("/create")
    public Map<String, String> createGame(@RequestParam String managerName) {
        log.info("📥 POST /api/game/create managerName={}", managerName);
        String gameId = UUID.randomUUID().toString().substring(0, 8);
        gameService.createGame(gameId, managerName.trim());
        return Collections.singletonMap("gameId", gameId);
    }

    @PostMapping("/{gameId}/player")
    public String addPlayer(@PathVariable String gameId,
                            @RequestParam String name) {
        log.info("📥 POST /api/game/{}/player name={}", gameId, name);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            String result = game.addPlayer(name);
            return result;
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/settings")
    public GameSettings getSettings(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/settings", gameId);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            return game.getSettings();
        } finally {
            game.getLock().unlock();
        }
    }

    @PostMapping("/{gameId}/settings")
    public String setSettings(@PathVariable String gameId,
                              @RequestParam String requesterName,
                              @RequestBody GameSettings settings) {
        log.info("📥 POST /api/game/{}/settings requesterName={} settings={}", gameId, requesterName, settings);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            game.requireManager(requesterName);

            Set<String> playerNames = game.getPlayers().stream()
                    .map(User::getName)
                    .collect(Collectors.toSet());

            for (String name : settings.getCustomStartingMoneyCents().keySet()) {
                if (!playerNames.contains(name)) {
                    throw new IllegalArgumentException("❌ Player '" + name + "' not found in game.");
                }
            }

            game.setSettings(settings);
            broadcaster.sendTableUpdate(
                    GameEventFactory.tableUpdate(game.getGameId(), game.getSettings(), game.getPlayers(), game.getManagerId())
            );
            broadcaster.sendPlayerState(
                    GameEventFactory.playerStateFromTable(game.getGameId(), game.getPlayers())
            );
            broadcaster.sendSnapshot(GameEventFactory.snapshot(game));
            return "✅ Settings updated.";
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @PostMapping("/{gameId}/hand/start")
    public Map<String, Object> startHand(@PathVariable String gameId, @RequestParam String requesterName) {
        log.info("📥 POST /api/game/{}/hand/start requesterName={}", gameId, requesterName);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            game.requireManager(requesterName);
            game.startNewHand();
            broadcaster.sendSnapshot(GameEventFactory.snapshot(game));
            broadcaster.sendTableUpdate(
                    GameEventFactory.tableUpdate(game.getGameId(), game.getSettings(), game.getPlayers(), game.getManagerId())
            );
            return Map.of("message", "✅ New hand started.", "round", 1);
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @PostMapping("/{gameId}/move")
    public Map<String, Object> makeMove(@PathVariable String gameId,
                                        @RequestBody MoveRequest moveRequest) {
        log.info("📥 POST /api/game/{}/move request={}", gameId, moveRequest);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            Hand hand = game.requireActiveHand();
            User player = game.requirePlayer(moveRequest.getPlayerId());

            hand.applyMove(player, moveRequest.getSelection(), moveRequest.getBet());

            broadcaster.sendSnapshot(GameEventFactory.snapshot(game));

            if (hand.isShowdownStarted()) {
                return Map.of(
                        "message", "✅ Betting complete. Showdown has started.",
                        "potsRemaining", hand.getHandPots().size()
                );
            }

            return Map.of("message", "✅ Move accepted.", "round", hand.getCurrentRoundNumber());
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @PostMapping("/{gameId}/assignWinners")
    public Map<String, Object> assignWinners(@PathVariable String gameId,
                                             @RequestBody List<String> winnerIds) {
        log.info("📥 POST /api/game/{}/assignWinners ids={}", gameId, winnerIds);

        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            Hand hand = game.requireActiveHand();

            List<User> winners = winnerIds.stream()
                    .map(game::requirePlayer)
                    .toList();

            hand.assignPotToWinners(winners);

            if (hand.showdownComplete()) {
                game.rotatePlayers();
                return Map.of("message", "🎉 All pots distributed. Hand complete.");
            }
            return Map.of(
                    "message", "✅ Winnings assigned to " +
                            winners.stream().map(User::getName).toList(),
                    "potsRemaining", hand.getHandPots().size()
            );
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/players")
    public Map<String, Object> getPlayers(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/players", gameId);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            Hand hand = game.getCurrentHand();

            List<Map<String, Object>> activePlayers = game.getPlayers().stream()
                    .map(player -> {
                        boolean folded = (hand != null) && hand.hasPlayerFolded(player);
                        boolean allIn = player.getMoneyCents() == 0;

                        Map<String, Object> playerMap = new HashMap<>();
                        playerMap.put("name", player.getName());
                        playerMap.put("chips", player.getMoneyCents());
                        playerMap.put("folded", folded);
                        playerMap.put("allIn", allIn);
                        return playerMap;
                    })
                    .toList();

            List<Map<String, Object>> queuedPlayers = game.getQueuedPlayers().stream()
                    .map(player -> {
                        Map<String, Object> playerMap = new HashMap<>();
                        playerMap.put("name", player.getName());
                        return playerMap;
                    })
                    .toList();

            Map<String, Object> response = new HashMap<>();
            response.put("activePlayers", activePlayers);
            response.put("queuedPlayers", queuedPlayers);
            response.put("manager", game.getManagerId());

            return response;
        } finally {
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/round")
    public Map<String, Object> getRound(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/round", gameId);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            Hand hand = game.getCurrentHand();

            Map<String, Object> roundMap = new HashMap<>();
            if (hand == null) {
                roundMap.put("roundNumber", 0);
                roundMap.put("currentTurnPlayer", null);
                roundMap.put("highestBetCents", 0);
                return roundMap;
            }

            Round currentRound = hand.getCurrentRound();
            String currentTurn = null;
            int highestBet = 0;

            if (currentRound != null) {
                highestBet = currentRound.getHighestBetCents();
                if (!hand.isShowdownStarted()) {
                    User turnPlayer = currentRound.getActivePlayers().get(currentRound.getPlayerIndex());
                    currentTurn = turnPlayer.getName();
                }
            }

            roundMap.put("roundNumber", hand.getCurrentRoundNumber());
            roundMap.put("currentTurnPlayer", currentTurn);
            roundMap.put("highestBetCents", highestBet);

            return roundMap;
        } finally {
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/pots")
    public List<Map<String, Object>> getPots(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/pots", gameId);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            Hand hand = game.getCurrentHand();

            if (hand == null) return List.of();

            return hand.getHandPots().stream()
                    .map(pot -> Map.of(
                            "totalCents", pot.getPotTotalCents(),
                            "eligiblePlayers", pot.getEligiblePlayers().stream().map(User::getName).toList()
                    ))
                    .toList();
        } finally {
            game.getLock().unlock();
        }
    }

    @PostMapping("/{gameId}/accept")
    public String acceptQueuedPlayer(@PathVariable String gameId,
                                     @RequestBody AcceptPlayerRequest request) {
        log.info("📥 POST /api/game/{}/accept request={}", gameId, request);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            game.requireManager(request.getRequesterId());
            String result = game.acceptQueuedPlayer(request.getName(), request.getStartingMoneyCents());
            return result;
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @PutMapping("/{gameId}/player/chips")
    public String setPlayerChips(@PathVariable String gameId,
                                  @RequestParam String requesterId,
                                  @RequestParam String name,
                                  @RequestParam int amountCents) {
        log.info("📥 PUT /api/game/{}/player/chips requesterId={} name={} amountCents={}", gameId, requesterId, name, amountCents);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            game.setPlayerMoneyCents(name, amountCents, requesterId);
            return "✅ " + name + "'s chips updated.";
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @DeleteMapping("/{gameId}/player")
    public String removePlayer(@PathVariable String gameId,
                               @RequestParam String requesterId,
                               @RequestParam String name) {
        log.info("📥 DELETE /api/game/{}/player requesterId={} name={}", gameId, requesterId, name);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            game.removePlayer(name, requesterId);
            return "✅ Player '" + name + "' removed from game.";
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @PutMapping("/{gameId}/players/reorder")
    public String reorderPlayers(@PathVariable String gameId,
                                 @RequestParam String requesterId,
                                 @RequestBody List<String> newOrder) {
        log.info("📥 PUT /api/game/{}/players/reorder requesterId={} newOrder={}", gameId, requesterId, newOrder);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            game.requireManager(requesterId);
            game.reorderPlayers(newOrder);
            broadcaster.sendTableUpdate(
                    GameEventFactory.tableUpdate(game.getGameId(), game.getSettings(), game.getPlayers(), game.getManagerId())
            );
            return "✅ Player order updated.";
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @PutMapping("/{gameId}/manager")
    public String changeManager(@PathVariable String gameId,
                                @RequestParam String requesterId,
                                @RequestParam String newManagerId) {
        log.info("📥 PUT /api/game/{}/manager requesterId={} newManagerId={}", gameId, requesterId, newManagerId);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            game.requireManager(requesterId);
            game.setManagerId(newManagerId);
            return "✅ " + newManagerId + " is now the manager.";
        } finally {
            game.getGameLog().flushBroadcasts();
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/chips")
    public Map<String, Integer> getChipValues(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/chips", gameId);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            return game.getSettings().getChipValues();
        } finally {
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/logs/current")
    public List<LogPayload> getCurrentHandLogs(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/logs/current", gameId);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            return game.getGameLog().getCurrentHandLogs();
        } finally {
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/logs")
    public Map<Integer, List<LogPayload>> getAllLogs(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/logs", gameId);
        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            return game.getGameLog().getAllLogs();
        } finally {
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/snapshot")
    public TableSnapshotResponse getSnapshot(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/snapshot", gameId);

        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            Hand hand = game.getCurrentHand();

            Map<String, Integer> chipValues = Optional.ofNullable(game.getSettings())
                    .map(GameSettings::getChipValues)
                    .map(Map::copyOf)
                    .orElseGet(Map::of);

            Integer smallBlindCents = Optional.ofNullable(game.getSettings())
                    .map(GameSettings::getSmallBlindCents).orElse(null);
            Integer bigBlindCents = Optional.ofNullable(game.getSettings())
                    .map(GameSettings::getBigBlindCents).orElse(null);

            if (hand == null) {
                List<TableSnapshotResponse.PlayerView> players = game.getPlayers().stream()
                        .map(p -> new TableSnapshotResponse.PlayerView(
                                p.getName(),
                                p.getMoneyCents(),
                                0,
                                false,
                                p.getMoneyCents() == 0
                        ))
                        .toList();

                return new TableSnapshotResponse(
                        game.getGameId(),
                        "Waiting",
                        null,
                        0,
                        players,
                        chipValues,
                        0,
                        0,
                        smallBlindCents,
                        bigBlindCents
                );
            }

            Round r = hand.getCurrentRound();
            String roundName = hand.getRoundName();

            String turnPlayer = null;
            if (!hand.isShowdownStarted() && r != null && !r.getActivePlayers().isEmpty()) {
                int idx = r.getPlayerIndex();
                if (idx >= 0 && idx < r.getActivePlayers().size()) {
                    turnPlayer = r.getActivePlayers().get(idx).getName();
                }
            }

            Map<User, Integer> contribs = (r != null) ? r.getContributionsCents() : Map.of();

            int potsSum = hand.getHandPots().stream()
                    .mapToInt(Pot::getPotTotalCents)
                    .sum();

            int contribSum = contribs.values().stream()
                    .mapToInt(v -> v)
                    .sum();

            int totalPot = potsSum + contribSum;

            List<TableSnapshotResponse.PlayerView> players = game.getPlayers().stream()
                    .map(p -> {
                        int contrib = contribs.getOrDefault(p, 0);
                        boolean folded = hand.hasPlayerFolded(p);
                        boolean allIn = p.getMoneyCents() == 0;
                        int displayCents = p.getMoneyCents() - contrib;
                        return new TableSnapshotResponse.PlayerView(
                                p.getName(),
                                displayCents,
                                contrib,
                                folded,
                                allIn
                        );
                    })
                    .toList();

            int minRaiseAmt = (r != null) ? r.minRaiseAmtCents() : 0;
            int minCallAmt = (r != null) ? r.getHighestBetCents() : 0;

            return new TableSnapshotResponse(
                    game.getGameId(),
                    roundName,
                    turnPlayer,
                    totalPot,
                    players,
                    chipValues,
                    minRaiseAmt,
                    minCallAmt,
                    smallBlindCents,
                    bigBlindCents
            );
        } finally {
            game.getLock().unlock();
        }
    }

    @GetMapping("/{gameId}/showdownInfo")
    public ShowdownInfoResponse getShowdownInfo(@PathVariable String gameId) {
        log.info("📥 GET /api/game/{}/showdownInfo", gameId);

        Game game = gameService.getGame(gameId);
        game.getLock().lock();
        try {
            Hand hand = game.requireActiveHand();

            int potsSum = hand.getHandPots().stream().mapToInt(Pot::getPotTotalCents).sum();

            List<ShowdownInfoResponse.PlayerView> players = game.getPlayers().stream()
                    .map(p -> new ShowdownInfoResponse.PlayerView(
                            p.getName(),
                            p.getMoneyCents(),
                            hand.hasPlayerFolded(p),
                            p.getMoneyCents() == 0
                    ))
                    .toList();

            return new ShowdownInfoResponse(potsSum, players, hand.showdownComplete());
        } finally {
            game.getLock().unlock();
        }
    }
}