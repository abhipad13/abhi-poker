package org.example.mypokerspring.model;

public class MoveRequest {
    private String playerId;     // ✅ Player identifier (name or unique ID)
    private MoveType selection;  // ✅ CALL_RAISE, FOLD, or CHECK
    private Integer bet;         // ✅ null unless CALL_RAISE

    // ✅ Player ID
    public String getPlayerId() {
        return playerId;
    }
    public void setPlayerId(String playerId) {
        this.playerId = playerId;
    }

    // ✅ Move selection
    public MoveType getSelection() {
        return selection;
    }
    public void setSelection(MoveType selection) {
        this.selection = selection;
    }

    // ✅ Bet amount (nullable for CHECK/FOLD)
    public Integer getBet() {
        return bet;
    }
    public void setBet(Integer bet) {
        this.bet = bet;
    }
}
