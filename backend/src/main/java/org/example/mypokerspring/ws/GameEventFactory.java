package org.example.mypokerspring.ws;
import org.example.mypokerspring.model.*;
import org.example.mypokerspring.ws.dto.*;
import java.util.*;
import java.util.stream.Collectors;

public class GameEventFactory {

    public static RoundStatePayload roundState(String gameId, Hand hand) {
        Round r = hand.getCurrentRound();
        String name = hand.getRoundName();

        Integer minRaiseTo = null;
        if (r != null) {
            int highest = r.getHighestBetCents();
            int minRaise = r.minRaiseAmtCents();
            if (minRaise > highest) minRaiseTo = minRaise;
        }

        List<String> legal = new ArrayList<>();
        if (!hand.isShowdownStarted()) {
            legal.add("FOLD");
            legal.add("CHECK");
            legal.add("CALL_RAISE");
        }

        String turnPlayer = null;
        int turnIndex = -1;
        if (!hand.isShowdownStarted() && r != null && !r.getActivePlayers().isEmpty()) {
            turnIndex = r.getPlayerIndex();
            turnPlayer = r.getActivePlayers().get(turnIndex).getName();
        }

        return new RoundStatePayload(
                gameId,
                hand.getCurrentRoundNumber(),
                name,
                turnPlayer,
                turnIndex,
                (r != null ? r.getHighestBetCents() : 0),
                minRaiseTo,
                legal
        );
    }

    public static PlayerStatePayload playerState(String gameId, Hand handOrNull, List<User> tablePlayers) {
        // Pull contributions map if we're in a round; otherwise empty.
        Map<User, Integer> contrib;
        if (handOrNull != null && handOrNull.getCurrentRound() != null) {
            contrib = handOrNull.getCurrentRound().getContributionsCents();
        } else {
            contrib = Collections.emptyMap();
        }

        List<PlayerStatePayload.PlayerView> views = tablePlayers.stream()
                .map(p -> {
                    boolean folded = handOrNull != null && handOrNull.hasPlayerFolded(p);
                    boolean allIn = p.getMoneyCents() == 0;
                    int contributionCents = contrib.getOrDefault(p, 0);
                    return new PlayerStatePayload.PlayerView(
                            p.getName(),
                            p.getMoneyCents(),
                            folded,
                            allIn,
                            contributionCents,
                            p.getMoneyCents() - contributionCents
                    );
                })
                .toList();

        return new PlayerStatePayload(gameId, views);
    }

