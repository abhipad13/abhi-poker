package org.example.mypokerspring.model;
import java.util.*;

public class Round {
    private ArrayList<User> activePlayers;
    private ArrayList<User> eligiblePlayers;
    private int prevRaiseCents;
    private int highestBetCents;
    private boolean isPreFlop;
    private int playerIndex;
    private GameSettings settings;
    private ArrayList<Pot> roundPots;
    private Map<User, Integer> contributionsCents;
    private boolean raiseReopened;
    private Set<User> actedPlayers;
    private User smallBlindPlayer;
    private User bigBlindPlayer;
    private Set<User> blindPosted;
    private GameLog gameLog;

    public Round(ArrayList<User> activePlayers, ArrayList<User> eligiblePlayers, GameSettings settings, int currentRound, GameLog gameLog) {
        this.activePlayers = activePlayers;
        this.eligiblePlayers = eligiblePlayers;
        this.settings = settings;
        this.isPreFlop = (currentRound == 1);
        this.prevRaiseCents = 0;
        this.highestBetCents = 0;
        this.playerIndex = 0;
        this.roundPots = new ArrayList<>();
        this.raiseReopened = true;
        this.contributionsCents = new HashMap<>();
        this.actedPlayers = new HashSet<>();
        this.blindPosted = new HashSet<>();
        this.gameLog = gameLog;

        if (isPreFlop && activePlayers.size() >= 2) {
            this.smallBlindPlayer = activePlayers.get(0);
            this.bigBlindPlayer = activePlayers.get(1);
        }
    }

    public int getPlayerIndex() {
        return playerIndex;
    }

    public int getHighestBetCents() {
        return highestBetCents;
    }

    public ArrayList<User> getActivePlayers() {
        return activePlayers;
    }

    public Map<User, Integer> getContributionsCents() {
        return contributionsCents;
    }

    public void nextPlayer() {
        if (!activePlayers.isEmpty()) {
            playerIndex = (playerIndex + 1) % activePlayers.size();
        }
    }

    public int minRaiseAmtCents() {
        return highestBetCents + prevRaiseCents;
    }

    public boolean isValidCall(int betCents) {
        return betCents == highestBetCents;
    }

    public boolean isValidRaise(int betCents) {
        return betCents >= (highestBetCents + prevRaiseCents);
    }

    private void handleCallRaise(User player, int betCents) {
        int requiredBlindCents = 0;
        boolean isPostingBlind = false;

        if (isPreFlop && !blindPosted.contains(player)) {
            if (player.equals(smallBlindPlayer)) {
                requiredBlindCents = settings.getSmallBlindCents();
                isPostingBlind = true;
            } else if (player.equals(bigBlindPlayer)) {
                requiredBlindCents = settings.getBigBlindCents();
                isPostingBlind = true;
            }
        }

        if (isPostingBlind) {
            if (betCents != requiredBlindCents && betCents != player.getMoneyCents()) {
                String blindType = player.equals(smallBlindPlayer) ? "small" : "big";
                gameLog.log(LogEventType.ERROR,
                        "❌ You must post exactly the " + blindType + " blind of $" +
                                MoneyUtils.formatCentsAsDollars(requiredBlindCents) + ".", true, true);
                throw new IllegalArgumentException("Must post exact blind amount.");
            }
            int actualBlindCents = Math.min(requiredBlindCents, player.getMoneyCents());
            boolean isShortAllIn = actualBlindCents < requiredBlindCents;
            String blindType = player.equals(smallBlindPlayer) ? "Small" : "Big";
            gameLog.log(LogEventType.PLAYER_ACTION,
                    "💰 " + player.getName() + " posted " + blindType + " Blind of $" +
                            MoneyUtils.formatCentsAsDollars(actualBlindCents) +
                            (isShortAllIn ? " (all-in)" : ""), true, false);
            blindPosted.add(player);
            contributionsCents.put(player, actualBlindCents);
            if (isShortAllIn) {
                activePlayers.remove(player);
            }
            if (player.equals(bigBlindPlayer)) {
                highestBetCents = actualBlindCents;
                prevRaiseCents  = requiredBlindCents;
                raiseReopened   = !isShortAllIn;
            }
            return;
        }

        if (!raiseReopened) {
            if (!isValidCall(betCents) && !player.isAllIn(betCents)) {
                gameLog.log(LogEventType.ERROR, "Short all-in made. Call or Fold", true, true);
                throw new IllegalArgumentException("A short all-in was made on the previous turn. You can only call or fold.");
            }
        }

        handleBet(player, betCents);
    }

