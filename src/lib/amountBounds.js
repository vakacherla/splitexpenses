// Ceiling on any single amount entered anywhere in the app — an expense,
// a settle-up payment, an itemized line item, an exact-split share, a
// CSV-imported row. Every amount field already rejects <= 0; this catches
// the other direction (a fat-fingered extra zero or two) without blocking
// a genuinely large shared cost. One shared constant so the bound only
// ever needs adjusting in one place.
export const MAX_AMOUNT = 10_000_000

export function isAmountTooLarge(amount) {
  return Number.isFinite(amount) && amount > MAX_AMOUNT
}
