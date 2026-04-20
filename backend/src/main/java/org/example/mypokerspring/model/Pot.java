package org.example.mypokerspring.model;
import java.util.HashSet;
import java.util.Set;

public class Pot {
    private int potTotalCents;
    private Set<User> contributors;
    private Set<User> eligiblePlayers;

    public Pot() {
        this.contributors = new HashSet<>();
        this.eligiblePlayers = new HashSet<>();
    }

    public void addContribution(User player, int amountCents, boolean isEligible) {
        potTotalCents += amountCents;
        contributors.add(player);
        if (isEligible) {
            eligiblePlayers.add(player);
        }
    }

    public boolean isEligible (User winner){
        return eligiblePlayers.contains(winner);
    }

    public double getPotTotal() {
        return MoneyUtils.centsToDollars(potTotalCents);
    }

    public int getPotTotalCents() {
        return potTotalCents;
    }

    public Set<User> getContributors() {
        return contributors;
    }

    public Set<User> getEligiblePlayers() {
        return eligiblePlayers;
    }
}