# Website ↔ deck sync — changes for Claude Code to merge

**Decision (confirmed by Ram):** the free core is free **forever**. A paid "Plus" tier is only a future
possibility, once the community reaches a few thousand users, and it would only ADD extras — nothing in the
free core moves behind it. No payment gateway exists, so no prices or billing UI should appear anywhere.

## How to apply
`website-sync.patch` is a `git diff` against `main` (files: `src/pages/Overview.jsx`, `src/lib/helpContent.jsx`).
It applies cleanly to a fresh clone. If you have other uncommitted work touching these files, use
`git apply --3way website-sync.patch` or hand-merge using the list below.
Before pushing: `npm test` (needs a placeholder `.env` for `offlineQueue.test.js` — pre-existing), `npm run build`.
Verified here: 177/177 tests pass, build succeeds, home page renders correctly.

## What changed (Overview.jsx — the public home page)
1. Hero checklist: "Free during early access" → "Free forever, no ads".
2. Showcase bullets: "Included free during early access" (x2) → "Included in the free plan".
3. "Live conversion" / "live rates" / "live conversion" (x3) → "daily ECB rates" (ECB publishes once per business day).
4. "Why people switch" cards (now exactly six, matching the deck): any currency, typed sentence, **Works with no signal (new)**,
   Circles, **Fewest payments to settle up** (merges debt simplification + settle links; "one-tap" wording removed), data portable.
5. "Your data, portable": removed "or query the raw database directly" (users cannot do this); added all-or-nothing import + one-click undo.
6. "What's included": heading → "Everything here is free."; removed the "Plus goes further" copy; the ◆ (Plus) column is now ✓ (free);
   removed the "Plus — free during early access" legend.
7. Splitwise comparison: banner "Nothing gated during early access" → "Nothing gated"; row label → "daily ECB rates";
   footnote "current as of 2026" → "as of September 2026" (matches the deck's source date).
8. Pricing section replaced: removed the USD/INR toggle, the Plus card ($24.99 / ₹999), the "early-access price locked for life" banner,
   and the India pricing note. New section: "The whole core ledger is free." + one Free card + a short, price-free note that an optional Plus
   might come only once the community is a few thousand strong. Removed the now-unused `region` state.
9. Footer CTA: "Start free. Keep early-access pricing for life." → "Start free. The core stays free forever."
10. Example sentence: "…split with Jayashree" → "…split with Priya and Tom" (mix of Indian and foreign names, as the deck now uses: Maya, Arjun, Priya, Riku, Meera).

## What changed (helpContent.jsx — in-app Help)
11. New section `ai-and-data` ("AI features & your data"): receipt photo → Google Gemini (fallback: Qwen via OpenRouter); typed sentence +
    trip member names + home currency + today's date → same providers; only when the user taps; nothing else is sent; providers process under their
    own terms; exchange-rate lookups send only a currency pair and a date to Frankfurter; no ads / no data selling. Mirrors deck slide 14.

## Decided by Ram — leave as is for now
- **Settle-up links:** home page step 3 ("Settle with one tap … jump straight into UPI, Venmo, or PayPal") is KEPT for now.
  UPI links have never worked on iOS; Ram is looking for a fix and will remove or soften the wording later if none is found.
- **Hero/tagline:** the site hero is good as is; the deck keeps its own "Split expenses. Keep the good part." tagline.

## Worth checking
- Confirm which Gemini API tier the key uses. Free-tier and paid-tier data-use terms differ; the Help copy says "under their own terms"
  but Ram may want it stated more precisely.
- There is still no standalone Privacy / Terms page; the Help section is the only disclosure.
