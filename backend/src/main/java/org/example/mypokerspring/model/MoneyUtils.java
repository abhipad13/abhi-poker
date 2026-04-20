package org.example.mypokerspring.model;
public class MoneyUtils {

    /**
     * Convert dollars to cents (integer)
     * @param dollars amount in dollars
     * @return amount in cents
     */
    public static int dollarsToCents(double dollars) {
        return (int) Math.round(dollars * 100);
    }

    /**
     * Convert cents to dollars (double for display purposes)
     * @param cents amount in cents
     * @return amount in dollars
     */
    public static double centsToDollars(int cents) {
        return cents / 100.0;
    }

    /**
     * Format cents as a dollar string
     * @param cents amount in cents
     * @return formatted dollar string
     */
    public static String formatCentsAsDollars(int cents) {
        return String.format("%.2f", centsToDollars(cents));
    }
}