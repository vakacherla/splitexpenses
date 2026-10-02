# Handoff — Split Expenses QA/fix session

_Last updated: 2026-10-02 (evening). Resume here; read only this file + the "Appendix R/Q/P/O" tail of
`test-cases-2026-09-29.md` for detail._

Record keeping: `test-cases-2026-09-29.md` (evidence-backed, authoritative) is mirrored to the
[Google Sheet](https://docs.google.com/spreadsheets/d/1QHNnjMGCffXa4okRjHJXi9tn_WjywgLFrAwy6kiyZXk/edit?gid=366923856)
(sheet `Cases`, columns E=Status, F=Evidence). Keep both in sync; reconcile if they drift (they did once).

## 2026-10-02 admin (SU) batch — done (details: Appendix S of test-cases)
PASS: AU-03/05/06/11/13/14/15/18, AT-02/03/06/08/11, ATR-02/05. AU-08 was a real bug (generic "Database error
deleting user") — fixed in `admin-users`, **deployed**, re-verified (f8cdde5, local only, not pushed).
Merged owner-supplied handoffs (commit after f8cdde5): `website-sync.patch` (home page "free forever", pricing
removed, Help `ai-and-data` section) + `roadmap-parked-priorities.patch`; tests 287/287, build OK, lint 20 = baseline.
Briefs committed as docs, NOT built: `brief-amount-calculator.md`, `brief-settlement-summary.md`.
Cleanup done: re-archived `P1 close` + `roadmap check (copy)` trips; deleted user `E2E Verify`.
**Tomorrow (2026-10-03, owner confirmed):** AT-09 + ATR-03 — oldest archived/trashed items (29 days on 10-02:
`Live Test Delete` trip, Sep-2 era) become purge-eligible; bulk "Permanently delete N eligible" button should
appear. Needs owner OK on which item to purge. Spec note: per-row "Delete permanently" works at any age.
Still open: AU-07 (needs user with only soft-deleted history, not a trip creator), AU-04/16/19 (need Jayashree
live session / non-SU), second-account cases, phone cases, inbox cases. Not pushed: everything since a5b64e1.
**Two-account batch (same day):** ACT-04/05, ATR-04, CIRC-08 PASS (Appendix T). FINDING FIXED (cc7159a + migration 046, applied to prod,
NOT pushed to git): removal with an unsettled balance is blocked in the DB for every path incl. admin; removed members
show as "Former member". AU-04 FIXED and VERIFIED on prod (migration 047 + admin-users + app): live session shows the suspended screen with an
email-the-admin link, DB refuses writes. `ThrowAway` (vakacherla@comcast.net) left suspended. Admin contact defaults to
admin@splitexpense.com. Pane/automation note: Turnstile blocks the agent's browser sign-in; use the owner's Chrome (new MCP tab
shares its login) and incognito for a second identity.
Test trip `E2E-TEST 047 write check` not yet archived. Two-user test data archived (owner OK). Chrome tab 454295720 = Jayashree (prod); built-in pane = SU account.
**Bot protection shipped (same day):** migration 048 + AI caps (30 scans / 100 parses per user per day) + throwaway-email
blocklist + Cloudflare Turnstile on signup/login/reset (Supabase CAPTCHA enforcement ON; works in real Chrome). Appendix V.
NOTE: the agent's embedded browser fails Turnstile, so it cannot sign in on prod any more (localhost pane sessions already
signed in still work). Owner TODO: try signup with a mailinator address (expect the friendly message); reload the suspended
`ThrowAway` Chrome tab to finish AU-04. Feedback backlog (owner): #3 first-time welcome cards + home "how to start" (next),
#2 navigation (bottom tabs / sidebar), #1 native app (install prompt first, Capacitor later).
**PARKED (owner buying a domain, ~2026-10-03/04 weekend):** re-enable email confirmation. Steps: verify the domain in Resend (SPF/DKIM DNS),
set Supabase Auth SMTP to Resend with a no-reply@<domain> sender, then turn "Confirm email" on, re-test signup, and run the
inbox-dependent cases (AUTH-11, AUTH-13/14/15). Also: the suspended-screen contact defaults to admin@splitexpense.com in
src/lib/suspension.js, so create that mailbox on the new domain or change the default / set VITE_ADMIN_CONTACT_EMAIL. Watch the
Resend free tier (100/day). Until then CAPTCHA + email blocklist + AI caps are the protection.
**Welcome tour built (feedback #3), committed locally, NOT pushed:** 4 illustrated cards on the dashboard for brand-new accounts
(no trips/circles), Skip/Back/Next, last card = Create my first Trip / Join with a code; replay via Help > "Replay the welcome tour";
"Show this tour every time I open the app" checkbox (per user, localStorage; default = first time only) + a "Show the welcome tour"
link on the dashboard so users needn't use Help; home page "Where do I start?" strip; dashboard Circles blurb reworded ("New here? Start with a Trip"). Verified in the pane (light,
dark, mobile width, replay, CTA, dismissal; 308 tests, build, lint baseline). NOT yet seen as a real first-run: the suspended
`ThrowAway` account is brand new, so unsuspend it and sign in once to see the tour automatically. NOTE: the dev server
(vite-dev) must be running for localhost checks; it had stopped earlier.
**Navigation built (feedback #2), committed locally, NOT pushed:** labeled top-bar menu (Trips/Circles/Rates/Help + Admin/Profile) on desktop,
fixed bottom tab bar on phones (md:hidden, pb-20 on the shell, add-expense FAB lifted), dashboard split into Trips (all trips, with a circle
label) and Circles (`/dashboard?view=circles`), breadcrumbs on trip/circle pages (Trips > Trip or Circles > Circle > Trip), nav hidden for
suspended users. Logic in src/lib/navItems.js (tested). Verified in real Chrome on localhost (desktop dark, circles view, breadcrumb, phone-width
iframe). NEXT (owner request): install prompt (Add to Home Screen / PWA install, iOS instructions), then store-wrapper later. localhost is now
in the Cloudflare Turnstile hostnames, so owner sign-in works on localhost in Chrome (the built-in pane still fails Turnstile).
**Install prompt built (feedback #1, step 1), committed locally, NOT pushed:** `beforeinstallprompt` captured at startup (src/lib/installPrompt.js,
tested); dashboard banner (one-tap Install on Android/desktop Chrome/Edge; "Show me how" 3-step Share > Add to Home Screen card on iPhone/iPad,
with a Safari fallback note for Chrome/Firefox/Edge on iOS); "Not now" hides it for 14 days (per device); never shown if already installed or on
a first visit/over the welcome tour; permanent "Install the app" card on Profile and Help. Verified in real desktop Chrome (native banner),
iOS path via UA override, dismissal + reload. NOT verified on a real iPhone/Android device. iOS cannot trigger an install programmatically.
NEXT for native-store users: Capacitor wrapper (separate project: Apple developer account, review, retest push + UPI deep links on iOS).
Small UX nits: admin Circle dropdown lists archived circles; "Add to a trip" still offers trips user is in.

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

## Pushed + live (a5b64e1): TRIP-19 image downscale (banner path verified on prod), RES-10 keyed FX rate
Avatar upload + SettleUpModal not exercised live.

## Committed locally, NOT pushed
- `cd00527`: `src/lib/imageResize.js` (+tests; 284/284 pass) downscales banner/avatar uploads (TRIP-19).
  Verified live on trip banner (14.1MB -> 1.5MB). **Still to verify before push: avatar upload live**
  (changes the shared account avatar — ask first) and consumers. Then ask to push.

- `<next commit>`: RES-10 fix — `useLiveRate` keyed rate (stale rate 1.0 saved EUR as USD when FX down) +
  accurate Save-blocked message (287/287 tests). Verified live; SettleUpModal (same hook) not exercised live.

## Test data on production
- Archived 2026-10-02 (owner OK): `E2E-TEST P1 sweep trip` + `E2E-TEST P1 sweep circle`, CIRC-14 trip/circle,
  duplicate-trip copy. Orphan storage objects (banner.jpg/png) remain in banners buckets; harmless.
- Not archivable by Jayashree (not creator/manager): circle `E2E-TEST Circle 20260929-1055` (17c3af0a-...) and its
  trip `E2E-TEST Circle Trip 20260929-1055` (46f95bfc-...), plus fixtures CSV Import Trip / Empty Trip. Needs the
  owner or an admin session (tomorrow).

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