    private void handleBet(User player, int betCents) {
        if (player.isAllIn(betCents)) {
            contributionsCents.put(player, betCents);

            if (betCents >= (highestBetCents + prevRaiseCents)) {
                prevRaiseCents = betCents - highestBetCents;
                highestBetCents = betCents;
                raiseReopened = true;
            } else {
                highestBetCents = Math.max(highestBetCents, betCents);
                raiseReopened = false;
            }

            activePlayers.remove(player);
            gameLog.log(LogEventType.PLAYER_ACTION,
                    "💥 " + player.getName() + " went all-in with $" +
                            MoneyUtils.formatCentsAsDollars(betCents), true, false);
            return;
        }

        if (player.canBet(betCents)) {
            boolean openBet = false;
            if (highestBetCents == 0) {
                highestBetCents = betCents;
                prevRaiseCents = betCents;
                openBet = true;
            }

            if (isValidCall(betCents)) {
                contributionsCents.put(player, betCents);
                if (openBet){
                    gameLog.log(LogEventType.PLAYER_ACTION,
                            "\uD83D\uDCB0 " + player.getName() + " bets $" +
                                    MoneyUtils.formatCentsAsDollars(betCents), true, false);
                } else {
                    gameLog.log(LogEventType.PLAYER_ACTION,
                            "📞 " + player.getName() + " called $" +
                                    MoneyUtils.formatCentsAsDollars(betCents), true, false);
                }
            } else if (isValidRaise(betCents)) {
                contributionsCents.put(player, betCents);
                prevRaiseCents = betCents - highestBetCents;
                highestBetCents = betCents;
                raiseReopened = true;
                gameLog.log(LogEventType.PLAYER_ACTION,
                        "🔺 " + player.getName() + " raised to $" +
                                MoneyUtils.formatCentsAsDollars(betCents), true, false);
            } else {
                gameLog.log(LogEventType.ERROR, "Invalid bet. Check min call/raise.", true, true);
                throw new IllegalArgumentException(Messages.CALL_AMT_M + MoneyUtils.formatCentsAsDollars(highestBetCents) + "\n" + Messages.RAISE_AMT_M + MoneyUtils.formatCentsAsDollars(minRaiseAmtCents()) + "\n" + "You can go all-in for: " + MoneyUtils.formatCentsAsDollars(player.getMoneyCents()));
            }
        } else {
            gameLog.log(LogEventType.ERROR, "Insufficient balance for that bet.", true, true);
            throw new IllegalArgumentException(Messages.LOW_BALANCE_M);
        }
    }

    private void handleFold(User player) {
        // Prevent folding before posting blinds
        if (isPreFlop && !blindPosted.contains(player)) {
            if (player.equals(smallBlindPlayer) || player.equals(bigBlindPlayer)) {
                gameLog.log(LogEventType.ERROR, "Must post blind before folding.", true, true);
                throw new IllegalArgumentException("❌ You must post your blind before you can fold.");
            }
        }

        activePlayers.remove(player);
        eligiblePlayers.remove(player);
        gameLog.log(LogEventType.PLAYER_ACTION,
                "❌ " + player.getName() + " folded.", true, false);
    }

    private void handleCheck(User player) {
        // Prevent checking before posting blinds
        if (isPreFlop && !blindPosted.contains(player)) {
            if (player.equals(smallBlindPlayer) || player.equals(bigBlindPlayer)) {
                gameLog.log(LogEventType.ERROR, "Must post blind.", true, true);
                throw new IllegalArgumentException("❌ You must post your blind before you can check.");
            }
        }

        handleBet(player, 0);
        gameLog.log(LogEventType.PLAYER_ACTION,
                "🔘 " + player.getName() + " checked.", true, false);
    }

    public boolean bettingClosed() {
        if (eligiblePlayers.size() < 2) {
            return true;
        }
        for (User player : activePlayers) {
            int playerBetCents = contributionsCents.getOrDefault(player, 0);
            if (!actedPlayers.contains(player)) {
                return false;
            }
            if (playerBetCents < highestBetCents) {
                return false;
            }
        }
        return true;
    }

    public void settleBets() {
        for (Map.Entry<User, Integer> entry : contributionsCents.entrySet()) {
            User player = entry.getKey();
            int currentBetCents = entry.getValue();
            player.bet(currentBetCents);
        }
    }

    public void createPots() {
        while (!contributionsCents.isEmpty()) {
            int minAllInCents = Integer.MAX_VALUE;

            for (int amountCents : contributionsCents.values()) {
                if (amountCents > 0 && amountCents < minAllInCents) {
                    minAllInCents = amountCents;
                }
            }

            if (minAllInCents == Integer.MAX_VALUE) break;

            Pot pot = new Pot();

            for (Map.Entry<User, Integer> entry : contributionsCents.entrySet()) {
                User player = entry.getKey();
                int currentBetCents = entry.getValue();

                pot.addContribution(player, minAllInCents, eligiblePlayers.contains(player));
                contributionsCents.put(player, currentBetCents - minAllInCents);
            }

            roundPots.add(pot);
            contributionsCents.entrySet().removeIf(e -> e.getValue() <= 0);
        }
    }

    public ArrayList<Pot> getRoundPots() {
        return roundPots;
    }

    public void playUser(User player, MoveType moveType, Integer bet) {
        // ✅ Enforce turn order HERE
        User currentPlayer = activePlayers.get(playerIndex);
        if (!currentPlayer.equals(player)) {
            throw new IllegalArgumentException("❌ It's not your turn.");
        }

        // ✅ Process move only if correct player
        userMove(player, moveType, bet);

        if (!activePlayers.contains(player)) {
            if (playerIndex >= activePlayers.size()) {
                playerIndex = 0;
            }
        } else {
            nextPlayer();
            actedPlayers.add(player);
        }
    }


    public void userMove(User player, MoveType moveType, Integer bet) {
        switch (moveType) {
            case CALL_RAISE -> handleCallRaise(player, bet);
            case FOLD -> handleFold(player);
            case CHECK -> handleCheck(player);
            // ✅ no default needed because enum covers all cases
        }
    }
}

