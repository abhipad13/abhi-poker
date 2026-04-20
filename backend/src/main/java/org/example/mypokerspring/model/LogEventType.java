package org.example.mypokerspring.model;

public enum LogEventType {
    SYSTEM,         // Game state changes: new hand, round started, showdown, etc.
    PLAYER_ACTION,  // Player moves like call, raise, fold, check
    JOIN_LEAVE,     // Player joins, leaves, gets accepted
    ERROR,          // Invalid move, insufficient funds, not your turn, etc.
    RESULT          // Pot awarded, player wins hand, etc.
}