# Jira-lite update for the mobile app work (run from a local session)

Proposed (owner to confirm): put these stories in a **new sprint S9**, under a new epic **EP-16**.

**Sprint S9 goal:** *A tester can install the app, sign in to staging, open a trip, add an expense by voice in their own
language, and see correct balances.* (REQ-MOB-01 to REQ-MOB-05, 26 points: 3 + 5 + 5 + 8 + 5.)

1. Import `jira/SE-jira-delta-mobile-app.csv` (9 new issues: EP-16 and REQ-MOB-01..08). Import only creates issues.
2. Create sprint **S9** with the goal above. Assign REQ-MOB-01..05. REQ-MOB-06..08 stay in the backlog.
3. Link every REQ-MOB story to epic EP-16.
4. Set points (`estimate`) from each description's "Proposed points": 3, 5, 5, 8, 5, 8, 13, 8.
5. Read the jira-lite backend routes first (`../Proj Mgmt Tool`, backend on localhost:8000). The owner signs in to Chrome; never enter credentials. Ask before any push to the jira-lite repo.

## Done (6 Oct 2026, owner signed in to Chrome; nothing pushed to the jira-lite repo)

- Imported `SE-jira-delta-mobile-app.csv`: **EP-16 = SE-203** and **REQ-MOB-01..08 = SE-204..SE-211** (9 issues created from 9 rows).
- Created **Sprint 9 - Native mobile app beta slice** (Planned, not started) with the goal above; assigned SE-204..SE-208 (REQ-MOB-01..05). SE-209..211 stay in the backlog.
- Points set from the descriptions: SE-204 3, SE-205 5, SE-206 5, SE-207 8, SE-208 5, SE-209 8, SE-210 13, SE-211 8 (sprint total 26).
- Epic links: the UI has no "link existing issue" control, so all eight stories were linked with `PATCH /api/v1/projects/{id}/issues/{id}` `{parent_id}` from the signed-in tab (the same route used for EP-14). Board shows EP-16 at 0 of 8.
- Not done on purpose: the sprint is not started; start it when M0 begins to count.

## Update 2026-10-06 (applied via API from the owner's signed-in tab)
- SE-204 (REQ-MOB-01) -> Done. SE-205 (REQ-MOB-02, M1) -> In Progress.
- Created SE-212 (REQ-MOB-09 Design foundation), 3 pts, high, epic EP-16, Sprint 9, Done.
- Sprint 9 goal now says "REQ-MOB-01 to 05 and 09 (29 points)".
- Sprint 9 is still Planned: it cannot start while Sprint 6 is active. Not closed (owner's call).
- Test cases (2026-10-06): 59 `test_case` issues created under SE-204 (7), SE-212 (7), SE-205 (45), from splitexpenses-mobile/docs/TEST-CASES.md. 24 automated ones set Done, the rest To do. Bugs go in as Bug issues with the TC id in the title.
- Trips and Circles on real data (2026-10-06): 18 more test_case issues (TC-MOB02-52..69) under SE-205; 4 automated set Done.
- Trip screen (2026-10-06): 19 more test_case issues (TC-MOB02-70..88) under SE-205; 8 automated set Done. Total test cases under SE-205: 82.
- M2 prep (2026-10-06): 25 test_case issues (TC-MOB03-01..25) under SE-206; 14 automated set Done. Plan in splitexpenses-mobile/docs/M2-PLAN.md.
- M2 screens (2026-10-07): 15 more test_case issues (TC-MOB03-26..40) under SE-206 (total 40); SE-206 set In Progress. Form: src/screens/ExpenseFormScreen.tsx.
- M3 voice (2026-10-07): 40 test_case issues (TC-MOB04-01..16 under SE-207, TC-MOB05-01..24 under SE-208); SE-207 and SE-208 set In Progress. Function written at splitcurrency/supabase/functions/voice-expense/index.ts (UNCOMMITTED in the web repo, NOT deployed). Deploy via splitexpenses-mobile/scripts/deploy-voice-staging.sh after owner approval.
- voice-expense DEPLOYED to staging 2026-10-07 (owner approved); TC-MOB04-04, 15, 16 passed and set Done. Authenticated path untested until a signed-in phone run.
- M4a (2026-10-07): join by link/code, create+share invite, circle screen built, no migration. 26 test_case issues (TC-MOB06-01..23, 30..32) under SE-209; 4 automated Done; 30-32 are Blocked backlog items awaiting the placeholder design decision. SE-209 In Progress. Design doc: splitexpenses-mobile/docs/M4-PLACEHOLDERS-DESIGN.md.
- M4b placeholders (2026-10-07, option A chosen): migration 063 + add-placeholder function + web guards committed locally on web branch placeholder-members (5177d12), NOT applied/deployed anywhere. Scratch Postgres: 13 new checks + all existing SQL suites pass. TC-MOB06-30..32 unblocked, 22 new test_case issues (TC-MOB06-33..54); SE-209 test cases now 48. Awaiting owner OK for: apply 063 to staging, deploy add-placeholder + admin-users/remind/trip-reminders-cron to staging.
- M4b follow-up (2026-10-07): owner answers recorded (adder can invite, only organizer/admin can modify; merge OK; label 'Pending Registration (not joined yet)'). rename_placeholder/remove_placeholder added to migration 063 (15 SQL checks, all suites pass on scratch). TC-MOB06-55..62 added; SE-209 test cases now 56. Web commit db5c454 on branch placeholder-members. Still NOT applied to staging.
- 2026-10-07 APPLIED TO STAGING with owner OK: migration 063 (verified: 5 columns, 5 functions, guard trigger, new create_invite signature); deployed add-placeholder, admin-users, remind, trip-reminders-cron (last three are new on staging). add-placeholder smoke: no-auth 401, non-user 401, GET 405, OPTIONS 200. Production untouched (its own admin-users/remind/trip-reminders-cron are unchanged). Staging has 0 users/placeholders. Web branch placeholder-members not pushed.

## Pending Jira logging (2026-10-07, needs the owner to sign in on the Jira-lite tab; token expired)
- Create test_case issues TC-MOB07-01..13 under story REQ-MOB-07 (SE-210), from splitexpenses-mobile/docs/TEST-CASES.md.
- Mark Done/Passed: TC-MOB07-01, 02, 03 (automated), 04 and 05 (Simulator, 2026-10-07).
- Voice results to log: TC-MOB05-05/06/07 passed; add unknown names, last-added person ticked, USD conversion passed.
- Bug #445 already logged (same-currency save).
