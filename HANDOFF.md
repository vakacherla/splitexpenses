# Handoff — Split Expenses QA/fix session

_Last updated: 2026-10-01 (late). Resume here; read only this file + the "Appendix R/Q/P/O" tail of
`test-cases-2026-09-29.md` for detail._

Record keeping: `test-cases-2026-09-29.md` (evidence-backed, authoritative) is mirrored to the
[Google Sheet](https://docs.google.com/spreadsheets/d/1QHNnjMGCffXa4okRjHJXi9tn_WjywgLFrAwy6kiyZXk/edit?gid=366923856)
(sheet `Cases`, columns E=Status, F=Evidence). Keep both in sync; reconcile if they drift (they did once).

## Standing rules (from the owner — do not skip)
1. **No fix is pushed until validated holistically**: grep every consumer of what changed, think about
   races/edge cases, run unit tests + build + lint (no new warnings), run the real flow against the real
   backend (local dev server `npm run dev` via launch.json `vite-dev`), re-test related flows. "Band-aid on
   band-aid" is explicitly unwanted. Prefer fixing at the right layer (RLS/server) over UI masking.
2. Confirm with the owner before any `supabase db push` / functions deploy / git push. Ship batched, verified.
3. Test data: prefix `E2E-TEST`. Clean up (archive) what you create. Deleting a trip/circle through the UI
   needs the owner's explicit OK in chat (the harness classifier blocks it otherwise).
4. Never enter credentials; the owner signs in. Jayashree (test account, non-admin) is signed in at
   `https://splitexpenses-app.vercel.app` in Chrome (tabId 454295707) and at `http://localhost:5183` in the
   built-in browser pane (tab-1). `127.0.0.1:5183` is a different origin = logged-out view.
5. Owner's token budget matters: keep context small; this file is the memory.

## Pushed + live on production (as of 2cf0fa8 / 1d4142b)
AT-07 (trip archive), TRIP-22 (archived trip = not found), homepage Sign-in link on mobile, RES-02 overflow
fixes (trip tab strip, Navbar, Profile), migration 045 (circle archive) + guards. All re-verified live.

## Committed locally, NOT pushed
- `cd00527`: `src/lib/imageResize.js` (+tests; 284/284 pass) downscales banner/avatar uploads (TRIP-19).
  Verified live on trip banner (14.1MB -> 1.5MB). **Still to verify before push: avatar upload live**
  (changes the shared account avatar — ask first) and consumers. Then ask to push.

## Test data currently on production (archive when told OK)
- Trip `E2E-TEST P1 sweep trip` 32ddaebf-13de-48b2-8c3b-b42fc74cd7b6
- Circle `E2E-TEST P1 sweep circle` 97f0d561-012a-4814-b6e6-2d85933e256c (trip attached)
- Older: $5 expense inside already-archived copy trip (unreachable; harmless).

## Open findings (not fixed) — need a design/approval
1. **RES-09 (P1, data integrity)**: expense create/edit = two writes; a connection drop leaves a phantom
   expense with no splits and wrong balances. Proposal: atomic `create_expense_with_splits` /
   `update_expense_with_splits` plpgsql functions, route the 6 call sites (AddExpenseForm create+edit,
   offlineQueue create+update, ImportCsvModal) through them. Needs migration + db push approval.
2. TRIP-22 server gap: RLS still allows expense inserts into an archived trip.
3. CIRC-14: inline create-circle does 3 non-atomic writes (orphan/duplicate on partial failure).
4. STALE-BANNER: same-extension banner replace keeps same cached URL (1h) -> old image shown.
5. AVATAR-TYPE: avatar upload has no `image/*` check.
6. CSV-15: export has no settlements (product gap). Nine P1 features NOT-BUILT (REC-03..07, 09, 10, 12, FEAT-04).

## What I can still do alone (next)
RES-04 (laptop-width layout), RES-10 (FX slow/down), SEC-07 remaining, BAL-10 live (needs a debt to a
no-handle member), verify avatar path of TRIP-19, then bundle fixes for findings 4/5 as a reviewed change.

## Needs the owner (planned for tomorrow morning)
- Second normal account: AUTH-06, AUTH-07, CIRC-04, CIRC-08, ACT-04, ACT-05, ATR-04, AUTH-02, AUTH-04 (last; needs sign-out).
- Platform-admin login (or owner runs steps): AU-03..08, AU-11, AU-13..16, AU-18, AU-19, AT-02, AT-03, AT-06, AT-08,
  AT-11, ATR-02, ATR-05; AT-09/ATR-03 also need 30-day wait or back-dated rows.
- Inbox: AUTH-11/13/14/15. Real phone + notifications: RES-01, BAL-09, BAL-11..15, ACT-06.
- Owner end-of-day goal: close all BLOCKED, run all NOT RUN.

## Planned feature (after verification): voice input for "describe it" box
Mic button -> text in the existing box; `parse-expense-text` already matches member names/nicknames (not
emails). Engine order: browser Web Speech API (free) -> on-device STT in the mobile app -> Whisper (free) ->
ElevenLabs / 1min.ai / Muse only if free options fail. Keep engine behind one small function. Test name
accuracy ("Maya, Jon, and me", Ana/Anna).

## Gotchas
- Native `confirm()` is auto-cancelled by automation; override `window.confirm=()=>true` for test-row deletes.
- Set React inputs via native value setter + dispatch `input`. File inputs: build a canvas blob, `DataTransfer`,
  dispatch `change`. Offline sim: `Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false})` +
  `offline`/`online` events; hard reload resets it.
- Browser-pane viewport emulation resets between calls: measure responsive layout inside a same-origin
  `<iframe style="width:375px">` instead.
- `supabase db push` / `git push` need `dangerouslyDisableSandbox: true` (network); only after owner approval.
- macOS `sed -i` needs a backup suffix; use python for edits.
- Vercel deploy check: behavioral (e.g., archived-trip URL shows "not found") is more reliable than grepping bundles.
