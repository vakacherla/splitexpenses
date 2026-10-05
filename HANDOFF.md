# Handoff — Split Expenses

_Last updated: 2026-10-02 (night). Resume here. This file is the memory; read it first, then only the files it points to._

## Where things stand
- **Everything is pushed.** GitHub `main` = `6d47ed8`. Production (Vercel) is live through the install prompt (`c3f5946`).
- **Supabase prod:** migrations 046 to 054 applied (049 to 054 are Usage Insights and invite links, applied 3 Oct 2026 through the SQL editor; 052 is the stuck-users "never invited" fix, 053 the "Never signed in" group, 054 the invite-link functions, applied from `supabase/editor-parts` after the editor stopped partway through the full file); Edge Functions `admin-users`, `receipt-scan`, `parse-expense-text` deployed.
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
  private GitHub repo `vakacherla/jira-lite` (`f7076fa`). 172 issues (SE-1..13 epics, SE-14..111 stories, SE-112..151 bugs, SE-152 epic EP-14 and SE-153..172 usage/invite stories), stories/bugs linked to epics.
  Sprints: **S0** core (2-4 Sep), **S1** 5-7 Sep, **S2** 13 Sep, **S3** 30 Sep, **S4** 1 Oct, **S5** 2 Oct, **S8** 3 Oct (usage insights phase 2, ACTIVE, SE-162..166), **S7** 3 Oct (usage insights + invite links; 11 issues, all closed), **S6** 3 Oct onward (planned: regression sweep,
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
- **Blocked:** AUTH-11/13/14/15 (domain + email), BAL-12/13 (days must pass), RES-09 (migration 055 applied 3 Oct 2026; now PARTIAL, see DEF-038).
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
1. **RES-09 / DEF-026 (P1): fixed in code 3 Oct 2026.** Migration 055 (atomic `create_expense_with_splits` / `update_expense_with_splits`) is applied to production; the five write sites use it; verified live (online create and edit, dropped response, retry, CSV import, offline queue). **The app change is committed but not pushed.** Open leftover: DEF-038, the raw "Failed to fetch" text.
   plpgsql functions and route the 6 call sites through them. Needs a migration + approval.
2. ~~DEF-025~~ fixed 3 Oct 2026 (migration 062: archived trips take no new expenses, splits or settlements).
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

## Invite links (3 Oct 2026)

- Phase 1 is LIVE (merged 3 Oct 2026, commit e3e3cfd): per-invite links (`/join/<token>`), the join screen, the invite card (Share, WhatsApp, Email, Copy), sign-up survival, a playful illustration when a trip has no cover photo. Design: https://claude.ai/artifact/3ZVMNDBLeLPPgMU7TpCur6. Stories: `USAGE-INSIGHTS-STORIES.md`. Migration 054 is applied.
- Done: 054 applied; the app's address with `/join/**` added to Supabase's redirect list. Still to do: update the link-preview picture address in `index.html` and set `VITE_PUBLIC_APP_URL` when the app gets its own domain.
- Release labels to apply on the board: REQ-USE-25 `rel-2026-10-03-9a14398`; REQ-INV-01 `rel-2026-10-03-e3e3cfd` (dates are UTC).
- REQ-INV-01 supersedes REQ-TRIP-12 and REQ-GRO-01 (decision 3 Oct 2026). Phase 2 (invites list, admin report, `list_invites` and `revoke_invite`) and phase 3 (real trip name in the preview card, reset code) are not built.
- The old six-letter codes still work and are still permanent; "reset code" is phase 3.
- The Supabase SQL editor stopped partway through `054_invite_links.sql` on 3 Oct 2026 (only `create_invite` was created; cause not found, the file parses cleanly). The rest is in `supabase/editor-parts/054_part2..4_*.sql`, to paste one at a time in order; each is safe to repeat. If the whole file ever works, the parts are redundant.

## Jira-lite board update (3 Oct 2026)
- Imported `jira/SE-jira-delta-usage-invites.csv` (SE-152..172), linked all 20 stories to EP-14 (SE-152), created and closed **Sprint 7** with REQ-USE-01..09, REQ-USE-25 and REQ-INV-01 (release labels `rel-2026-10-03-24e35ae`, `-9a14398`, `-e3e3cfd`). Unbuilt EP-14 stories stay in the backlog; no Sprint 8 on the board yet.
- SE-36 (REQ-TRIP-12) and SE-107 (REQ-GRO-01) carry a `superseded` label and a comment pointing at SE-168; status unchanged (the board has no superseded status).
- Delivery notes: `jira/S7-LOCAL-TODO.md` is the note this came from. `PRODUCT-ROADMAP.md` now shows join-by-link as shipped and lists the usage/invite backlog.

## DEF-026 delivery notes (3 Oct 2026)
- `supabase db push` would also re-run 049-054 (applied by hand in the SQL editor, so absent from the remote migration history). 055 was pasted into the SQL editor instead. To use `db push` again, first run `supabase migration repair --status applied 049 050 051 052 053 054` (a production write; ask first).
- Scratch Postgres test: `supabase/tests/055_atomic_expense_save.test.sql` (12 checks). There is no local psql; a throwaway `postgres:16` container runs `schema.sql` plus the migrations, started from the owner's terminal (Docker is blocked in the sandbox). Container `se-scratch` may still be running.
- Live test rows (prefix `E2E-TEST 055`) sit in the trip `E2E-TEST 047 write check`, which is still not archived. The Members tab there also created a per-invite link.

## Sprint 8 started (3 Oct 2026)
- **Sprint 8 - Usage insights phase 2** is **active** on the board with REQ-USE-10, 11, 12, 23, 24 (SE-162..166). The board allows one active sprint, so **Sprint 6 (regression sweep, settlement summary, amount calculator, DEF-025) cannot be started until Sprint 8 is closed.** REQ-INV-03 (SE-169, invite visibility) is not in Sprint 8 yet.

## REQ-USE-10 feature adoption built (3 Oct 2026, Sprint 8)
- Migration 056 (`admin_usage_feature_adoption`) is applied to production (pasted into the SQL editor). Admin > Usage > Features is live in the code; **the app change is committed, not yet pushed**.
- New tracking: itemized split, settle up (online path), circles, reminders (saving a trip end date), offline queue, tour. Rates, help and invite link are derived from existing events. Not run live: settle up and circles (they would create settlements/circles). Remaining Sprint 8: REQ-USE-11, 12, 23, 24.
- Live test rows: `E2E-TEST 056 itemized` and `E2E-TEST 056 offline` in trip `E2E-TEST 047 write check` (not archived).

## REQ-USE-11 top events built (3 Oct 2026, Sprint 8)
- Migration 057 (`admin_usage_top_events`) is applied to production (SQL editor). The card "What people did this week" is on Admin > Usage > Overview; app change committed, not yet pushed. Remaining Sprint 8: REQ-USE-12, 23, 24.

## REQ-USE-26 live users now built (3 Oct 2026, Sprint 8, SE-183)
- Migration 058 (`admin_usage_live`) applied to production (SQL editor). "Live now" card on Admin > Usage > Overview refreshes every 30 s; verified live (count matches the Active now tile). App change committed, not yet pushed. Remaining Sprint 8: REQ-USE-12, 23, 24.

## REQ-USE-23 devices built (3 Oct 2026, Sprint 8, SE-165)
- Migration 059 (`admin_usage_devices`) applied to production (SQL editor). Admin > Usage > Devices; also the Overview "Active now" tile is now a button that jumps to the Live now list. App changes committed, not yet pushed. Remaining Sprint 8: REQ-USE-12 (timeline) and REQ-USE-24 (device filter).

## REQ-USE-24 device filter built (3 Oct 2026, Sprint 8, SE-166)
- Migration 060 applied to production (SQL editor). It DROPS AND RECREATES `admin_usage_funnel`, `admin_usage_funnel_users`, `admin_usage_ttfe`, `admin_usage_stuck_counts`, `admin_usage_stuck`, `admin_usage_feature_adoption`, `usage_funnel_rows`, `usage_stuck_segment` with two optional params (`p_form_factor`, `p_install_mode`); new helper `usage_eligible_device`. Re-runnable. Dropdowns on Funnel / Features / Stuck users; verified live. App change committed, not yet pushed. Only REQ-USE-12 (timeline) is left in Sprint 8.
- To test SQL locally: no local psql; a throwaway `postgres:16` container (`se-scratch`) with `schema.sql` + the migrations (errors from missing Supabase extensions are expected). The scripts used live in the session scratchpad, not the repo.

## REQ-USE-12 per-user timeline built (3 Oct 2026, Sprint 8, SE-164)
- Migration 061 (`admin_usage_user_timeline`) applied to production (SQL editor). Panel opens from Stuck users, Funnel drop-off list and the Users tab ("View activity"); verified live. App change committed, not yet pushed. This was the last Sprint 8 story: after the push, close Sprint 8 on the board (closing moves unfinished issues to the backlog; all six are done) and then Sprint 6 (regression sweep, settlement summary, amount calculator, DEF-025) can start.

## Sprint 8 closed (3 Oct 2026)
- All six issues (SE-162..166 and SE-183) are done and pushed, release labels `rel-2026-10-03-590398c`, `-8e13de0`, `-14e5aa5`, `-758a1cd`, `-0bbad9b`, `-39e82de`. Sprint 8 is **closed**; no sprint is active, so **Sprint 6 can be started** (regression sweep, settlement summary, amount calculator, DEF-025; DEF-026 already done). `RELEASES.md` regenerated through `0bbad9b`.
- Open after Sprint 8: REQ-INV-03 (invite visibility, SE-169) and the parked EP-14 ideas (REQ-USE-13..22); DEF-038 (raw "Failed to fetch" text, SE-182) is open in the backlog. Test rows `E2E-TEST 055/056 ...` remain in the trip `E2E-TEST 047 write check`; container `se-scratch` may still be running (`docker rm -f se-scratch`).

## Sprint 6 started (3 Oct 2026)
- **Sprint 6 - Regression sweep and quick wins** is **active** on the board (goal refreshed; 3 to 9 Oct): SE-69 settlement summary (REQ-BAL-08), SE-58 amount calculator (REQ-EXP-13), SE-139 DEF-025 (archived-trip expense inserts), SE-140 DEF-026 (already done). The regression sweep itself is test work, not a board issue. Briefs: `brief-settlement-summary.md`, `brief-amount-calculator.md`. Order proposed: DEF-025, settlement summary, amount calculator, then the sweep.

## DEF-025 fixed (3 Oct 2026, Sprint 6, SE-139)
- Migration 062 applied (SQL editor): `is_group_archived(gid)` helper (needed because members cannot see an archived trip, so a plain check inside the policy would let them through) and stricter insert rules on `expenses`, `expense_splits`, `settlements`. Side effect by design: an existing expense in an archived trip cannot be re-saved either. Soft-delete and admin restore still work. Verified live with a stale tab: save refused with the row-level-security error, nothing left behind, live trips unaffected. Test data: archived trip `E2E-TEST 062 archived trip` (archived with owner OK) and one expense `E2E-TEST 062 live trip still works` in `E2E-TEST 047 write check`. App unchanged. Not yet committed/pushed until the owner approves.

## Settlement summary built (3 Oct 2026, Sprint 6, SE-69)
- App-only change, committed, not yet pushed: `src/lib/settlementSummary.js`, `src/lib/shareText.js`, a "Share summary" button on Balances (`BalancesPanel.jsx`, trip name passed from `TripView.jsx`). Test cases BAL-17..22 added (md and Sheet rows 253-258). Owner to run on a phone: BAL-20 (iPhone Safari share sheet) and BAL-21 (Android Chrome); BAL-22 offline not run.
- Found, not fixed: the Balances screen says "You owes Jayashree" (should be "You owe"); it predates this change. Only the amount calculator (SE-58) is left in Sprint 6 before the regression sweep.

## Amount calculator built (3 Oct 2026, Sprint 6, SE-58)
- App-only, committed, not yet pushed: `src/lib/evalAmount.js` (+ tests), `AddExpenseForm.jsx` (calculator keys under the Amount field, live preview, settles on blur to the currency's decimals, "Check the calculation" blocks Save), Help text (`adding-expense`). Test cases EXP-40..48 (md and Sheet rows 259-267). Owner to run on phones: EXP-46 (iPhone Safari) and EXP-47 (Android Chrome); EXP-48 offline not run. Second pass (item, tax and tip fields) not built.
- Live test rows in `E2E-TEST 047 write check`: `E2E-TEST 058 calc` ($30.00) plus the earlier 055/056/062 rows.

## Help refreshed (3 Oct 2026)
- `helpContent.jsx` updated for everything shipped today: calculator (Adding an expense), Share summary (Balances), saving safely when the connection drops (Working offline), archived trips take no new entries (Trip settings), two new FAQ answers, and the Usage tab section now covers the clickable Active now tile, Live now, What people did this week, Features, Devices, the Device and Install filters and One person's activity. The person-activity panel has its own "?" opening the Usage help. Checked live on the Help page. Committed, not yet pushed.

## Regression sweep, first pass (3 Oct 2026, run by Claude Code)
- Ganesha (own VM) cannot sign in past Turnstile and returned a checklist only, no results. The desktop items were run in the owner's Chrome instead and recorded (md and Sheet): NAV-01, NAV-02, NAV-03, TOUR-02, INST-02, BAL-10, RES-04 all PASS. Earlier today (verified live): EXP-40..45, BAL-17..19, TRIP-22 (DEF-025), RES-09 (PARTIAL), Usage views and filters, activity timeline, AT-09, ATR-03.
- Not run (need a person): phones (RES-01, BAL-09/11/14/15/16/20/21, EXP-46/47/48, ACT-06, OFF-11), two accounts (AUTH-06/07, CIRC-04), throwaway account (AU-07, SEC-07), Turnstile sign-ups (AUTH-02/04, SIGN-01/02, TOUR-01), EXP-17 and EXP-39 (optional), per-invite join screen and sign-up survival (needs a second identity).
- New cosmetic defects, to create on the board (login had expired): DEF-039 "You owes" wording, DEF-040 narrow Amount box in Record payment. Sprint 6 still active; close it after the owner decides the sweep is enough.

## Staging for automated QA (3 Oct 2026, REQ-SEC-07)
- Ganesha cannot pass Turnstile (own VM). Plan, agreed with the owner: a **separate Supabase staging project** (Turnstile dummy secret `1x0000000000000000000000000000000AA`, confirm-email off) + a Vercel **Preview** with `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`. A test sitekey alone cannot work against the production backend, because Supabase Auth verifies the token with the project's secret; a WAF IP rule cannot work either (the app is not behind Cloudflare's proxy).
- Done in code: `src/lib/turnstileKeys.js`, a build guard in `vite.config.js` that fails a `VERCEL_ENV=production` build carrying a test key, 5 new tests, `.env.example` note. Full checklist in `STAGING.md`. **Never `supabase link` the main folder to staging.** Owner steps still open: create the Supabase project, auth settings, Vercel Preview variables and protection choice.
- To add to the board when the login is back: story REQ-SEC-07 (EP-11) in Sprint 6, plus DEF-039 and DEF-040.

Board (3 Oct 2026): DEF-039 = SE-184, DEF-040 = SE-185 (backlog bugs), REQ-SEC-07 = SE-186 (story, Sprint 6, in progress).

## Staging database loaded (3 Oct 2026)
- Staging Supabase project `zzuttxfzxmfxohjmibrh` has the schema and migrations 002-062 and passed a structure check (see `STAGING.md` Status). Production untouched. Next, owner: Vercel Preview variables (listed in `STAGING.md`), protection choice, then I push the `staging` branch, set the redirect URLs, create the QA accounts and run the acceptance check. The Vercel CLI is not signed in on this machine; the dashboard is used. The password prompt scripts (`staging_db2.sh`) live in the session scratchpad only.

## Story points added (5 Oct 2026)
- All stories and bugs on the board (170 of 172) now have points (`estimate`) and a planning effort (`time_estimate_minutes`), with the basis written in each description; rubric and velocity in BRD section 11. 60 measured from git, 110 estimated by comparison. Re-point an item in the board if its real size turns out different. The two superseded stories are unpointed on purpose.
- Staging is waiting on one fix: `VITE_SUPABASE_URL` in the Vercel Preview variables was saved as `ps://zzutt...` (missing `htt`), so the Preview app is blank. After the owner corrects it to `https://zzuttxfzxmfxohjmibrh.supabase.co`, push another commit to the `staging` branch to rebuild, then recheck `https://varanasi-git-staging-vakacherla-1857.vercel.app/login`.

## Non-code work on the board (5 Oct 2026)
- New epic EP-15 (SE-187) with 15 retrospective stories SE-188..202 (roadmap and research, decks, requirements/BRD, briefs, website copy, test strategy, tracking system, usage and invite design, Help content, points calibration), all done, 90 points, placed in the sprint where each happened. Velocity now includes them (BRD section 11 has both the with and without figures). Evidence for each is in its description. Going forward, non-code work gets a story under EP-15 when it is done or planned.
