// src/main/java/org/example/mypokerspring/model/Hand.java
package org.example.mypokerspring.model;

import org.example.mypokerspring.ws.GameBroadcaster;
import org.example.mypokerspring.ws.GameEventFactory;
import org.example.mypokerspring.ws.dto.WinningsPayload;

import java.util.*;

public class Hand {

    // Table context
    private final List<User> tablePlayers;         // full seating order (for snapshots)
    private final GameSettings settings;
    private final GameLog gameLog;

    // Broadcasting (pulled from gameLog so Hand has no direct dependency in ctor)
    private final GameBroadcaster broadcaster;
    private final String gameId;

    // Hand state
    private ArrayList<User> activePlayers;
    private ArrayList<User> eligiblePlayers;
    private int currentRoundNumber;                // 1..4 (Pre-Flop..River)
    private ArrayList<Pot> handPots;
    private Round currentRound;
    private boolean showdownStarted = false;

    private static final String[] POKER_ROUNDS = {
            "Pre-Flop", "Flop", "Turn", "River", "Showdown"
    };

    public Hand(ArrayList<User> players, GameSettings settings, GameLog gameLog) {
        this.tablePlayers = players;          // already a copy from Game; use as “seating”
        this.settings = settings;
        this.gameLog = gameLog;

        // pull broadcaster + gameId from GameLog (no extra ctor params needed)
        this.broadcaster = gameLog.getBroadcaster();
        this.gameId = gameLog.getGameId();

        // initialize per-hand state
        this.activePlayers = new ArrayList<>(players);
        this.eligiblePlayers = new ArrayList<>(players);
        this.currentRoundNumber = 1;
        this.handPots = new ArrayList<>();

        // Start Pre-Flop
        this.currentRound = new Round(activePlayers, eligiblePlayers, settings, currentRoundNumber, gameLog);

        // Log + initial snapshots
        gameLog.log(LogEventType.SYSTEM, "🃏 A new hand has started.", false, false);
    }

    public Round getCurrentRound() { return currentRound; }
    public int getCurrentRoundNumber() { return currentRoundNumber; }
    public ArrayList<Pot> getHandPots() { return handPots; }
    public boolean isShowdownStarted() { return showdownStarted; }

    public String getRoundName() {
        if (showdownStarted) return "Showdown";
        return POKER_ROUNDS[currentRoundNumber - 1];
    }

    public int allPotsTotalCents() {
        int totalCents = 0;
        for (Pot pot : handPots) totalCents += pot.getPotTotalCents();
        return totalCents;
    }

    public boolean hasPlayerFolded(User player) { return !eligiblePlayers.contains(player); }
    public boolean showdownComplete() { return handPots.isEmpty(); }

    public void assignPotToWinners(List<User> winners) {
        if (!showdownStarted) throw new IllegalStateException("Showdown has not started yet.");
        if (handPots.isEmpty()) throw new IllegalStateException("There are no pots left to assign.");

        List<Pot> potsToRemove = new ArrayList<>();
        Map<String, Integer> winningsMap = new HashMap<>(); // <--- collect winnings per player

        for (Pot pot : handPots) {
            // find which of the winners are actually eligible for THIS pot
            List<User> eligibleWinners = winners.stream()
                    .filter(pot::isEligible)
                    .toList();

            if (eligibleWinners.isEmpty()) {
                continue; // no winners eligible for this pot
            }

            int total = pot.getPotTotalCents();

            // equal split (rounded down)
            int share = total / eligibleWinners.size();

            for (User w : eligibleWinners) {
                w.add(share);

                // accumulate winnings for broadcast
                winningsMap.merge(w.getName(), share, Integer::sum);

                gameLog.log(LogEventType.RESULT,
                        "🏆 " + w.getName() + " won $" +
                                MoneyUtils.formatCentsAsDollars(share) +
                                " from the pot.", false, false);
            }

            potsToRemove.add(pot);
        }

        // remove all distributed pots
        handPots.removeAll(potsToRemove);

        if (showdownComplete()) {
            gameLog.log(LogEventType.SYSTEM,
                    "🎉 All pots distributed. Hand complete.", false, false);
        }

        if (!winningsMap.isEmpty()) {
            WinningsPayload payload = new WinningsPayload(gameId, winningsMap, showdownComplete());
            gameLog.enqueueBroadcast(() -> broadcaster.sendWinnings(payload));
        }
    }

    public void startNextRound() {
        currentRoundNumber++;
        if (currentRoundNumber <= 4 && activePlayers.size() >= 2) {
            currentRound = new Round(activePlayers, eligiblePlayers, settings, currentRoundNumber, gameLog);
            String phaseName = POKER_ROUNDS[currentRoundNumber - 1];
            gameLog.log(LogEventType.SYSTEM, "➡️ Starting " + phaseName, false, false);

        } else {
            gameLog.log(LogEventType.SYSTEM, "⚔️ Betting rounds complete. Entering showdown.", true, false);
            handleShowdown();
        }
    }

    public void handleShowdown() {
        showdownStarted = true;
        var payload = GameEventFactory.showdownInfo(gameId, this, tablePlayers);
        gameLog.enqueueBroadcast(() -> broadcaster.sendShowdownInfo(payload));
    }

    private void autoAwardSingleWinnerPots() {
        List<Pot> potsToRemove = new ArrayList<>();

        for (Pot pot : handPots) {
            Set<User> eligible = pot.getEligiblePlayers();
            eligible.removeIf(player -> !this.eligiblePlayers.contains(player));

            if (eligible.size() == 1) {
                User winner = new ArrayList<>(eligible).get(0);
                int winnings = pot.getPotTotalCents();
                winner.add(winnings);

                gameLog.log(LogEventType.RESULT,
                        "🥇 " + winner.getName() + " awarded $" +
                                MoneyUtils.formatCentsAsDollars(winnings) + " from pot due to unmatched all-in.", false, false);

                potsToRemove.add(pot);
            }
        }
        handPots.removeAll(potsToRemove);
    }

    public void applyMove(User player, MoveType moveType, Integer bet) {
        if (showdownStarted) throw new IllegalStateException("Showdown has started. No more moves allowed.");
        if (currentRound == null) throw new IllegalStateException("No active betting round.");


        currentRound.playUser(player, moveType, bet);

        // If the round just ended, settle + create pots + publish pots, then advance phase
        if (currentRound.bettingClosed()) {
            currentRound.settleBets();
            currentRound.createPots();
            handPots.addAll(currentRound.getRoundPots());

            startNextRound();
        }
    }
}