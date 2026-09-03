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

// Divides `amount` across `participantIds` proportionally to each person's
// `subtotals` share (falling back to an even split if nobody has any
// subtotal yet), using the same largest-remainder method as
// splitByPercentages so the result always sums to exactly `amount`.
function splitProportionally(amount, participantIds, subtotals, subtotalTotal) {
  if (amount <= 0) return Object.fromEntries(participantIds.map((id) => [id, 0]))
  const hasSubtotals = subtotalTotal > 0
  const weights = participantIds.map((id) =>
    hasSubtotals ? subtotals[id] / subtotalTotal : 1 / participantIds.length
  )
  const shares = splitByPercentages(
    amount,
    weights.map((w) => w * 100)
  )
  return Object.fromEntries(participantIds.map((id, i) => [id, shares[i]]))
}

// Splits an itemized bill across participants: each item's price is
// divided evenly among whoever it's assigned to (splitEvenly, so rounding
// leftovers land the same fair way as the equal-split mode). Tax and tip
// are then each layered on top separately, both divided proportionally to
// each person's item subtotal — the standard itemized-split convention,
// since someone who ordered more should also owe more of a
// percentage-based tax or tip. Kept as two separate proportional passes
// (rather than combining them into one lump sum first) so they can be
// shown back to the group as distinct lines, e.g. in case tax and tip
// ever need different treatment later. If nobody has any item subtotal
// yet, both fall back to splitting evenly across all participantIds.
//
// `items` is [{ amount: number, participantIds: string[] }, ...]. Returns
// { shares: { [userId]: number }, total: number } with shares summing to
// exactly `total` (to the cent).
export function splitItemized(items, participantIds, tax = 0, tip = 0) {
  const subtotals = Object.fromEntries(participantIds.map((id) => [id, 0]))

  for (const item of items) {
    const assignees = item.participantIds.filter((id) => id in subtotals)
    if (assignees.length === 0) continue
    const perPerson = splitEvenly(item.amount, assignees.length)
    assignees.forEach((id, i) => {
      subtotals[id] = Math.round((subtotals[id] + perPerson[i]) * 100) / 100
    })
  }

  const itemTotal = Object.values(subtotals).reduce((sum, v) => sum + v, 0)
  const grandTotal = Math.round((itemTotal + tax + tip) * 100) / 100

  const taxShares = splitProportionally(tax, participantIds, subtotals, itemTotal)
  const tipShares = splitProportionally(tip, participantIds, subtotals, itemTotal)

  const shares = Object.fromEntries(
    participantIds.map((id) => [
      id,
      Math.round((subtotals[id] + taxShares[id] + tipShares[id]) * 100) / 100,
    ])
  )

  return { shares, total: grandTotal }
}
