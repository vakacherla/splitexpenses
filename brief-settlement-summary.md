# Brief for Claude Code — One-tap settlement summary (text)

**Goal:** a "Share summary" button on Balances that produces a WhatsApp-ready, plain-text list of who pays whom.
People settle in chat, outside the app; today the only copy/share path in settle-up is copying a recipient's payment handle.
**Effort:** small. **Priority:** quick win (independent of the growth stack).

## Verified starting point
- `BalancesPanel.jsx` already computes `transactions = simplifyDebts(net)` (from `src/lib/balances.js`) — the fewest-payments list.
- `formatMoney(amount, currency)` lives in `src/lib/fx.js` (handles zero-decimal currencies like JPY).
- `SettleUpModal.jsx` only copies a payment handle (`copyHandle`). No `navigator.share` anywhere for settlement.
- Balances are computed locally, so this works offline.

## Spec
1. **Pure helper** `buildSettlementSummary({ tripName, homeCurrency, transactions, membersMap, now })` → string. Example:
   ```
   Tokyo Week — who pays whom (as of 2 Oct 2026)
   Arjun pays Maya ¥12,400
   Priya pays Maya ¥6,200
   Amounts in JPY.
   via Split Expenses · splitexpenses-app.vercel.app
   ```
   - Use the word "pays" (not just arrows): readable in SMS/WhatsApp and by screen readers.
   - Home-currency amounts via `formatMoney`. Display names from `membersMap`; if two members share a display name, disambiguate (e.g. add an initial).
   - Nothing to settle → a short "Everyone's settled up" version instead of an empty list.
2. **Button** "Share summary" in the Balances header (shown whenever the trip has members). Use `navigator.share({ title, text })` where
   available; otherwise copy to clipboard and show a brief "Copied". Treat a cancelled share sheet (AbortError) as a non-error.
3. **Privacy:** the text goes only where the person who tapped sends it. **Do not include an invite code or any trip link** — it would
   travel wherever the text is pasted. The footer is the app URL only.
4. **Do not** include per-person payment deep links (UPI/Venmo/PayPal) — those are personal to each payer.
5. Optional: if the `growth_events` table from `growth-brief-join-link.md` exists, log a `summary_shared` event (no content). Otherwise skip.

## Tests
- Unit tests for `buildSettlementSummary`: normal multi-payment case, zero-decimal currency (JPY), settled-up case, duplicate display
  names, a very long trip name, one debtor owing several people.
- TESTING.md cases: iPhone Safari share sheet, Android Chrome share sheet, desktop clipboard fallback, offline.

## Out of scope (separate, later)
PDF/Excel trip summary (parked roadmap Priority 3), per-person private messages, read-only share link (Priority 2).
