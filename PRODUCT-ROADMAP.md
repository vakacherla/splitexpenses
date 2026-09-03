# Product roadmap: closing the gap with Splitwise & Venmo

Researched via current (2026) coverage of both apps' actual feature sets
and pricing, not assumptions. Written as a product owner would: honest
about what's genuinely worth building here, and explicit about what to
deliberately skip and why.

## The one strategic call that shapes everything else

**Splitwise is a ledger. Venmo is a wallet.** Splitwise tracks who owes
whom and stops there — settling up means tapping out to Venmo, PayPal, or
cash. Venmo actually moves money, and that's *why* it exists as a company:
holding balances, transferring funds, and settling instantly is a
regulated money-transmission business — licensing per US state, KYC/AML
checks, PCI compliance for cards. That's a different company, not a
feature.

**This app should stay a ledger and get better at being one.** The
Venmo-shaped gap to close isn't "move money" — it's "make settling up one
tap away," by deep-linking to whatever payment app the group already
uses (UPI apps for INR groups, Venmo/PayPal/Zelle for USD ones) with the
amount pre-filled. Same pattern Splitwise itself uses. That's a
few-hours feature, not a compliance program.

## Where this app already beats what people pay for

Worth knowing, since it's easy to only see gaps: Splitwise's free tier
now caps you at roughly 3 new expenses a day and shows ads. Multi-currency
conversion, spending charts, and receipt scanning are all locked behind
Splitwise Pro ($59.99/year). This app already has percentage/exact
splits, live multi-currency conversion, and a category reporting
dashboard with charts — free, no cap, no ads, because there's no business
model forcing a paywall. Data portability is also a genuine
differentiator: it's your own Postgres database, exportable with a SQL
query any time, not locked in a vendor's export button.

## Feature comparison

| Capability | This app | Splitwise (free) | Splitwise Pro | Venmo |
|---|---|---|---|---|
| Equal / percentage / exact splits | Strong | Strong | Strong | Weak (basic request-split only) |
| Multi-currency, live rates | Strong | Weak (Pro-only conversion) | Strong | Absent |
| Debt simplification | Strong | Strong | Strong | Absent |
| Category reports/charts | Strong | Absent | Strong | Absent |
| Recurring expenses | **Absent** | Strong | Strong | Adequate (recurring *payments*, not shared splits) |
| Receipt scanning (OCR) | **Absent** | Absent | Strong | Absent |
| Itemized bill splitting | **Absent** | Weak | Strong | Absent |
| Search/filter expenses | **Absent** | Weak | Strong | Adequate |
| Default/saved split settings | **Absent** | Absent | Strong | Absent |
| Data export | **Absent** (manual SQL) | Weak | Strong | Absent |
| Settle-up payment deep link | **Absent** | Adequate | Adequate | N/A (it *is* the payment) |
| Actually moves money | Not applicable | Absent | Absent | Strong |
| Offline mode | **Absent** | Strong | Strong | Absent |
| Push notifications / activity feed | **Absent** | Adequate | Adequate | Strong |
| Comments/notes on an expense | **Absent** | Weak | Weak | Strong (its whole social layer) |
| Multi-group platform admin | Strong | Absent | Absent | Absent |
| No daily limits, no ads | Strong | **Absent** | Strong | Strong |

## Now / Next / Later

### Now — quick wins (high value, low effort, no new infrastructure)

- ✅ **Shipped.** Settle-up payment deep link (UPI/Venmo/PayPal, pre-filled
  amount, gated on the recipient adding their handle), search/filter on
  the Ledger, a saveable default split per group, CSV export, and notes
  on an expense. See the README for how each works.
- **A lightweight recurring-expense helper.** Not full automation yet —
  just a "duplicate this expense" action that pre-fills last month's rent
  or utility bill so it's a 10-second re-entry instead of a fresh form.
  Still open.

### Next — real features, real effort, still clearly worth it

- **Push notifications / activity feed.** "Someone added an expense" or
  "you were asked to settle up" is what makes an ongoing group actually
  stay current instead of going stale between trips. Needs a service
  worker, Web Push subscriptions, and a Supabase Edge Function trigger —
  a proper feature, not an afternoon. Still open.
- ✅ **Shipped** — receipt photo capture + AI extraction, via the optional
  `receipt-scan` Edge Function (Supabase Storage for the photo, Gemini
  2.5 Flash as the free primary provider with Qwen2.5-VL-72B as an
  automatic paid fallback for receipts Gemini can't read). Line-item
  itemization (assigning individual receipt items to specific people,
  rather than the whole receipt to one category) is the one piece of the
  original idea not built — worth a follow-up if restaurant splits are
  common enough to justify it.
- **True offline mode.** Add an expense with no signal, sync when
  connectivity returns. Requires a service worker, local write queue,
  and conflict handling for concurrent edits — a genuine architecture
  change, not a toggle. Worth it if this app is regularly used somewhere
  with patchy connectivity (which, given the pilgrimage-trip use case,
  is plausible) — otherwise lower priority than it looks. Still open.
- **CSV bulk-import.** The real intent: someone's already tracking a
  group's expenses in a spreadsheet and wants to bring the backlog in at
  once instead of re-entering every row by hand — not a general-purpose
  data pipe. Worth building, but only scoped tightly, since a bad bulk
  import (wrong person, wrong currency, a silently skipped row) is much
  harder to trust than one bad manual entry: CSV only, a strict template
  matching this app's own export shape (no column-guessing), exact email
  matching for who paid and who's in the split (never fuzzy name
  matching), a mandatory preview of exactly what will be created before
  anything touches the database, and every import tagged so a bad one
  can be undone in one click rather than row by row. Still open —
  revisit when there's an actual spreadsheet to bring in, not before.

### Deliberately not doing — and why

- **Auto-creating a Google Sheet in someone's Drive.** CSV export
  already gets the data out in a format Sheets opens natively — this
  would mean standing up real Google OAuth (a Cloud project, consent
  screens, token storage and refresh, a new Edge Function to hold the
  credentials) for a benefit ("drag the CSV into Drive" becomes
  automatic) that isn't worth that much new infrastructure.

- **Actually transferring money (Venmo's core business).** Money
  transmission licensing, KYC/AML obligations, PCI compliance for card
  handling. This is a multi-million-dollar regulatory undertaking for a
  company, not a feature for a personal project. The settle-up deep link
  above gets ~90% of the user-facing benefit with none of the liability.
- **Bank/card transaction auto-import.** Splitwise Pro's version of this
  uses Plaid-style bank integrations (US-only even for them) — expensive
  third-party contracts and real compliance surface, for a benefit
  (auto-detecting expenses) that matters more to someone tracking solo
  spending than to a small trusted group entering shared costs
  deliberately.
- **A public/social activity feed.** Venmo's default-public payment feed
  is one of its most consistently criticized design choices — people
  regularly get surprised their transactions were visible to strangers.
  This app is for trusted family/friend groups handling real financial
  detail; more privacy than Venmo, not less, is the right default here.
- **Business/merchant payment profiles.** Not relevant to peer expense
  splitting.

## If you want to pick a starting point

The "Now" list is roughly a day or two of work total and doesn't touch
infrastructure. The settle-up deep link is the best single next thing to
build — it's the most visible "this feels like a real app now" moment for
the least amount of code.
