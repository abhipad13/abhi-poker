package org.example.mypokerspring.model;

public class AcceptPlayerRequest {
    private String requesterId;
    private String name;
    private int startingMoneyCents;

    public String getRequesterId() {
        return requesterId;
    }

    public void setRequesterId(String requesterId) {
        this.requesterId = requesterId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getStartingMoneyCents() {
        return startingMoneyCents;
    }

    public void setStartingMoneyCents(int startingMoneyCents) {
        this.startingMoneyCents = startingMoneyCents;
    }
}

