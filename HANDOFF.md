# Handoff — Split Expenses

_Last updated: 2026-10-02 (night). Resume here. This file is the memory; read it first, then only the files it points to._

## Where things stand
- **Everything is pushed.** GitHub `main` = `6d47ed8`. Production (Vercel) is live through the install prompt (`c3f5946`).
- **Supabase prod:** migrations 046 to 052 applied (053, the "Never signed in" group, is written and tested but not yet applied) (049 to 052 are Usage Insights, applied 3 Oct 2026 through the SQL editor; 052 is the stuck users "never invited" fix); Edge Functions `admin-users`, `receipt-scan`, `parse-expense-text` deployed.
- **Shipped 2026-10-02:** member removal blocked with an unsettled balance (046), suspended users cut off at the DB + suspended screen with
  mailto link to admin (047), AI daily caps (30 scans / 100 parses) + throwaway-email blocklist (048), Cloudflare Turnstile on sign-up/sign-in/reset,
  welcome tour, main navigation (top menu, phone bottom tabs, Trips/Circles views, breadcrumbs), install prompt (owner confirmed on a real iPhone).
- Tests: 329 vitest, build OK, lint at baseline (20 warnings). Untracked and never touched: `marketing materials/`, `scratch/`, `upi-pay-link-fixes-2026-09-29.md`.

## Tomorrow (2026-10-03), in this order
1. **AT-09 + ATR-03** after ~00:55 UTC (trip) / ~01:21 UTC (expense) = ~06:55 AM IST. Items: trip `Live Test Delete` (archived 2026-09-03 00:55:30 UTC)
   and expense `Uber` (deleted 2026-09-03 01:21:43 UTC). Steps: Admin > Trips (Archived) and Trash must show "eligible for permanent deletion" and the bulk
   "Permanently delete N eligible" button; permanently delete ONLY those two, individually, after the owner confirms in chat (the bulk button would also take
   anything else eligible); confirm gone, no restore; record PASS in `test-cases-2026-09-29.md` and the Sheet (AT-09 row 184, ATR-03 row 189).
   Needs the owner's signed-in Chrome on `localhost:5183` (dev server `vite-dev` running). Per-row "Delete permanently" works at any age (spec note).
2. **Open Sprint 6** on the Jira-lite board with its goal, then run the **full regression sweep** (below).

