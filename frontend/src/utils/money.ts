export const toCents = (dollarsLike: string | number) => {
  const n = typeof dollarsLike === "number" ? dollarsLike : parseFloat(dollarsLike || "0");
  return Math.round(n * 100);
};

export const fromCents = (cents: number | undefined | null) =>
  ((cents ?? 0) / 100).toFixed(2);