    public static TableSnapshotPayload snapshot(Game game) {
        String gameId = game.getGameId();
        Hand hand = game.getCurrentHand();
        GameSettings settings = game.getSettings();

        Map<String,Integer> chipValues =
                (settings != null && settings.getChipValues() != null)
                        ? Map.copyOf(settings.getChipValues())
                        : Map.of();

        Integer smallBlindCents = (settings != null) ? settings.getSmallBlindCents() : null;
        Integer bigBlindCents   = (settings != null) ? settings.getBigBlindCents()   : null;

        // No hand yet → "Waiting"
        if (hand == null) {
            List<TableSnapshotPayload.PlayerView> players = game.getPlayers().stream()
                    .map(p -> new TableSnapshotPayload.PlayerView(
                            p.getName(),
                            p.getMoneyCents(), // full stack (no contribution yet)
                            0,
                            false,
                            p.getMoneyCents() == 0
                    ))
                    .toList();

            return new TableSnapshotPayload(
                    gameId,
                    "Waiting",
                    null,
                    0,              // totalPot
                    players,
                    chipValues,
                    0,              // minRaiseAmt
                    0,              // minCallAmt
                    smallBlindCents,
                    bigBlindCents
            );
        }

        Round r = hand.getCurrentRound();

        String roundName = hand.getRoundName();

        // Whose turn (if any)
        String turnPlayer = null;
        if (!hand.isShowdownStarted() && r != null && !r.getActivePlayers().isEmpty()) {
            int idx = r.getPlayerIndex();
            if (idx >= 0 && idx < r.getActivePlayers().size()) {
                turnPlayer = r.getActivePlayers().get(idx).getName();
            }
        }

        // Contributions this street
        Map<User,Integer> contribs = (r != null) ? r.getContributionsCents() : Map.of();

        // Pot = sum(pots) + sum(contributions)
        int potsSum = hand.getHandPots().stream().mapToInt(p -> p.getPotTotalCents()).sum();
        int contribSum = contribs.values().stream().mapToInt(v -> v).sum();
        int totalPot = potsSum + contribSum;

        // Players (displayCents = stack - current contribution)
        List<TableSnapshotPayload.PlayerView> players = game.getPlayers().stream()
                .map(p -> {
                    int c = contribs.getOrDefault(p, 0);
                    int display = p.getMoneyCents() - c;
                    boolean folded = hand.hasPlayerFolded(p);
                    boolean allIn = p.getMoneyCents() == 0;
                    return new TableSnapshotPayload.PlayerView(
                            p.getName(), display, c, folded, allIn
                    );
                })
                .toList();

        // Raise/call amounts
        int highestBetCents = (r != null) ? r.getHighestBetCents() : 0;
        int minRaiseAmt = (r != null) ? r.minRaiseAmtCents() : 0; // already highest + last raise
        int minCallAmt  = highestBetCents;                         // call amount = current highest bet

        return new TableSnapshotPayload(
                gameId,
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
    }

    public static ShowdownInfoPayload showdownInfo(String gameId, Hand hand, List<User> tablePlayers) {
        // Compute total pot
        int potsSum = hand.getHandPots().stream().mapToInt(p -> p.getPotTotalCents()).sum();
        int contribSum = 0;
        if (hand.getCurrentRound() != null) {
            contribSum = hand.getCurrentRound().getContributionsCents()
                    .values().stream().mapToInt(Integer::intValue).sum();
        }
        int totalPot = potsSum + contribSum;

        var views = tablePlayers.stream()
                .map(p -> new ShowdownInfoPayload.PlayerView(
                        p.getName(),
                        p.getMoneyCents(),
                        hand.hasPlayerFolded(p),
                        p.getMoneyCents() == 0
                ))
                .toList();

        return new ShowdownInfoPayload(gameId, totalPot, views, hand.showdownComplete());
    }

    public static PotStatePayload potState(String gameId, Hand handOrNull) {
        if (handOrNull == null) {
            return new PotStatePayload(gameId, List.of(), 0);
        }

        // Build pot views and sum their totals
        List<PotStatePayload.PotView> pots = handOrNull.getHandPots().stream()
                .map(p -> new PotStatePayload.PotView(
                        p.getPotTotalCents(),
                        p.getEligiblePlayers().stream().map(User::getName).toList()
                ))
                .toList();

        int potSum = handOrNull.getHandPots().stream()
                .mapToInt(Pot::getPotTotalCents)
                .sum();

        // Add any current-round, not-yet-pushed contributions
        int contribSum = 0;
        if (handOrNull.getCurrentRound() != null) {
            contribSum = handOrNull.getCurrentRound().getContributionsCents()
                    .values().stream()
                    .mapToInt(Integer::intValue)
                    .sum();
        }

        int totalPot = potSum + contribSum;

        return new PotStatePayload(gameId, pots, totalPot);
    }

    public static PlayerStatePayload playerStateFromTable(String gameId, List<User> tablePlayers) {
        var views = tablePlayers.stream()
                .map(p -> new PlayerStatePayload.PlayerView(
                        p.getName(),
                        p.getMoneyCents(),
                        false,                 // no folds pre-hand
                        p.getMoneyCents() == 0,
                        0,
                        p.getMoneyCents()
                ))
                .toList();
        return new PlayerStatePayload(gameId, views);
    }

    public static ContributionsPayload contributions(String gameId, Round r) {
        // If/when you expose contributions from Round:
        Map<String,Integer> byName = new LinkedHashMap<>();
        r.getContributionsCents().forEach((user,amt) -> byName.put(user.getName(), amt));
        return new ContributionsPayload(gameId, byName);
    }

    public static PhasePayload phase(String gameId, String phase) {
        return new PhasePayload(gameId, phase);
    }

    public static LogPayload log(String gameId, String event, String message, boolean error) {
        return new LogPayload(gameId, event, message, error);
    }

    public static TableUpdatePayload tableUpdate(
            String gameId,
            GameSettings settings,
            List<User> order,
            String manager
    ) {
        return tableUpdate(gameId, settings, order, manager, List.of());
    }

    public static TableUpdatePayload tableUpdate(
            String gameId,
            GameSettings settings,
            List<User> order,
            String manager,
            List<User> queuedPlayers
    ) {
        Map<String, Integer> basic = new LinkedHashMap<>();
        Map<String, Integer> chips = Map.of();
        Integer defaultStart = null;
        Map<String, Integer> customStarts = Map.of();

        if (settings != null) {
            basic = new LinkedHashMap<>();
            basic.put("smallBlindCents", settings.getSmallBlindCents());
            basic.put("bigBlindCents", settings.getBigBlindCents());
            chips = settings.getChipValues() != null ? settings.getChipValues() : Map.of();
            defaultStart = settings.getDefaultStartingMoneyCents();
            customStarts = settings.getCustomStartingMoneyCents() != null
                    ? settings.getCustomStartingMoneyCents()
                    : Map.of();
        }

        List<String> names      = order.stream().map(User::getName).collect(Collectors.toList());
        List<String> queueNames = queuedPlayers.stream().map(User::getName).collect(Collectors.toList());

        return new TableUpdatePayload(
                gameId,
                basic,
                chips,
                names,
                manager,
                defaultStart,
                customStarts,
                queueNames
        );
    }

    public static TurnContextPayload turnContext(String gameId, Round r) {
        if (r == null || r.getActivePlayers().isEmpty()) {
            // Fallback empty context if needed; you can also return null and skip sending
            return new TurnContextPayload(gameId, null, -1, 0, 0, 0, 0, null, List.of());
        }

        int idx = r.getPlayerIndex();
        User player = r.getActivePlayers().get(idx);

        Map<User,Integer> contribs = r.getContributionsCents();
        int contributed = contribs.getOrDefault(player, 0);

        int highest = r.getHighestBetCents();
        int toCall = Math.max(0, highest - contributed);

        // Try to compute min raise-to. If raise is closed (e.g., short all-in), set null.
        Integer minRaiseTo = null;
        try {
            int minRaiseAmt = r.minRaiseAmtCents(); // “raise to” amount for table, not “raise by”
            if (minRaiseAmt > highest) minRaiseTo = minRaiseAmt;
        } catch (Exception ignored) {}

        // Very simple legal actions list (you can make this smarter later)
        List<String> legal = new ArrayList<>();
        if (toCall == 0) {
            legal.add("CHECK");
            legal.add("CALL_RAISE"); // represents bet/raise from 0
        } else {
            legal.add("CALL_RAISE"); // represents call/raise to
        }
        legal.add("FOLD");

        return new TurnContextPayload(
                gameId,
                player.getName(),
                idx,
                contributed,
                player.getMoneyCents(),
                highest,
                toCall,
                minRaiseTo,
                legal
        );
    }
}