## Tracking system (built 2026-10-02)
- **Test records:** `test-cases-2026-09-29.md` (authoritative, with Appendices) mirrored to the Google Sheet
  [1QHNnjMGCffXa4okRjHJXi9tn_WjywgLFrAwy6kiyZXk](https://docs.google.com/spreadsheets/d/1QHNnjMGCffXa4okRjHJXi9tn_WjywgLFrAwy6kiyZXk/edit), sheet `Cases`
  (A Section, B Ref, C Case, D Priority, E Status, F Evidence, **G Req**). New section 18 (NAV, TOUR, INST, SUSP, SIGN, CAP, AI) is at rows 242–252; a blank row sits at 241.
  Row formula for older cases: AU-n = 156+n, AT-n = 175+n, ATR-n = 186+n, CIRC-n = 45+n, ACT-n = 143+n. Keep md and Sheet in sync.
- **`BRD.md`:** 13 epics (EP-nn), 98 requirements (REQ-<epic>-nn), defect register (DEF-nnn, 40 bugs), sprint plan (section 11), release labels (section 12),
  Jira key index (section 10). Every test case maps to a REQ via the Sheet `Req` column. Rebuild helpers live in `jira/` (`build_jira.py`, `build_releases.py`).
- **`RELEASES.md`:** every push to `main` (60 so far) with the issues it first shipped. Label format `rel-<date>-<tip sha>`.
- **`TESTING-AGENT-BRIEF.md`:** what the testing agent can run vs what needs the owner or a phone.
- **Jira-lite board** (the owner's own app): `http://localhost:5173/board`, project **SplitExpenses (key SE)**. Code in `../Proj Mgmt Tool` (Docker compose; `docker compose up -d`),
  private GitHub repo `vakacherla/jira-lite` (`f7076fa`). 151 issues imported (SE-1..13 epics, SE-14..111 stories, SE-112..151 bugs), stories/bugs linked to epics.
  Sprints: **S0** core (2-4 Sep), **S1** 5-7 Sep, **S2** 13 Sep, **S3** 30 Sep, **S4** 1 Oct, **S5** 2 Oct (all closed), **S6** 3 Oct onward (planned: regression sweep,
  AT-09/ATR-03, settlement summary, amount calculator, DEF-025, DEF-026). Epic status rolls up from children (Done only when all children Done). Epics hidden from the
  Kanban board; Epics page `/epics`, Bugs page `/bugs`. Bug reporter defaults to **Ganesha - Testing Agent**; fixer on fixed bugs is **Vishwakarma - Fixer Agent**
  (both non-login viewer identities; script `backend/scripts/seed_testing_agent.py`).
- **Owner rule from 2026-10-02:** every new feature from now on is assigned to a sprint with a goal BEFORE it is built, gets a BRD `REQ` row and Sheet `Req`, and each push to
  prod gets its `rel-` label on the issues it ships. Memory note: `feedback_assign_features_to_sprints.md`.
- Browser/automation for the board: use the owner's real Chrome (new MCP tab shares its login). The Jira-lite backend is `localhost:8000`; its API token is in that tab's
  localStorage (`access_token`). Importing a file: serve it from a local CORS server and set the file input via `DataTransfer`.

## Regression sweep plan (tomorrow, after AT-09/ATR-03)
- **Agent runs:** RES-04, BAL-10, NAV-01..03, INST-02, TOUR-02, optional EXP-17/EXP-39 (see the brief).
- **Owner, real Chrome / two accounts / throwaway:** AUTH-02, AUTH-04, AUTH-06, AUTH-07, CIRC-04, AU-07, AU-16, AU-19, SEC-07, SIGN-01 (try a mailinator sign-up), SIGN-02, TOUR-01.
- **Owner, phone:** RES-01, BAL-09 (agent never taps payment links), BAL-11, BAL-14, BAL-15, BAL-16, ACT-06, OFF-11.
- **Blocked:** AUTH-11/13/14/15 (domain + email), BAL-12/13 (days must pass), RES-09 (needs a migration).
- Owner wants a single complete sweep across the app, so run it after the remaining items above.

## Standing rules (from the owner — do not skip)
1. **No fix is pushed until validated holistically:** grep every consumer, think about races/edge cases, run unit tests + build + lint (no new warnings), run the real flow,
   re-test related flows. Fix at the right layer (RLS/server), not UI masking.
2. **Ask before every production change:** `supabase db push`, functions deploy, git push (and pushes to the Jira-lite repo). Ship one roadmap item at a time:
   plan, build, verify live, commit, ask before push.
3. Test data prefix `E2E-TEST`; archive what you create. Deleting/archiving through the UI needs the owner's explicit OK in chat for the named items only.
4. Never enter credentials; the owner signs in. Turnstile blocks the built-in pane's sign-in; use the owner's Chrome (MCP tabs share its login) and an incognito window for a
   second identity. `127.0.0.1:5183` is a different origin from `localhost:5183`.
5. Keep context small; this file is the memory. Commit with the attribution line from the session reminder.

## Parked / owner to-dos
- **Domain** (owner buying ~2026-10-03/04): then verify it in Resend (SPF/DKIM), set Supabase Auth SMTP to Resend with `no-reply@<domain>`, turn Confirm email on, re-test sign-up, run
  AUTH-11/13/14/15. Create the `admin@<domain>` mailbox or change the default in `src/lib/suspension.js` (currently `admin@splitexpense.com`, or set `VITE_ADMIN_CONTACT_EMAIL`).
  Watch the Resend free tier (100/day).
- Owner: try a mailinator sign-up; sign out the incognito SU window; decide on the suspended `ThrowAway` account (vakacherla@comcast.net) — it cannot be deleted because its archived circle
  still references it (admin has no circle purge).
- Native store app: Capacitor wrapper (Apple developer account, review, retest push + UPI deep links on iOS).
- Epic-based reports and how to visualise them on the board (owner idea, later). Consider hosting Jira-lite later (frontend on Vercel needs its own backend + DB).

## Open findings (not fixed) — also in BRD section 6
1. **RES-09 / DEF-026 (P1):** a dropped connection mid-save leaves a phantom expense with no splits. Proposal: atomic `create_expense_with_splits` / `update_expense_with_splits`
   plpgsql functions and route the 6 call sites through them. Needs a migration + approval.
2. **DEF-025:** RLS still allows expense inserts into an archived trip.
3. DEF-036 inline create-circle does 3 non-atomic writes; DEF-031 admin has no circle purge; DEF-035 admin dropdowns list archived circles / trips the user is already in;
   DEF-028 iOS web push disappears after display (unconfirmed); DEF-030 offline sign-out only partly fixed.
4. Stale banner cache on same-extension replace; avatar upload has no `image/*` check; CSV export has no settlements; ~13 NOT-BUILT features (REC-03..07, 09, 10, 12, 13, FEAT-04).
5. Backlog: remove redundant "← Your trips" links on Rates/Help/Profile; admin signups-per-day tile and bulk suspend; cleanup job for old `ai_usage` rows; light-mode check of the new nav;
   confirm the Gemini API tier (`website-sync-notes.md`).
- **Planned feature (after verification): voice input** for the "describe it" box. Engine order: browser Web Speech API, then on-device STT in the mobile app, then Whisper, and only then paid
  options; keep it behind one small function.

## Test data on production
- Archived with owner OK: the E2E-TEST sweep trips/circles, the two-user and CIRC-08 fixtures. Test trip `E2E-TEST 047 write check` is not yet archived.
- Not archivable by Jayashree (not creator/manager): circle `E2E-TEST Circle 20260929-1055` and its trip, plus fixtures CSV Import Trip / Empty Trip. Needs an admin session.
- Accounts: Jayashree (non-admin test account), the owner (SU), `ThrowAway` (suspended).

## Gotchas
- Native `confirm()` is auto-cancelled by automation; override `window.confirm=()=>true`.
- Set React inputs via the native value setter + dispatch `input`. File inputs: `DataTransfer` + dispatch `change`. Offline sim: override `navigator.onLine` + `offline`/`online` events.
- Browser-pane viewport emulation resets between calls: measure responsive layout inside a same-origin `<iframe style="width:375px">`.
- `supabase db push`, functions deploy and `git push` need `dangerouslyDisableSandbox: true` (network); only after owner approval. Shell cannot write `~/.claude/projects/.../memory`; use the Write tool.
- The Jira-lite folder needed `request_directory` access; Docker commands must be run through the user's terminal tool (`mcp__terminal__run_in_terminal`, single-line).
- macOS `sed -i` needs a backup suffix; use python for edits. Background Chrome tabs freeze CDP calls: create a fresh MCP tab.
- Vercel deploy check: behavioural (e.g. archived-trip URL shows "not found") is more reliable than grepping bundles.

## Usage Insights notes (3 Oct 2026)

- Phase 1 (REQ-USE-01..09) is live: Admin → Usage, first-party tracking in `app_events` / `user_activity`. Design and mockups: https://claude.ai/artifact/2AjyRgZHFTwj1YTGGmy3re. Stories, definitions and where the build differs from them: `USAGE-INSIGHTS-STORIES.md`.
- **Supabase SQL editor pitfall:** it misreads the INTO form of select inside function bodies as creating a table and mangles the script ("unterminated dollar-quoted string"). Migrations from 049 onward fill variables with `x := (select ...)`; `src/lib/migrationsSqlEditor.test.js` fails the build if the pattern comes back. The editor also shows only the last statement's result, so run read-only checks one at a time.
- **Timezone lookups are slow:** never look a timezone up in `pg_timezone_names` per row (about 15 ms each; it made the funnel time out). Validate by using the zone, once per query (migration 051).
- The app tolerates a database that has not yet had 049 (`src/lib/profileFetch.js`), so app and migration can deploy in either order.
- Not built yet: REQ-USE-10 (feature adoption), 11, 12, 23 (devices), 24 (device filter); their data is already collected. Per-invite share links (REQ-INV-01) and email invites (REQ-INV-02, blocked on a verified Resend domain) are specified but not started. BRD section 7 item 7 asks whether REQ-INV-01 replaces REQ-TRIP-12 / REQ-GRO-01.
- Release label to apply on the board for REQ-USE-01..09: `rel-2026-10-03-24e35ae` (first push that delivered them; the date is UTC).
