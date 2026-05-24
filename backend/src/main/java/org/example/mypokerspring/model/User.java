package org.example.mypokerspring.model;
public class User {

    private String name;
    private int moneyCents; // Store money in cents as integer
    private int boughtMoneyCents;

    public User(String name, int startingMoneyCents) {
        this.name = name;
        this.moneyCents = startingMoneyCents;
    }

    public String getName() {
        return name;
    }

    public void add(int winningsCents){
        moneyCents += winningsCents;
    }

    public void bet(int betCents){
        moneyCents -= betCents;
    }

    public boolean isAllIn(int betCents){
        return betCents == moneyCents;
    }

    public boolean canBet (int betCents){
        return moneyCents >= betCents;
    }

    public double getMoney() {
        return MoneyUtils.centsToDollars(moneyCents);
    }

    public int getMoneyCents() {
        return moneyCents;
    }

    public void setMoneyCents(int moneyCents) {
        this.moneyCents = moneyCents;
    }

    public int getBoughtMoneyCents() {
        return boughtMoneyCents;
    }

    public void setBoughtMoneyCents(int boughtMoneyCents) {
        this.boughtMoneyCents = boughtMoneyCents;
    }

    public void addBoughtMoneyCents(int cents) {
        this.boughtMoneyCents += cents;
    }

    @Override
    public String toString() {
        return name + ": " + MoneyUtils.formatCentsAsDollars(moneyCents);
    }
}
