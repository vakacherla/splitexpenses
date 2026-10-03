# Production releases (one per push to main)

Each push to `main` deploys to production on Vercel. A release label `rel-<date>-<tip sha>` marks the push. Dates up to the 2 Oct 16:08 push are US Eastern time from the local push log; from 3 Oct 2026 they are the commit time in UTC. Sep 6 releases arrived by fetch from another machine. Story ship commits are estimates from the roadmap and git history; bug ship commits come from the fixes. Rebuild with `jira/build_releases.py`.

| Release label | Pushed (ET) | Tip commit | Issues first shipped |
|---|---|---|---|
| rel-2026-09-03-2498e2f | 2026-09-03 18:20 | 2498e2f Add itemized receipt splitting, fix two vision-provider bugs | REQ-ADM-01, REQ-ADM-02, REQ-ADM-03, REQ-AUTH-01, REQ-AUTH-02, REQ-AUTH-03, REQ-AUTH-05, REQ-BAL-01, REQ-BAL-02, REQ-BAL-03, REQ-BAL-04, REQ-BAL-05, REQ-EXP-01, REQ-EXP-02, REQ-EXP-03, REQ-EXP-05, REQ-EXP-06, REQ-EXP-07, REQ-EXP-09, REQ-EXP-11, REQ-REP-01, REQ-REP-02, REQ-SEC-01, REQ-SEC-02, REQ-SEC-03, REQ-SEC-04, REQ-SEC-05, REQ-SEC-06, REQ-TRIP-01, REQ-TRIP-02, REQ-TRIP-03, REQ-TRIP-04, REQ-TRIP-09 |
| rel-2026-09-04-92ae4cf | 2026-09-04 20:26 | 92ae4cf Update handoff doc for session end, fix signup email redirect | DEF-020b, DEF-021b, DEF-037, REQ-ADM-04, REQ-ADM-05, REQ-ADM-06, REQ-ADM-07, REQ-ADM-08, REQ-ADM-09, REQ-BAL-06, REQ-EXP-08, REQ-OFF-01, REQ-OFF-02, REQ-OFF-03, REQ-TRIP-05 |
| rel-2026-09-04-838745b | 2026-09-04 21:05 | 838745b Add self-service password reset | REQ-AUTH-04 |
| rel-2026-09-04-9b73adc | 2026-09-04 21:35 | 9b73adc Widen Dashboard grid to 3 columns on large screens | (docs, QA records or no tracked issue) |
| rel-2026-09-04-3256047 | 2026-09-04 21:41 | 3256047 Add system architecture diagram and tech stack to handoff doc | (docs, QA records or no tracked issue) |
| rel-2026-09-05-d984f57 | 2026-09-05 12:43 | d984f57 Require a live connection for CSV import, with auto-rollback on failur | REQ-REP-03 |
| rel-2026-09-05-0f9859f | 2026-09-05 12:59 | 0f9859f Add "log an expense by typing a sentence" | REQ-EXP-10 |
| rel-2026-09-05-25411e2 | 2026-09-05 13:43 | 25411e2 Add custom group cover-photo banner | REQ-TRIP-06 |
| rel-2026-09-05-277bc74 | 2026-09-05 14:48 | 277bc74 Add push notifications + persistent activity feed | REQ-ACT-01, REQ-ACT-03, REQ-ACT-04, REQ-ACT-05 |
| rel-2026-09-05-8f3ecc7 | 2026-09-05 15:03 | 8f3ecc7 Cap CSV import at 500 rows per file | (docs, QA records or no tracked issue) |
| rel-2026-09-05-78827cf | 2026-09-05 17:28 | 78827cf Reject absurd trip-date years, not just wrong ordering | DEF-033, REQ-TRIP-10 |
| rel-2026-09-05-04af125 | 2026-09-05 17:35 | 04af125 Document today's banner UI iteration and trip-dates fix | (docs, QA records or no tracked issue) |
| rel-2026-09-06-68ac180 | 2026-09-06 16:03 | 68ac180 Replace Admin's "Groups" stat icon with a grid-of-cards glyph | REQ-ONB-04 |
| rel-2026-09-06-9d59193 | 2026-09-06 20:39 | 9d59193 Rename Group(s) to Trip(s) throughout the UI | REQ-AUTH-06, REQ-CIRC-01, REQ-CIRC-02, REQ-CIRC-04, REQ-CIRC-05, REQ-CIRC-08, REQ-TRIP-11 |
| rel-2026-09-06-c338036 | 2026-09-06 20:56 | c338036 Note the Circles hero-card split in the roadmap | DEF-032 |
| rel-2026-09-13-82d22e6 | 2026-09-13 13:28 | 82d22e6 Add Shares/Adjustment split modes; roll back orphaned expense on split | (docs, QA records or no tracked issue) |
| rel-2026-09-13-8f496f8 | 2026-09-13 13:34 | 8f496f8 Fix Shares/Adjustment display: missing labels and unfetched columns | (docs, QA records or no tracked issue) |
| rel-2026-09-13-f8d76c5 | 2026-09-13 13:40 | f8d76c5 Add logged-out Overview/HomePage instead of redirecting straight to lo | (docs, QA records or no tracked issue) |
| rel-2026-09-13-7da9217 | 2026-09-13 13:55 | 7da9217 Drop active $0 pricing display, show Plus price as strike-only | (docs, QA records or no tracked issue) |
| rel-2026-09-13-5b19ed7 | 2026-09-13 14:02 | 5b19ed7 Replace closing CTA banner with a plain text sign-off | (docs, QA records or no tracked issue) |
| rel-2026-09-13-e1e7e29 | 2026-09-13 14:03 | e1e7e29 Box the closing sign-off in a dark green panel instead of floating tex | (docs, QA records or no tracked issue) |
| rel-2026-09-13-79475b7 | 2026-09-13 14:08 | 79475b7 Log competitive review against splitmyexpenses.com | (docs, QA records or no tracked issue) |
| rel-2026-09-13-094f3d0 | 2026-09-13 21:05 | 094f3d0 Sync Circle membership with Trip membership, add Circle Settings | REQ-CIRC-03, REQ-CIRC-06 |
| rel-2026-09-13-084a213 | 2026-09-13 21:22 | 084a213 Sync existing Trip roster into a Circle on attach, not just on new joi | DEF-013 |
| rel-2026-09-13-36e70ce | 2026-09-13 21:45 | 36e70ce Create a new circle inline from Trip Settings' attach dropdown | REQ-CIRC-07 |
| rel-2026-09-13-65fb6e1 | 2026-09-13 22:00 | 65fb6e1 Fix Circle settings icon to use the real gear glyph, not a sun shape | (docs, QA records or no tracked issue) |
| rel-2026-09-30-c9b64ba | 2026-09-30 19:34 | c9b64ba Clarify CSV import error when a name is used instead of an email | DEF-001, DEF-002, DEF-003, DEF-004, DEF-005, DEF-005b, DEF-006, DEF-007, DEF-010, DEF-011, DEF-012, DEF-013b |
| rel-2026-09-30-42c4a3d | 2026-09-30 19:38 | 42c4a3d Fix CSV import template date getting silently reformatted by Excel/She | (docs, QA records or no tracked issue) |
| rel-2026-09-30-0ac8864 | 2026-09-30 21:06 | 0ac8864 Fix UPI pay links: add required payee name, add a QR fallback | (docs, QA records or no tracked issue) |
| rel-2026-09-30-88c45ec | 2026-09-30 21:14 | 88c45ec Cache profile so the Navbar's Admin link doesn't flash blank on load | DEF-027 |
| rel-2026-09-30-81cae01 | 2026-09-30 21:33 | 81cae01 Let CSV import also accept the app's own export format (CSV-01) | DEF-015, REQ-REP-04 |
| rel-2026-10-01-95c1859 | 2026-10-01 03:42 | 95c1859 Sync app code with the already-deployed expense-edit RLS policy; show  | (docs, QA records or no tracked issue) |
| rel-2026-10-01-66669c8 | 2026-10-01 04:35 | 66669c8 Fix RLS bug blocking a non-admin member from deleting their own expens | DEF-014 |
| rel-2026-10-01-a823ab2 | 2026-10-01 05:08 | a823ab2 Use the historical exchange rate for a backdated expense, not today's | DEF-016, REQ-EXP-04, REQ-EXP-12 |
| rel-2026-10-01-1059afb | 2026-10-01 05:51 | 1059afb Stop labeling non-member circle viewers as "admin" | DEF-029 |
| rel-2026-10-01-25f8f32 | 2026-10-01 11:31 | 25f8f32 Stop leaking raw Postgres errors on CirclePage | (docs, QA records or no tracked issue) |
| rel-2026-10-01-29bdd59 | 2026-10-01 13:20 | 29bdd59 Sync E2E test-case record: correct EXP-13, resolve SEC-02/03/04/05/07, | (docs, QA records or no tracked issue) |
| rel-2026-10-01-f1bd3bc | 2026-10-01 14:35 | f1bd3bc Fix NaN balances during a pending offline settlement (OFF-09) | (docs, QA records or no tracked issue) |
| rel-2026-10-01-f8560c5 | 2026-10-01 14:37 | f8560c5 Record OFF-09 fix confirmation: re-verified live on production | (docs, QA records or no tracked issue) |
| rel-2026-10-01-3ece6b0 | 2026-10-01 14:40 | 3ece6b0 Mark offline FX conversions as estimates (OFF-05), warn before sign-ou | REQ-OFF-04 |
| rel-2026-10-01-41d688f | 2026-10-01 15:57 | 41d688f Record OFF-05/OFF-16 fix confirmations: re-verified live on production | (docs, QA records or no tracked issue) |
| rel-2026-10-01-f4ba40d | 2026-10-01 16:03 | f4ba40d Scope the offline write queue to the signed-in user (AUTH-07 / OFF-16  | (docs, QA records or no tracked issue) |
| rel-2026-10-01-9e42837 | 2026-10-01 16:08 | 9e42837 Record offline-queue user-scoping fix: re-verified live on production | (docs, QA records or no tracked issue) |
| rel-2026-10-01-d6c4b53 | 2026-10-01 16:23 | d6c4b53 Let a trip's creator/manager archive it (AT-07), fix the leak that fix | DEF-017, REQ-TRIP-08 |
| rel-2026-10-01-b4a8fdc | 2026-10-01 22:26 | b4a8fdc Record pre-push cross-verification (Appendix O) | DEF-009, DEF-020 |
| rel-2026-10-01-2cf0fa8 | 2026-10-01 22:37 | 2cf0fa8 Prepare circle-archive fix (migration 045) with consumer guards; not a | DEF-018 |
| rel-2026-10-01-1d4142b | 2026-10-01 22:39 | 1d4142b Record production verification of circle-archive fix and TRIP-22 | (docs, QA records or no tracked issue) |
| rel-2026-10-02-a5b64e1 | 2026-10-02 02:32 | a5b64e1 Fix stale exchange rate saved as real money when FX is down (RES-10) | DEF-008, DEF-019, REQ-BAL-07 |
| rel-2026-10-02-b8a8d9d | 2026-10-02 11:04 | b8a8d9d Sync website copy with deck (free forever, no pricing), add AI-data He | DEF-023 |
| rel-2026-10-02-e7609d2 | 2026-10-02 11:31 | e7609d2 Record migration 046 verification and test-data cleanup | DEF-022, REQ-ACT-02, REQ-TRIP-07 |
| rel-2026-10-02-4b9e7f3 | 2026-10-02 13:15 | 4b9e7f3 Default admin contact for suspended users to admin@splitexpense.com | DEF-024, REQ-AUTH-07 |
| rel-2026-10-02-a6f9bf3 | 2026-10-02 13:34 | a6f9bf3 Add Cloudflare Turnstile CAPTCHA to sign-up, sign-in and password rese | REQ-AUTH-08, REQ-AUTH-09, REQ-AUTH-10 |
| rel-2026-10-02-8ae8e13 | 2026-10-02 14:34 | 8ae8e13 Welcome tour: 'show every time' checkbox and a dashboard link to reope | DEF-034, REQ-ONB-01 |
| rel-2026-10-02-a0f8122 | 2026-10-02 14:49 | a0f8122 AU-04 verified on production: suspended live session is cut off | (docs, QA records or no tracked issue) |
| rel-2026-10-02-4d23709 | 2026-10-02 15:00 | 4d23709 Add main navigation: top menu, mobile bottom tabs, Trips/Circles views | REQ-ONB-02, REQ-ONB-03 |
| rel-2026-10-02-c3f5946 | 2026-10-02 15:05 | c3f5946 Add install prompt: native install banner, iPhone Add-to-Home-Screen s | REQ-OFF-05 |
| rel-2026-10-02-dec9661 | 2026-10-02 15:09 | dec9661 Handoff: exact eligibility times and steps for AT-09/ATR-03 | (docs, QA records or no tracked issue) |
| rel-2026-10-02-92681e1 | 2026-10-02 15:21 | 92681e1 Add BRD with requirement/test/defect traceability, regression brief, a | (docs, QA records or no tracked issue) |
| rel-2026-10-02-bf032cb | 2026-10-02 15:29 | bf032cb BRD: add Jira key index; stories and bugs linked to epics on the board | (docs, QA records or no tracked issue) |
| rel-2026-10-02-54d0419 | 2026-10-02 15:44 | 54d0419 BRD: sprint plan (S0 to S6), DEF-029 marked fixed | (docs, QA records or no tracked issue) |
| rel-2026-10-02-6d47ed8 | 2026-10-02 15:55 | 6d47ed8 Add release labels: RELEASES.md, label map and generator; BRD section  | (docs, QA records or no tracked issue) |
| rel-2026-10-02-0c1e05e | 2026-10-02 16:08 | 0c1e05e Handoff: rewrite as a compact resume point (tracking system, tomorrow' | (docs, QA records or no tracked issue) |
| rel-2026-10-03-24e35ae | 2026-10-03 01:28 | 24e35ae Merge pull request #3: Usage Insights phase 1 (EP-14, REQ-USE-01 to 09 | REQ-USE-01, REQ-USE-02, REQ-USE-03, REQ-USE-04, REQ-USE-05, REQ-USE-06, REQ-USE-07, REQ-USE-08, REQ-USE-09 |
| rel-2026-10-03-9a14398 | 2026-10-03 03:26 | 9a14398 Merge pull request #5: Never signed in group (053), never-invited fix  | REQ-USE-25 |
| rel-2026-10-03-e3e3cfd | 2026-10-03 03:26 | e3e3cfd Merge pull request #6: per-invite share links, phase 1 (REQ-INV-01) | REQ-INV-01 |
| rel-2026-10-03-b0cd5ed | 2026-10-03 03:47 | b0cd5ed Jira S7 follow-up: SE-152..172 in BRD key index and key map, Sprint 7  | (docs, QA records or no tracked issue) |
| rel-2026-10-03-3ef4e21 | 2026-10-03 03:48 | 3ef4e21 Key map and BRD index: parked REQ-USE-14..22 added to the board as SE- | (docs, QA records or no tracked issue) |
| rel-2026-10-03-5750eca | 2026-10-03 03:57 | 5750eca Tests: AT-09 and ATR-03 PASS (30-day permanent delete gate verified li | (docs, QA records or no tracked issue) |
| rel-2026-10-03-9bc5e7e | 2026-10-03 04:15 | 9bc5e7e Atomic expense save (DEF-026): migration 055, five write sites routed  | DEF-026, REQ-EXP-16 |
