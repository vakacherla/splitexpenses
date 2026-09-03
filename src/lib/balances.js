// All balance math happens in a group's home currency, using the
// home-currency amounts that were computed (and locked in) at the moment
// each expense or settlement was recorded — so historical balances never
// shift just because today's exchange rate moved.

const EPSILON = 0.01

// members: [{ user_id }]
// expenses: [{ paid_by, amount_in_home, expense_splits: [{ user_id, share_in_home }] }]
// settlements: [{ from_user, to_user, amount_in_home }]
// Returns Map(user_id -> net balance). Positive = owed to them. Negative = they owe.
export function computeNetBalances(members, expenses, settlements) {
  const net = new Map(members.map((m) => [m.user_id, 0]))

  for (const expense of expenses) {
    net.set(expense.paid_by, (net.get(expense.paid_by) ?? 0) + expense.amount_in_home)
    for (const split of expense.expense_splits) {
      net.set(split.user_id, (net.get(split.user_id) ?? 0) - split.share_in_home)
    }
  }

  for (const s of settlements) {
    net.set(s.from_user, (net.get(s.from_user) ?? 0) + s.amount_in_home)
    net.set(s.to_user, (net.get(s.to_user) ?? 0) - s.amount_in_home)
  }

  return net
}

// Turns net balances into the smallest set of payments that settles everyone
// up, by repeatedly matching the largest creditor with the largest debtor.
export function simplifyDebts(netBalances) {
  const creditors = []
  const debtors = []

  for (const [userId, amount] of netBalances) {
    if (amount > EPSILON) creditors.push({ userId, amount })
    else if (amount < -EPSILON) debtors.push({ userId, amount: -amount })
  }

  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const transactions = []
  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]
    const amount = Math.min(debtor.amount, creditor.amount)

    if (amount > EPSILON) {
      transactions.push({ from: debtor.userId, to: creditor.userId, amount })
    }

    debtor.amount -= amount
    creditor.amount -= amount

    if (debtor.amount <= EPSILON) i += 1
    if (creditor.amount <= EPSILON) j += 1
  }

  return transactions
}
