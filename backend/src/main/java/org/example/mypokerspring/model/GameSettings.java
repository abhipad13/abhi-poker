package org.example.mypokerspring.model;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public class GameSettings {
    private int smallBlindCents;
    private int bigBlindCents;
    private int defaultStartingMoneyCents;
    private Map<String, Integer> customStartingMoneyCents = new HashMap<>();
    private Map<String, Integer> chipValues;
    private static final Set<String> VALID_CHIP_COLORS = Set.of("white", "red", "green", "blue", "black");

    public GameSettings(int smallBlindCents, int bigBlindCents) {
        this.smallBlindCents = smallBlindCents;
        this.bigBlindCents = bigBlindCents;
    }

    public int getSmallBlindCents() {
        return smallBlindCents;
    }

    public int getBigBlindCents() {
        return bigBlindCents;
    }

    public Map<String, Integer> getChipValues() {
        return chipValues;
    }

    public void setChipValues(Map<String, Integer> chipValues) {
        if (chipValues == null || !VALID_CHIP_COLORS.equals(chipValues.keySet())) {
            throw new IllegalArgumentException("❌ All 5 standard chip colors (white, red, green, blue, black) must be provided.");
        }

        for (Integer value : chipValues.values()) {
            if (value == null || value <= 0) {
                throw new IllegalArgumentException("❌ All chip values must be positive integers.");
            }
        }

        this.chipValues = chipValues;
    }


    public int getDefaultStartingMoneyCents() {
        return defaultStartingMoneyCents;
    }

    public void setDefaultStartingMoneyCents(int defaultStartingMoneyCents) {
        this.defaultStartingMoneyCents = defaultStartingMoneyCents;
    }

    public Map<String, Integer> getCustomStartingMoneyCents() {
        return customStartingMoneyCents;
    }

    public void setCustomStartingMoneyCents(Map<String, Integer> customStartingMoneyCents) {
        this.customStartingMoneyCents = customStartingMoneyCents;
    }

    public void validate() {
        if (smallBlindCents <= 0)
            throw new IllegalArgumentException("❌ Small blind must be a positive amount.");
        if (bigBlindCents < smallBlindCents)
            throw new IllegalArgumentException("❌ Big blind must be >= small blind.");
        if (defaultStartingMoneyCents < bigBlindCents)
            throw new IllegalArgumentException("❌ Default starting stack must be >= big blind.");
        for (Map.Entry<String, Integer> e : customStartingMoneyCents.entrySet()) {
            if (e.getValue() == null || e.getValue() <= 0)
                throw new IllegalArgumentException(
                    "❌ Custom starting amount for '" + e.getKey() + "' must be positive.");
        }
    }
}
