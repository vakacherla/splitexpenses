// Distributes `total` across `n` shares as equal as possible, rounded to
// cents, with any leftover cent(s) from rounding assigned to the first
// participants so the shares always sum back to exactly `total`.
export function splitEvenly(total, n) {
  if (n <= 0) return []
  const base = Math.floor((total / n) * 100) / 100
  const shares = new Array(n).fill(base)
  const distributed = Math.round(base * n * 100)
  let remainder = Math.round(total * 100) - distributed
  let i = 0
  while (remainder > 0) {
    shares[i % n] = Math.round((shares[i % n] + 0.01) * 100) / 100
    remainder -= 1
    i += 1
  }
  return shares
}

// Splits `total` by a list of percentages using the largest-remainder
// method: each share is floored to the cent, then any leftover cents (from
// rounding) go to the shares with the biggest fractional remainder first.
// This distributes rounding error more fairly than always favoring the
// first participant, which matters more here since percentage shares are
// rarely equal. Percentages are expected to sum to ~100; the caller is
// responsible for validating that before calling this.
export function splitByPercentages(total, percentages) {
  const totalCents = Math.round(total * 100)
  const raw = percentages.map((p) => (total * p) / 100)
  const cents = raw.map((r) => Math.floor(r * 100))
  let allocated = cents.reduce((sum, c) => sum + c, 0)
  let remainder = totalCents - allocated

  const byRemainder = raw
    .map((r, i) => ({ i, frac: r * 100 - cents[i] }))
    .sort((a, b) => b.frac - a.frac)

  let idx = 0
  while (remainder > 0 && byRemainder.length > 0) {
    cents[byRemainder[idx % byRemainder.length].i] += 1
    remainder -= 1
    idx += 1
  }

  return cents.map((c) => c / 100)
}
