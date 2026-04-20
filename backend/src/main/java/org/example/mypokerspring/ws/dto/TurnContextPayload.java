package org.example.mypokerspring.ws.dto;

import java.util.List;

public record TurnContextPayload(
        String gameId,
        String player,              // whose turn it is
        int playerIndex,            // index at the table this round
        int contributedCents,       // this round, what they’ve already put in
        int stackCents,             // chips remaining (moneyCents) right now
        int highestBetCents,        // table’s current highest bet
        int toCallCents,            // how much this player must add to call
        Integer minRaiseToCents,    // nullable when raise not open or all-in-locked
        List<String> legalActions   // e.g. ["CHECK","CALL_RAISE","FOLD"]
) {}
