// One-tap settlement summary (REQ-BAL-08): the plain-text "who pays whom" list
// people paste into a group chat. Pure and offline: it only formats what the
// Balances screen already computed.
//
// Privacy rules this file keeps (brief-settlement-summary.md):
//  - no invite code and no trip link: the text goes wherever it is pasted, so the
//    footer is the app's address only;
//  - no per-person payment links (UPI, Venmo, PayPal): those are personal;
//  - real display names for everyone, never "You": the reader is somebody else.

import { formatMoney } from './fx'

const MAX_TITLE = 60

const dateText = (now) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

const shortTitle = (name) => {
  const clean = String(name ?? '').trim() || 'Trip'
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1).trimEnd()}…` : clean
}

// userId -> the name to print. Two members who share a name get a number in
// member order ("Priya (1)", "Priya (2)"), the same number on every line, so the
// reader can tell them apart. Someone who has left shows as "Former member".
export function summaryNames(members) {
  const label = (m) => String(m.display_name ?? '').trim() || 'Someone'
  const counts = new Map()
  for (const m of members) counts.set(label(m).toLowerCase(), (counts.get(label(m).toLowerCase()) ?? 0) + 1)
  const seen = new Map()
  const names = new Map()
  for (const m of members) {
    const base = label(m)
    const key = base.toLowerCase()
    if (counts.get(key) > 1) {
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      names.set(m.user_id, `${base} (${n})`)
    } else {
      names.set(m.user_id, base)
    }
  }
  return names
}

// transactions: [{ from, to, amount }] from simplifyDebts, in the home currency.
export function buildSettlementSummary({
  tripName,
  homeCurrency,
  transactions,
  members,
  now = new Date(),
  appUrl = '',
  format = formatMoney,
}) {
  const names = summaryNames(members ?? [])
  const nameOf = (id) => names.get(id) ?? 'Former member'
  const title = shortTitle(tripName)
  const when = dateText(now)
  const footer = appUrl ? `via Split Expenses · ${appUrl}` : 'via Split Expenses'

  if (!transactions || transactions.length === 0) {
    return [`${title} — everyone's settled up (as of ${when})`, footer].join('\n')
  }

  return [
    `${title} — who pays whom (as of ${when})`,
    ...transactions.map((t) => `${nameOf(t.from)} pays ${nameOf(t.to)} ${format(t.amount, homeCurrency)}`),
    `Amounts in ${homeCurrency}.`,
    footer,
  ].join('\n')
}
