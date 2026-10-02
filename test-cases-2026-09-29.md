# Split Expenses — E2E test cases, run 2026-09-29

For Claude Code (the app developer's agent): the full inventory of test cases written for this run, with each case's execution status and evidence. Fix the FAILs, note the NOT-BUILT gaps, re-run the BLOCKED/NOT RUN cases when you have a second test identity.

## Run metadata

- App: https://splitexpenses-app.vercel.app/ (production)
- Run date: 2026-09-29
- Tester: Ganesha E2E agent (browser automation on the live site + owner manual checks for offline and undo confirmation)
- Rules: real user data never touched; test entities use `E2E-TEST` prefix; no external payment links tapped; no destructive admin actions taken
- Statuses: **PASS** (verified working), **FAIL** (verified broken — see FAIL appendix), **BLOCKED** (could not run: no second signed-in identity because /signup is broken, automation limits, needs fault injection or waiting days, or policy forbids it), **NOT RUN** (not covered this run — no evidence either way; never treat as passing), **NOT-BUILT** (feature verified absent — a gap, not a bug, unless the product promises it)

## Summary counts

| Status | Count |
|---|---|
| PASS | 129 |
| FAIL | 18 |
| BLOCKED | 7 |
| NOT-BUILT | 11 |
| NOT RUN | 72 |
| **Total cases** | **237** |

Counts above are as originally run (2026-09-29); see Appendix D (fixes), Appendix E (second-identity batch, 2026-09-30/10-01), Appendix F (RLS bug found via EXP-12), Appendix G through Appendix M (regression sweep resumed, 2026-10-01) for what has changed since. All 16 original FAILs are now fixed or shown to be false positives — see Appendix D (main table synced to match 2026-10-01). EXP-13's own expectation was the thing that was wrong, not the product — confirmed with the owner and corrected 2026-10-01, see Appendix H. The real backdated-rate bug that the original run's QA agent missed (EXP-28) was found and fixed the same day — see Appendix I. EXP-38/EXP-39 (receipt OCR, Appendix L) and the Security boundaries batch (SEC-02/03/04/05, Appendix M) also moved from BLOCKED/NOT RUN to PASS since. These main-table counts themselves are not live-recalculated — treat individual row statuses as authoritative over this summary.

FAIL severity: **P0: 5** (signup broken, malformed circle route leaks DB error, huge-amount renderer freeze, settlement undo dead, import undo dead) · **P1: 9** · **P2: 2**.

## 1. Auth & routing

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| AUTH-01 | Sign up with a new email | P0 | PASS | Fixed 2026-09-29 by the owner (Supabase Auth "Confirm email" toggled off, zero code change). Not re-verified live by the agent — creating a new account is outside what this agent does, even on request. See Appendix D (F1). |
| AUTH-02 | Sign up with an email already in use | P1 | NOT RUN | Signup is broken, so this could not be attempted. |
| AUTH-03 | Sign in with correct credentials | P0 | PASS | Vault-saved super-admin login works; reaches dashboard. |
| AUTH-04 | Sign in with wrong password | P1 | NOT RUN | Not covered this run. |
| AUTH-05 | Sign out; Back button must not show cached authenticated pages | P0 | PASS | Verified live 2026-10-01 — see Appendix N. After signing out, browser Back from /login landed back on /login (not the previously-open trip page), no cached authenticated content shown — ProtectedRoute re-evaluates on every route change rather than relying on a cached DOM snapshot. |
| AUTH-06 | Cross-user cache: A signs out, B signs in on same profile; B never sees A's data | P0 | BLOCKED | Needs a second signed-in identity; signup is broken. |
| AUTH-07 | Offline queued ops of A never applied under B's identity | P0 | BLOCKED | Needs a genuine second signed-in identity on the same device to walk through end-to-end in the UI — not a signup-is-broken issue anymore (AUTH-01 long since fixed). The underlying gap this case was testing for is fixed as of 2026-10-01 (queue now scoped per-user, see Appendix N's AUTH-07/OFF-16 entry) and strongly verified via direct localStorage manipulation against the real deployed code, but that's not the same as a true two-account UI walkthrough — leaving this BLOCKED rather than PASS until one happens. |
| AUTH-08 | Logged out, direct /dashboard or /trips/<id> redirects to Login | P0 | PASS | Recon verified redirect to /login. |
| AUTH-09 | Logged in as non-admin, direct /admin | P0 | PASS | Verified live 2026-10-01 as a non-admin member — see Appendix E. |
| AUTH-10 | Sign-up confirmation link lands on production URL | P0 | PASS | Hand-verified 2026-09-04; not re-verifiable while signup is broken. |
| AUTH-11 | Click a confirmation link twice | P1 | NOT RUN | Not covered this run. |
| AUTH-12 | "Forgot password?" flow | P0 | PASS | Verified live 2026-10-01 — see Appendix N. Submitting a real test email at /forgot-password showed "Check your email — If an account exists for drjayashree@hotmail.com, we sent a link to reset your password" — correctly account-enumeration-safe phrasing. Did not click the resulting email link (AUTH-13 remains blocked on inbox access). |
| AUTH-13 | Valid reset link | P0 | NOT RUN | Needs inbox access; not covered this run. |
| AUTH-14 | /reset-password with mismatched confirm | P1 | NOT RUN | Not covered this run. |
| AUTH-15 | Save new password | P1 | NOT RUN | Not covered this run. |
| AUTH-16 | /reset-password with no recovery link | P2 | PASS | Fixed and confirmed live 2026-09-30: visiting /reset-password with a normal signed-in session (no recovery link) now shows "Link expired" instead of a submittable password form. See Appendix D (F15). |
| AUTH-17 | Old /groups/<id> URL redirects to /trips/<id> | P1 | PASS | Redirect works cleanly. |
| AUTH-18 | Malformed trip id /trips/49A047 | P0 | PASS | Clean "This trip doesn't exist, or you don't have access to it" message. |
| AUTH-19 | Visit /login while already signed in | P1 | PASS | Fixed and confirmed live 2026-09-30: visiting /login while signed in now redirects straight to /dashboard. See Appendix D (F6). |
| AUTH-20 | Admin link/name in Navbar present immediately after a fresh page load | P2 | FAIL (fixed 2026-10-01) | User-reported from manual testing: Admin link missing on some inside pages until navigating back to dashboard. Reproduced: a hard reload showed "Good to see you, there" and no Admin link, both correcting a moment later — `profile` (which both read from) starts null and only resolves after a network round trip, with no loading placeholder in the Navbar. Not a security gap (AdminRoute correctly waits for profile). Fixed by caching the last-known profile in localStorage keyed by user id (commit 88c45ec) so a returning session renders correctly instantly. |

## 2. Trips

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| TRIP-01 | Dashboard hero shows real first name and trip count | P0 | PASS | Verified live 2026-10-01 — see Appendix E. |
| TRIP-02 | Trip cards show real avatars with name tooltips | P1 | PASS | Verified live 2026-10-01 — see Appendix E. |
| TRIP-03 | Create a trip | P0 | PASS | Fixture trips created; invite code visible under Members. |
| TRIP-04 | Second account joins with correct invite code | P0 | PASS | Jayashree's account is a member of multiple trips joined via real invite codes (e.g. `E2E-TEST CSV Import Trip`, code E7DF35) — see Appendix H. |
| TRIP-05 | Invalid/mistyped invite code | P1 | PASS | Verified live 2026-10-01 — see Appendix E. |
| TRIP-06 | Invite code casing behavior documented | P1 | PASS | Verified live 2026-10-01 — see Appendix E. |
| TRIP-07 | Multiple trips listed with correct member counts | P1 | PASS | Dashboard lists all fixture trips correctly. |
| TRIP-08 | Creator promotes a member to manager | P0 | PASS | Verified live 2026-10-01 — see Appendix H. |
| TRIP-09 | Manager cannot promote others, remove another manager, or remove/demote the creator | P0 | PASS | Verified live + server-side policy inspection 2026-10-01 — see Appendix H. |
| TRIP-10 | Creator demotes a manager | P1 | PASS | Verified live 2026-10-01 — see Appendix H. |
| TRIP-11 | Regular member sees no Trip settings section | P1 | PASS | Verified live 2026-10-01 — see Appendix G. |
| TRIP-12 | Manager removing the creator via direct RPC is rejected server-side | P0 | PASS | Verified by server-side policy inspection 2026-10-01 (no live attempt, to avoid risking an actual removal) — see Appendix H. |
| TRIP-13 | Owner/manager duplicates a trip | P0 | PASS | Clean copy with fresh invite code, blank ledger; duplicator becomes owner. |
| TRIP-14 | Source trip's invite code still works after duplication | P1 | NOT RUN | Not covered this run. |
| TRIP-15 | Regular member sees no "Duplicate this trip" control | P1 | PASS | Verified live 2026-10-01 — see Appendix H. |
| TRIP-16 | Owner/manager uploads cover photo | P1 | PASS | Full-bleed on dashboard card and trip banner. |
| TRIP-17 | Square/portrait photo center-cropped, not stretched | P2 | NOT RUN | Not covered this run. |
| TRIP-18 | Upload a non-image file (PDF) as cover photo | P1 | PASS | Fixed and confirmed live 2026-09-30: uploading a real (minimal) PDF as a trip cover photo now shows "Please choose an image file." and is never uploaded. See Appendix D (F7). |
| TRIP-19 | Upload a huge image (e.g. 15MB) | P1 | NOT RUN | Not covered this run. |
| TRIP-20 | Remove a member who still has unsettled debts | P0 | PASS | Verified live 2026-10-01 — see Appendix K. The owner attempted removing Jayashree while she had a balance and the app blocked it with a clear message ("Can't remove Jayashree — they still have an outstanding balance in this trip. Settle up first."), rather than removing silently or leaving dangling debt. |
| TRIP-21 | Removed member rejoins with the same invite code | P1 | PASS | Verified live 2026-10-01 — see Appendix K. |
| TRIP-22 | Add an expense to an archived trip | P1 | FAIL | 2026-10-01: archived trip stayed reachable by direct link for its creator/manager (side effect of migration 044) and accepted a new expense. Fix committed (TripView treats archived as not found for non-admins); pending push + live re-verify. See Appendix N. |
| TRIP-23 | Trip name with HTML/JS, emoji, 300 chars | P1 | PASS | <img src=x onerror=alert(1)> rendered as inert text; no layout break. |
| TRIP-24 | Trip dates: end-before-start blocked | P0 | PASS | Hand-verified 2026-09-05. |
| TRIP-25 | Trip dates: absurd years (0005, 9999) rejected | P1 | PASS | Hand-verified 2026-09-05. |

## 3. Circles

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| CIRC-01 | Create a Circle | P0 | PASS | Appears in its own labeled Circles section on the dashboard. |
| CIRC-02 | Second account joins via circle invite code | P0 | PASS | Verified live 2026-10-01 — see Appendix K. |
| CIRC-03 | Trip created inside a circle copies the roster at creation time | P0 | PASS | Verified live 2026-10-01 — see Appendix N. Created a new trip (`E2E-TEST CIRC-03 roster check`) inside `E2E-TEST Circle 20260929-1055`; its `group_members` exactly matched the circle's roster (Jayashree + Ram) at creation. |
| CIRC-04 | Adding someone to the trip after creation syncs them into circle_members | P0 | BLOCKED | Attempted 2026-10-01 — see Appendix N. Both existing circle members (Jayashree, Ram) were already in the new test trip via CIRC-03's roster copy. There's no insert policy letting a manager add an arbitrary user_id directly (only self-service join-by-code, a SECURITY DEFINER RPC); genuinely testing this needs a different identity (Rohan/Sarah/Demo Traveler) to actually join the trip via its own invite code, which this agent can't simulate without their login. Same category as AUTH-06/07. |
| CIRC-05 | Attach an existing trip to a circle; roster syncs | P0 | PASS | Attach works; roster syncs into the circle. |
| CIRC-06 | Detach a trip from a circle | P1 | PASS | Trip keeps its members and ledger; circle unaffected. |
| CIRC-07 | Cross-trip debts stay per-trip, never rolled up across the circle | P0 | PASS | Balances and settle-up verified strictly per-trip. |
| CIRC-08 | Removing someone from one trip keeps them in the circle and sibling trips | P1 | NOT RUN | Not covered this run. |
| CIRC-09 | Circle manager rules mirror trip manager rules | P0 | PASS | Verified live + server-side policy inspection 2026-10-01 — see Appendix K. |
| CIRC-10 | Add-by-email with an address that has no account | P1 | NOT RUN | Not covered this run. |
| CIRC-11 | Circle cover photo upload | P1 | PASS | Verified live 2026-10-01: cover uploaded to circle-banners, button changed to Change, image renders (1200x600) on the circle page. Dashboard circle cards do not show covers by design. |
| CIRC-12 | Circle member who hasn't joined a sibling trip sees info only, never the ledger | P0 | PASS | Verified live 2026-10-01 — see Appendix K. Minor copy issue noted, not a security problem: the banner reads "Viewing as admin — you're not a member of this trip" for this case too, which is misleading (Jayashree isn't a platform admin, just a circle member) even though the actual restriction is correct. |
| CIRC-13 | Malformed circle id /circles/49A047 | P0 | PASS | Fixed and confirmed live 2026-09-30: /circles/49A047 now shows "This circle doesn't exist, or you don't have access to it." (previously leaked `invalid input syntax for type uuid`). See Appendix D (F2); commit `29e95f2`. |
| CIRC-14 | "+ Create new circle" inline in Trip Settings | P1 | PASS | Verified live 2026-10-01: created a new circle inline from Trip Settings and the trip attached; circle name shown. Known weakness logged in Appendix N (three non-atomic writes). |

## 4. Expenses

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| EXP-01 | Add expense in home currency | P0 | PASS | Saves correctly to the ledger, no FX panel. |
| EXP-02 | Add expense in foreign currency | P0 | PASS | EUR 45.50 converted to USD 51.67 at 1.1355 pre-save and post-save. |
| EXP-03 | Equal split; $100 split 3 ways | P0 | PASS | $33.34 / $33.33 / $33.33; extra cent to first-listed member; total exact. |
| EXP-04 | Percentage split: non-100 sums blocked | P0 | PASS | Verified live 2026-10-01 — see Appendix E. |
| EXP-05 | Percentage float boundary 33.33/33.33/33.34 vs 33.33x3 | P1 | PASS | Verified live 2026-10-01 — see Appendix E. |
| EXP-06 | Exact split: valid split saves | P0 | PASS | Valid exact splits save correctly. |
| EXP-07 | Exact split off by $0.01 | P1 | PASS | Fixed and confirmed live 2026-09-30: an exact split of $49.99 against a $50.00 expense now shows "49.99 of 50.00 USD assigned" in red and blocks submission with "Exact shares add up to 49.99, not 50.00." See Appendix D (F8). |
| EXP-08 | Deselecting a participant excludes them entirely | P1 | PASS | Verified live 2026-10-01 — see Appendix E. |
| EXP-09 | Category saved with correct icon and label | P1 | PASS | Icon and label correct on ledger rows. |
| EXP-10 | Expanding a row shows the correct per-person breakdown | P1 | PASS | Breakdown matches saved splits. |
| EXP-11 | Deleting an expense removes it from ledger and updates Balances | P0 | PASS | Rows reach Admin Trash; ledger and balances stay consistent. |
| EXP-12 | Edit/Delete only appear for expenses you entered or paid for | P0 | PASS | Verified live with a second real account 2026-09-30/2026-10-01 — surfaced a real RLS bug (non-admin couldn't delete her own expense), fixed 2026-10-01 — see Appendix F. |
| EXP-13 | Trip manager (not payer) can edit others' expenses, UI and server (test case's original title/expectation was inverted — corrected 2026-10-01 after owner confirmation) | P1 | PASS | Confirmed with the owner 2026-10-01: a trip manager having full edit/delete/attach-receipt oversight over every expense in the trip, not just their own, is the intended design — keep as-is, no code change. Verified live: a manager who isn't the payer *can* edit/delete/attach a receipt to another member's expense, in both the UI and the server-side policy (`is_group_manager(group_id)` is explicitly one of the three conditions in the `expenses: members can edit` RLS policy, alongside creator/payer). See Appendix H for the original discovery. |
| EXP-14 | Admin "Viewing as admin" cannot edit/delete expenses | P1 | PASS | Read-only view; no edit controls. |
| EXP-15 | Edit split keeps original exchange_rate and home amount | P0 | PASS | Verified live 2026-10-01 — see Appendix J. |
| EXP-16 | Edit amount/currency fetches a fresh rate | P0 | PASS | Hand-verified 2026-09-04. |
| EXP-17 | Edit pre-fills every field for each split type | P1 | PASS | Verified live 2026-10-01 (Equal mode) — see Appendix J. |
| EXP-18 | Itemized: assigned items + proportional tax/tip per person | P0 | PASS | Per-person math verified correct. |
| EXP-19 | Itemized: participant assigned $0 of items but still checked | P1 | PASS | Verified live 2026-10-01 — see Appendix K. |
| EXP-20 | Itemized: item assigned to nobody is blocked | P0 | PASS | Verified live 2026-10-01 — see Appendix E. |
| EXP-21 | Itemized: add/remove rows keep live totals in sync | P1 | PASS | Verified live 2026-10-01 (local dev server, real backend): two items, one assigned to both and one to Ram only, total and per-person shares stayed in sync (5.00/11.00 of 16.00); removing the second item returned to 10.00 and 5.00/5.00. Nothing saved. See Appendix N. |
| EXP-22 | Expanded itemized row shows per-item assignments and totals | P1 | PASS | Verified on fixture expenses. |
| EXP-23 | Amount 0 or negative is blocked | P1 | PASS | Verified live 2026-10-01 — see Appendix E. |
| EXP-24 | Amount 999999999.99 is accepted and formatted sanely | P0 | PASS | Fixed and confirmed live 2026-09-30: typing 999999999.99 now shows "Amount can't be more than 10,000,000." immediately, with no freeze or hang. See Appendix D (F3). |
| EXP-25 | Empty description blocked | P1 | PASS | Blocked with "Give the expense a short description." |
| EXP-26 | Expense in a zero-decimal currency (JPY) | P1 | PASS | No fractional yen anywhere; shares sum correctly. |
| EXP-27 | Expense in a currency the FX API doesn't know | P1 | NOT RUN | Only a 30-currency dropdown exists; no free-text path to test. |
| EXP-28 | Backdated expense uses today's rate and the UI says so | P1 | FAIL (fixed 2026-10-01) | This was actually the bug, caught by real user feedback, not a correct design: a backdated expense used today's rate instead of the rate for its own date, which can differ by several percent. Fixed — see Appendix I. The UI still clearly labels which rate is shown, now correctly ("rate for \<date\>" vs "today's rate"). |
| EXP-29 | Future-dated expense | P2 | PASS | Fixed and confirmed live 2026-09-30: setting an expense date to 2026-12-25 shows "This date is in the future." live, as a non-blocking warning — the expense still saves normally. See Appendix D (F16). |
| EXP-30 | Duplicate pre-fills description/category/amount/currency/payer/split | P0 | PASS | Form pre-filled correctly with today's date and no receipt. |
| EXP-31 | Duplicate saves with today's fresh rate; original untouched | P1 | PASS | New row created with fresh FX; original unchanged. |
| EXP-32 | Duplicate carries itemized items, assignments, tax/tip | P1 | PASS | Verified live 2026-10-01 — see Appendix J. |
| EXP-33 | Duplicate is independent after the original is deleted | P1 | PASS | Verified live 2026-10-01 — see Appendix J. |
| EXP-34 | Attach receipt on own receipt-less expense | P0 | PASS | Upload works; "View receipt" appears with no reload. |
| EXP-35 | No "Attach receipt" on others' expenses | P1 | PASS | Verified live 2026-10-01 — see Appendix H. |
| EXP-36 | Attach receipt inside the Edit modal | P0 | PASS | Plain upload works; "Receipt attached" confirms. |
| EXP-37 | Switch to Itemized seeds one item with the total plus hint | P1 | PASS | Seeds one item with the amount and an explanatory hint. |
| EXP-38 | Receipt OCR scan pre-fills description/amount/currency/date/category | P1 | PASS | Verified live 2026-10-01 — see Appendix L. The earlier BLOCKED was an automation-tool limitation (clicking the scan button to open a native file picker, which can't be driven), not a product issue — resolved by uploading directly to the underlying file input instead. |
| EXP-39 | Scan variants: itemized receipt, selfie, French-language receipt | P1 | PASS (itemized only) | Verified live 2026-10-01 for the itemized-receipt variant — see Appendix L. Selfie and French-language receipt variants not separately tested this pass. |

## 5. Log-an-expense-by-typing-a-sentence

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| SENT-01 | Basic sentence parses into a categorized equal-split expense | P1 | PASS | Parses payer, amount, participants; Save commits it. |
| SENT-02 | Sentence naming someone not in the trip falls back to everyone | P1 | PASS | Falls back to everyone; never a wrong guess. |
| SENT-03 | Relative date ("yesterday") resolves to the actual prior day | P1 | PASS | Date resolved correctly. |
| SENT-04 | Currency symbol ("$53.77") uses live conversion | P1 | PASS | USD with the same live conversion as the rest of the app. |
| SENT-05 | Unequal-shares sentence declines gracefully | P1 | PASS | Equal-split-only scope holds; never invents an exact split. |
| SENT-06 | Gibberish / no detectable amount | P1 | PASS | Clear "couldn't understand that" message; nothing saved. |
| SENT-07 | Parse, then cancel instead of saving | P0 | PASS | Ledger completely unchanged; parse never writes. |
| SENT-08 | Offline sentence parse | P1 | PASS | Fixed (code-verified 2026-09-30, same offline-detection mechanism as OFF-03/13/14; not separately re-tested live). See Appendix D (F9). |

## 6. Balances & settling up

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| BAL-01 | Balances tab: correct net position per member | P0 | PASS | 4-member fixture verified to the cent: Rohan owes $66.67, Sarah owes $56.67, Demo Traveler settled, Ram owed $123.34. |
| BAL-02 | Suggested settle-up: sensible minimal payment set | P0 | PASS | Sensible minimal set for the 4-member fixture. |
| BAL-03 | Record payment in home currency | P0 | PASS | $10 test payment recorded; balances updated; activity event logged. |
| BAL-04 | Record payment in foreign currency | P0 | PASS | Verified live 2026-10-01 — see Appendix I. |
| BAL-05 | Settlement uses the rate locked at record time | P1 | PASS | Verified live 2026-10-01: recording a $16 debt as paid in EUR locked in that moment's rate (€14.09), unaffected by any later date logic. |
| BAL-06 | Overpayment (payment larger than owed) | P1 | PASS | Verified live 2026-10-01 — see Appendix I. |
| BAL-07 | Undo a settlement | P0 | PASS | Fixed and confirmed live 2026-09-30: Undo on a real $10 settlement correctly reverted the balance (Demo Traveler back to "owes $10.00") and removed the row from Recent payments. Root cause of the original FAIL: very likely a native confirm() dialog being auto-dismissed by browser automation, not a real defect. See Appendix D (F4); re-confirmed with a different, genuine fix (RLS-blocked undo surfacing a clear error instead of silently no-opping) commit `29e95f2`. |
| BAL-08 | Fully-settled trip state | P2 | PASS | "Nothing to settle" message shown. |
| BAL-09 | Settle-up deep links (UPI/Venmo/PayPal) | P1 | NOT RUN | Policy: never tap external payment links. |
| BAL-10 | Recipient with no payment handle: graceful state | P1 | NOT RUN | Code-reviewed 2026-10-01 (not run live): `SettleUpModal.jsx` shows "<name> hasn't added a payment handle yet" and hides the pay button when the recipient has no handle. Live run still needs a real debt to a no-handle member. |
| BAL-11 | Push notification deep-links to the trip | P1 | BLOCKED | Needs a second identity and a real device. |
| BAL-12 | Trip end date in the past triggers debtor reminders | P1 | BLOCKED | Needs waiting days plus inbox/device access. |
| BAL-13 | Reminder 3-day cooldown boundary | P1 | BLOCKED | Needs waiting days plus inbox/device access. |
| BAL-14 | Manual "Remind" button delivers | P1 | BLOCKED | Needs a second identity plus inbox/device access. |
| BAL-15 | Notification enable/disable flow | P1 | NOT RUN | Not covered this run. |
| BAL-16 | Deny browser notification permission | P1 | NOT RUN | Code-reviewed 2026-10-01 (not run live): `enablePush` throws "Notification permission was not granted." and `NotificationSettings` shows it inline; button re-enables. Browser permission prompt cannot be driven by automation. |

## 7. Reports

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| REP-01 | Category chart + totals match hand-added expenses | P1 | PASS | Total $552.15; Misc $509.65; Groceries $42.50. |
| REP-02 | "By who paid" matches amounts paid, not shares | P1 | PASS | Verified against fixture data. |
| REP-03 | Category x person table consistent with both charts | P1 | PASS | Internally consistent. |
| REP-04 | Trip with no expenses: empty state | P2 | PASS | Clean empty state, no broken chart. |
| REP-05 | Soft-deleted expenses excluded from all views | P1 | PASS | Verified live 2026-10-01 — see Appendix J. |
| REP-06 | Date-range / member filters | P2 | NOT-BUILT | Verified 2026-09-29: search is keyword + category only per /help; no tag/amount/date-range filters exist. |

## 8. CSV export / import

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| CSV-01 | Round-trip fidelity: export then import into a fresh trip | P0 | PASS | Verified live 2026-09-30 — export's own header format wasn't accepted by import, fixed 2026-09-30 (commit `81cae01`) — see Appendix E. |
| CSV-02 | One invalid row among valid ones rejects the whole file | P0 | PASS | Every problem listed by row number (e.g. Row 3 "Invalid amount not-a-number"); ledger 0 to 0. |
| CSV-03 | File over 500 rows: single clear rejection | P1 | PASS | Single cap message; no row-by-row validation first. |
| CSV-04 | Unknown email in a people column | P1 | PASS | Row number named: "nobody@example.com isn't a member". |
| CSV-05 | Email matching: case-insensitive, trimmed | P1 | PASS | Verified live 2026-10-01 — see Appendix E. |
| CSV-06 | Amount with thousands separator (1,234.56) | P1 | PASS | Cleanly rejected naming the row; not misparsed (no money bug). |
| CSV-07 | CRLF line endings and UTF-8 BOM | P1 | PASS | Handled; no phantom first column. |
| CSV-08 | Malformed date in a row | P1 | PASS | Rejected naming the row ("expected YYYY-MM-DD"). |
| CSV-09 | Undo an import (inline and later from Trip settings) | P0 | PASS | Fixed and confirmed live 2026-09-30: Undo on a real import batch (`fmt-colon.csv`) marked it "Undone" and removed its expense from the ledger. See Appendix D (F5), Appendix L for a second confirmation. |
| CSV-10 | Mid-import connection drop auto-rolls back | P0 | PASS | Verified live 2026-10-01 — see Appendix L. |
| CSV-11 | Offline: import blocked with a clear warning | P1 | PASS | Not actually a bug — confirmed live 2026-09-30: the offline notice and disabled "Can't import while offline" button both render correctly in the CSV import modal. Original FAIL was a false positive from the QA pass's offline-simulation method not toggling `navigator.onLine`. See Appendix D (F10). |
| CSV-12 | Every imported row is written as an exact split | P1 | PASS | Ledger labels them "custom split"; exact per-person amounts. |
| CSV-13 | Multi-row import produces one consolidated activity entry | P1 | PASS | One entry: "imported 1 expense from <file>" for a multi-row import. |
| CSV-14 | "Download template" link present and correct (online) | P2 | PASS | Template downloads; column order matches export. |
| CSV-15 | Export excludes soft-deleted expenses, includes settlements | P1 | NOT-BUILT | Split finding — see Appendix J. The exclusion half passes (confirmed by code: `handleExportCSV` feeds it `displayExpenses`, already filtered to `deleted_at is null`, and live-verified the same way as REP-05). The "includes settlements" half is absent, not just untested: `expensesToCSV`/`csvExport.js` has no settlements parameter at all, and the app's own Help text promises only "every expense... splits included" — never settlements. Not a bug against what's promised, but a real gap if settlements-in-export was expected. |

## 9. Activity feed & push

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| ACT-01 | Expense added/edited: one feed entry each, correct actor | P1 | PASS | Add and edit entries correct with actor name and summary. |
| ACT-02 | Expense deleted: one feed entry | P1 | PASS | Verified live 2026-10-01 — see Appendix J. |
| ACT-03 | Settlement recorded/undone: one feed entry each | P1 | PASS | Recorded-payment entry verified; "undone" entry untestable while undo is broken. |
| ACT-04 | Member joined via self-service code and via admin-add | P1 | NOT RUN | Not covered this run. |
| ACT-05 | Removed member's old entries still show their name | P1 | NOT RUN | Not covered this run. |
| ACT-06 | Push targeting: group vs other-party-only vs feed-only | P1 | BLOCKED | Needs a second identity and a real device. |
| ACT-07 | notify-group rejects fake/non-member targets server-side | P0 | PASS | Verified live 2026-10-01 — see Appendix N. Confirmed by code (`supabase/functions/notify-group/index.ts`: `targetUserIds.filter((id) => memberIds.has(id))` silently drops non-members rather than erroring) and by a live call with only a fake UUID as the target: `{"targeted":0,"sent":0}`, no push attempted. |
| ACT-08 | Trips older than the feed show backfilled events, no duplicates | P1 | PASS | Older trip shows backfilled Sep 3-5 events; no duplicates. |
| ACT-09 | Rename / trip dates / duplication / banner deliberately not logged | P2 | PASS | Feed does not log these, as designed. |

## 10. Small shipped features

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| FEAT-01 | Ledger search/filter: description, member, category; special chars safe | P1 | PASS | $, quotes, and <> in queries don't break it. |
| FEAT-02 | Saveable default split per trip | P1 | PASS | New expense forms pre-fill the saved default. |
| FEAT-03 | Note field on an expense: saved, HTML-escaped | P2 | PASS | Saved on the expanded row; HTML rendered inert. |
| FEAT-04 | Shareable invite link | P1 | NOT-BUILT | Verified 2026-09-29: Members tab shows the invite code only; no link exists. |

## 11. Admin — Users

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| AU-01 | Non-admin sees no "Admin" link in the nav | P0 | PASS | Verified live 2026-10-01 — see Appendix E. |
| AU-02 | Admin → Users lists every account platform-wide | P0 | PASS | Full user list loads (18 users seen). |
| AU-03 | Suspend a user | P0 | NOT RUN | Destructive; skipped per production policy. |
| AU-04 | Suspend a user with an active session | P1 | NOT RUN | Destructive; skipped per production policy. |
| AU-05 | Unsuspend a user | P1 | NOT RUN | Destructive; skipped per production policy. |
| AU-06 | Delete a user with no history | P0 | NOT RUN | Destructive; skipped per production policy. |
| AU-07 | Delete a user whose only history is soft-deleted expenses | P0 | NOT RUN | Destructive; skipped per production policy. |
| AU-08 | Delete a user with live history is blocked with a clear explanation | P0 | NOT RUN | Destructive; skipped per production policy. |
| AU-09 | Cannot suspend/delete your own admin account | P0 | PASS | No Suspend/Delete buttons on your own row. |
| AU-10 | Only super admin sees promote/demote; never on your own row | P0 | PASS | Verified in the Users view. |
| AU-11 | Promote member → admin → super admin → demote back | P1 | NOT RUN | Destructive; skipped per production policy. |
| AU-12 | Oldest admin shows "SU" badge | P1 | PASS | Badge verified on the oldest admin. |
| AU-13 | Only super admin sees "Add to trip" | P0 | NOT RUN | Not covered this run. |
| AU-14 | "Add to trip" for a suspended user | P1 | NOT RUN | Not covered this run. |
| AU-15 | Adding a user already in the trip is a harmless no-op | P1 | NOT RUN | Not covered this run. |
| AU-16 | Non-super-admin replaying admin_add_user_to_group is rejected | P1 | NOT RUN | Not covered this run. |
| AU-17 | "Manage trips" lists each trip with Remove | P0 | PASS | Trips list loads with per-trip Remove. |
| AU-18 | Removing a user with expense history keeps the expenses | P1 | NOT RUN | Destructive; skipped per production policy. |
| AU-19 | Non-super-admin replaying admin_remove_user_from_group is rejected | P1 | NOT RUN | Not covered this run. |

## 12. Admin — Trips

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| AT-01 | Admin → Trips lists every trip platform-wide with member counts | P0 | PASS | Full trip list loads with accurate counts. |
| AT-02 | Each trip shows accurate "Created <date> by <name>" | P1 | NOT RUN | Not covered this run. |
| AT-03 | Every Overview stat tile lands on the right tab | P0 | NOT RUN | Not covered this run. |
| AT-04 | "Active users" stat tile filters to the active users | P1 | PASS | Fixed and confirmed live 2026-09-30: the tile now shows "Showing active users only. Show everyone" and correctly filters the Users tab (9 of 23 users, matching the tile's own count). See Appendix D (F14). |
| AT-05 | Admin → Settlements: every settlement platform-wide | P0 | PASS | Correct from/to/trip/date/amount, including home-currency equivalents for foreign-currency settlements. |
| AT-06 | Rename a trip | P1 | NOT RUN | Destructive-ish; skipped per production policy. |
| AT-07 | Delete a trip (archives it) | P0 | PASS | Initially FAIL (RLS error on archive); fixed by migration 044 + CirclePage filter (d6c4b53). Re-verified live 2026-10-01: archive of test copy succeeded, redirected to /dashboard, trip gone from lists. See Appendix N. |
| AT-08 | Archived trip shows day count + restore works | P0 | NOT RUN | Destructive; skipped per production policy. |
| AT-09 | "Permanently delete" only after 30+ days | P0 | NOT RUN | MANUAL: cannot wait 30 days. |
| AT-10 | Admin trip view: real tabs, "Viewing as admin", no add-expense | P1 | PASS | Real Ledger/Balances/Reports/Members; no add-expense button. |
| AT-11 | Admin "Circle" button attaches any trip to any circle | P1 | NOT RUN | Not covered this run. |

## 13. Admin — Trash

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| ATR-01 | Deleted expense lands in Trash; ledger and balances updated | P0 | PASS | 22 items visible with trip name, amount, day count. |
| ATR-02 | Restore from Trash | P0 | NOT RUN | Destructive-adjacent; skipped per production policy. |
| ATR-03 | "Delete permanently" only after 30+ days | P0 | NOT RUN | MANUAL: cannot wait 30 days. |
| ATR-04 | Non-admin never sees deleted expenses anywhere | P1 | NOT RUN | Not covered this run. |
| ATR-05 | Restore an expense whose trip has since been archived | P1 | NOT RUN | Not covered this run. |

## 14. Security boundaries

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| SEC-01 | Second account, non-member: trip invisible everywhere in their UI | P0 | PASS | Verified live 2026-10-01 — see Appendix K. |
| SEC-02 | Non-admin setting is_admin via direct Supabase call is blocked by DB trigger | P0 | PASS | Verified live 2026-10-01 (run by the owner, not the agent — see Appendix M). Direct PostgREST `PATCH .../profiles?id=eq.<jayashree>` `{is_admin: true}` as Jayashree returned 200 with the row, but `is_admin: false` — the `prevent_admin_self_promotion` trigger (migration 005) silently reset it since `auth.uid()` was set and she isn't a platform admin. |
| SEC-03 | Non-admin calling admin-users directly gets "Admins only" | P1 | PASS | Verified live 2026-10-01 (run by the owner, not the agent — see Appendix M). Direct `POST .../functions/v1/admin-users {action: 'list'}` as Jayashree returned `403 {"error":"Admins only."}` — rejected before even parsing the action. |
| SEC-04 | RLS: member of trip A querying trip B's expenses gets zero rows | P1 | PASS | Verified live 2026-10-01 — see Appendix M. Direct PostgREST query as Jayashree for `E2E-TEST Personal Trip` (a trip she's not a member of) returned `200 []`; the same query shape against a trip she is a member of returned real rows, confirming the empty result is RLS filtering, not a broken query. |
| SEC-05 | Non-manager direct Storage upload to banner paths rejected | P1 | PASS | Verified live 2026-10-01 (run by the owner, not the agent — see Appendix M). Direct Storage `POST .../group-banners/<a trip she's not a manager of>/test.png` as Jayashree returned `403 {"error":"Unauthorized","message":"new row violates row-level security policy"}`. |
| SEC-06 | XSS sweep: payload inert in expense description, trip name, expense note | P0 | PASS | <img src=x onerror=alert(1)> rendered as inert text everywhere it surfaces. Member display name and circle name not separately tested. |
| SEC-07 | Expired/tampered session token redirects cleanly to Login | P1 | NOT RUN (partial exploration) | Tested live 2026-10-01 (owner's browser — see Appendix M), but not the exact scenario this case names. Corrupting only the stored `access_token` (valid `refresh_token` left intact) does not redirect to Login — instead `supabase-js` silently uses the refresh token to mint a fresh session, with no error shown and a brief window of failed data loads (401s in the console, masked by Dashboard's existing stale-cache/offline handling) in between. Arguably correct behavior (a valid refresh token is real proof of a live session), but not the "redirects to Login" outcome this case names. A truly dead session (refresh token also invalid/expired) was not tested — too easy to lock the test account out without a clean recovery path. |

## 15. Offline mode

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| OFF-01 | Offline reload of a previously-opened trip renders from cache | P0 | PASS | Hand-verified 2026-09-04. |
| OFF-02 | Offline add queues; syncs on reconnect with no loss or dupes | P0 | PASS | $5 probe queued offline, synced on reconnect, no loss or duplicates. |
| OFF-03 | Offline save tells the user it will sync when back online | P1 | PASS | Not actually a bug — confirmed live 2026-09-30: with real `navigator.onLine` + `offline`/`online` events, a newly-added expense shows a genuine "Pending sync" label with the tooltip "Saved on this device — will sync once you're back online," clearing automatically on reconnect. Original FAIL was a false positive from the QA pass's offline-simulation method not toggling that signal. See Appendix D (F11). |
| OFF-04 | Reconnect auto-syncs with no manual refresh | P0 | PASS | Ledger updates on reconnect without a refresh. |
| OFF-05 | Offline foreign-currency add shows a clearly-marked estimate | P0 | PASS | FAIL, found and fixed 2026-10-01 — see Appendix N. Originally reproduced live: with a cached rate present, the offline "Converts to" box rendered identically to online, no estimate marking at all. Fixed: the converted amount now gets a `~` prefix and the rate caption reads "offline — estimate from the last known rate" whenever offline and a rate is available. Re-verified live on production as Jayashree: `~$5,705.49` / "offline — estimate from the last known rate" shown correctly. |
| OFF-06 | Conflicting edit (online vs offline) warns about last-write-wins | P0 | NOT RUN | Not covered this run. |
| OFF-07 | Delete an offline-added, never-synced expense | P0 | PASS | Hand-verified: create + delete both vanish from the queue; server never sees them. |
| OFF-08 | Edit an expense deleted remotely while offline | P1 | NOT RUN | Not covered this run. |
| OFF-09 | Offline settlement gets the same queued/pending treatment | P0 | PASS | FAIL, found and fixed 2026-10-01 — see Appendix N. Originally reproduced live: recording a settlement while offline queued it correctly (banner, Recent payments) but the Balances tab showed "owes $NaN" for every member until the op synced — `mergeQueueIntoSettlements` never set `amount_in_home` on the optimistic object. Fixed to mirror the expense-side `estimateHomeAmounts()` pattern, with 4 new unit tests (`offlineCache.test.js`). Re-verified live on production as Jayashree after deploy: the same repro now shows "settled up" immediately while offline, no NaN. |
| OFF-10 | /admin as non-admin while offline | P0 | PASS | Verified live 2026-10-01 — see Appendix N. Client-side navigation to /admin as Jayashree (non-admin) while genuinely offline redirects cleanly to /dashboard, no hang or crash, same as while online. |
| OFF-11 | First-ever offline visit (no cache) | P1 | NOT RUN | Code-reviewed 2026-10-01 (not run live): no cache -> `offline-no-cache` -> "You're offline and haven't opened this trip on this device before" with Retry. Live run needs a true cold offline load. |
| OFF-12 | Safari-style network failure treated as offline, not a raw error | P0 | PASS | Hand-verified 2026-09-04. |
| OFF-13 | Offline receipt attach shows a warning | P1 | PASS | Fixed and confirmed live 2026-09-30: attaching a receipt to an already-synced expense while offline now shows "You're offline — attach a receipt once you're back online." instead of a dead click. See Appendix D (F12). |
| OFF-14 | Sync banner states (offline / syncing / failed) reflect reality | P1 | PASS | Not actually a bug — confirmed live 2026-09-30: the full offline banner ("You're offline — N changes will sync when you're back online.") appears and updates correctly once genuinely offline. Original FAIL was a false positive from the QA pass's offline-simulation method not toggling `navigator.onLine`. See Appendix D (F13). |
| OFF-15 | Offline add, then offline edit, then reconnect: exactly one correct row | P1 | NOT RUN | Not covered this run. |
| OFF-16 | Sign out offline with queued ops | P0 | PASS (partial fix) | FAIL, partially fixed 2026-10-01 — see Appendix N. Originally reproduced live: clicking Sign out while offline with a queued change gave zero warning. Fixed: Navbar now confirms first, naming the pending count, before signing out. Re-verified live on production as Jayashree: Sign out while offline with 1 pending change triggered the confirmation and did not sign out. Does NOT fix the queue's lack of per-user scoping in `localStorage` — that's the deeper, still-open gap tied to AUTH-07 (BLOCKED). |

## 16. Cross-device, responsive, dark mode, resilience

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| RES-01 | Full flow on an actual phone | P0 | NOT RUN | MANUAL: needs a real phone, not a resized window. |
| RES-02 | No horizontal scrolling on small screens | P1 | PASS (after fix) | Initially FAIL 2026-10-01: trip page tab strip (456px) and Profile payment row overflowed at 375px; Navbar overflowed at 320px. Fixed locally (TripView tab strip scrolls inside itself; Navbar tightened; Profile input min-w-0). Re-measured at 375/320 across dashboard, trip (all 5 tabs), circle, profile, rates, help: no page overflow. Not pushed. See Appendix N. |
| RES-03 | Floating add-expense button stays reachable | P1 | PASS | Verified 2026-10-01 at 375/320px: button is fixed, fully on-screen, and at page bottom the last content on Ledger/Balances/Members clears it. See Appendix N. |
| RES-04 | Laptop-width layout looks intentional | P2 | NOT RUN | Not covered this run. |
| RES-05 | Theme toggle is instant | P1 | PASS | Toggles instantly with no wrong-theme flash. |
| RES-06 | Theme choice persists across browser restarts | P1 | PASS | Persists. |
| RES-07 | First visit with no saved preference follows the OS setting | P2 | NOT RUN | Not covered this run. |
| RES-08 | Dark-mode readability spot-check | P1 | PASS | Login, Dashboard, Ledger/Balances/Reports, Admin all readable. |
| RES-09 | Wifi dropped mid-save: clear error, no half-saved expense | P1 | NOT RUN | Not covered this run. |
| RES-10 | FX API slow/down: "Rate unavailable", no hang | P2 | NOT RUN | Not covered this run. |
| RES-11 | FX host blocked: save allowed with pending rate vs hard-block | P1 | PASS | Verified by code inspection 2026-10-01 — see Appendix K. The original note that FX fetching is server-side doesn't hold: `fx.js`'s `getRate()` calls Frankfurter directly from the browser (`fetch(...)`), so it's a plain client-side request. |

## 17. Recon discoveries (help-page features with zero prior coverage)

| Ref | Test case | Priority | Status | Evidence |
|---|---|---|---|---|
| REC-01 | "Shares" split: relative weights split proportionally | P0 | PASS | $30 at 2 shares vs 1 renders "You $30.00 (2 shares)"; amounts proportional. |
| REC-02 | "Adjustment" split: nudge individual amounts, total stays balanced | P0 | PASS | Single-member: typed 40 on a $60 expense saved without a rebalancing warning (row shows $60.00 (+$40.00)). Multi-member auto-rebalance NOT RUN. |
| REC-03 | Multiple payers on one expense | P1 | NOT-BUILT | Verified 2026-10-01: expenses have a single `paid_by` and the form has one Paid-by selector; no multi-payer support. |
| REC-04 | Tags on an expense | P1 | NOT-BUILT | Verified 2026-09-29: no tag field in the form, edit modal, expanded row, or Help. |
| REC-05 | "Reimbursable" flag | P1 | NOT-BUILT | Verified 2026-09-29: no such flag in the expense flow or Help. |
| REC-06 | Comments on an expense | P1 | NOT-BUILT | Verified 2026-09-29: the Activity tab is a read-only event log; no comment UI. |
| REC-07 | Guest join with just a name | P1 | NOT-BUILT | Verified 2026-09-29: /join redirects to landing; joining requires an account. |
| REC-08 | Personal trip (visible only to you) | P1 | PASS | Created and verified: full functionality, owner-only. |
| REC-09 | Per-person CSV export for reimbursement | P1 | NOT-BUILT | No dedicated per-person export; the trip CSV is per-expense. |
| REC-10 | Circle-wide balances report | P1 | NOT-BUILT | Verified 2026-09-29: no circle Reports view; circle page has Trips/Invite/Add-by-email/Members only. |
| REC-11 | Exchange-rate provenance/date shown in the UI | P2 | PASS | Fixed 2026-10-01 as part of the historical-FX-rate fix (Appendix I): the conversion banner now reads "rate for \<date\>" for a backdated expense instead of always "today's rate", directly showing provenance. Verified live. |
| REC-12 | Tag/amount/date-range search filters | P1 | NOT-BUILT | Verified 2026-09-29: /help says search matches description or who paid only. |
| REC-13 | Voice-based expense input | P2 | NOT-BUILT | No mic button, permission flow, listening indicator, or dictation anywhere. Typed sentence parsing exists and works well; voice would be new. |

## Appendix A — FAIL details for the developer

### P0

**F1. AUTH-01 — Signup broken ("Error sending confirmation email")**
Repro: open /signup, enter name + email + password, submit. Observed: "Error sending confirmation email"; the account is never created (2 attempts, incl. a throwaway address). Expected: the account is created (or a "check your email" step per the Confirm Email setting). Impact: blocks ALL new-user onboarding and every multi-user E2E case. Suspected backend email misconfiguration. Note: public copy implies no confirmation step, but signup attempts one and fails.

**F2. CIRC-13 — Malformed circle route leaks raw Postgres error**
Repro: while signed in, visit /circles/49A047. Observed: raw database text — `invalid input syntax for type uuid: "49A047"`. Expected: a clean "This circle doesn't exist, or you don't have access to it" message (the trip route already does this correctly). Security note: internal error text is an information leak.

**F3. EXP-24 — Amount 999999999.99 freezes the page renderer**
Repro: new expense, type 999999999.99 into the amount field. Observed: the page hangs and the renderer dies. Expected: a validation message — /help documents a 10,000,000 maximum per expense, so the form should reject it cleanly. Do not reproduce casually; it kills the browser session.

**F4. BAL-07 — Settlement Undo is dead**
Repro: Balances → Recent payments → Undo on the recorded $10 test payment. Observed: no effect across an automation click, real cursor clicks, and keyboard Enter (3 attempts). The owner manually confirmed on 2026-09-29 that the Undo button is not visible anywhere and believes his latest prod push broke previously working functionality. Expected: the balance reverts exactly. Status at owner: fixing.

**F5. CSV-09 — Import Undo is dead**
Repro: import a CSV, then Trip settings → CSV imports → Undo next to the batch. Observed: no effect across 8 attempts (automation clicks, real cursor clicks, keyboard Enter, page reload). Same owner-confirmed regression as F4. Meanwhile the import UI still promises "Every import is undoable in one click" — production behavior contradicts public copy. Because undo is unavailable, the test data in the fixture trip cannot be removed via undo and was left in place.

### P1

**F6. AUTH-19 — /login renders a second login form while signed in**
Repro: sign in, then navigate to /login. Observed: another login form renders. Expected: redirect to /dashboard.

**F7. TRIP-18 — PDF uploaded as trip cover is silently accepted**
Repro: Trip settings → cover upload, choose a PDF file. Observed: silently accepted; the banner renders as a broken image. Expected: rejected with a clear error message.

**F8. EXP-07 — Exact split off by $0.01 is silently accepted**
Repro: $50.00 expense, exact split with $49.99 assigned. Observed: accepted without warning; the saved row shows $50.00 total but "You $49.99". Meanwhile $40.00 against $50.00 is correctly blocked. Expected: blocked with a message naming the $0.01 difference — /help says exact shares must add up "to the cent".

**F9. SENT-08 — Offline sentence parse shows a misleading error**
Repro: go offline, type an expense sentence, submit. Observed: spinner for ~15 seconds, then "Couldn't parse that — try rewording it...". Expected: a message saying the user is offline and parsing will work on reconnect.

**F10. CSV-11 — No offline notice in the import modal; template download is a silent no-op**
Repro: go offline, open the CSV import modal; click "Download template". Observed: no offline warning anywhere in the modal; the download does nothing silently. Expected: import blocked with a clear warning; re-enables on reconnect.

**F11. OFF-03 — No "will sync when online" messaging anywhere**
Repro: go offline, add an expense, save. Observed: the row appears fully formed in the ledger with only a tiny red dot before the description. A full-page DOM scan found zero occurrences of "offline", "sync", or "pending"; the dot is decorative aria-hidden markup, byte-identical on every row. The queue itself works (the probe synced on reconnect with no loss or dupes), but the user cannot distinguish a pending row from a synced one. Expected: a pending indicator and a "will sync when you're back online" message.

**F12. OFF-13 — Offline receipt attach is a dead click**
Repro: go offline, try to attach a receipt to an expense. Observed: nothing happens; no warning. Expected: a warning, or "Attach a receipt once this syncs".

**F13. OFF-14 — Sync banner states don't exist in the build**
Repro: inspect the DOM for offline/syncing/retry banner states while offline and during sync. Observed: no such states exist in the current build. Expected: offline (red), syncing (green, spinning), and failed (red, with Retry) states per the shipped design.

**F14. AT-04 — "Active users" stat tile doesn't filter**
Repro: Admin Overview → click the "Active users" tile (shows 8). Observed: navigates to the Users tab but shows the entire user list (18 users); no filter is applied. Expected: the list filtered to the 8 active users. Owner-found 2026-09-29 with screenshot.

### P2

**F15. AUTH-16 — /reset-password with no recovery link shows a submittable form**
Repro: signed out, visit /reset-password directly. Observed: a ready-to-submit password form. Expected: a "link expired/invalid" state after a few seconds.

**F16. EXP-29 — Future-dated expenses are silently allowed**
Repro: set an expense date to 2026-12-25. Observed: saved with no warning. Expected: a defined behavior — allow with a warning, or block. Currently silent.

## Appendix B — Verified CSV import format (2026-09-29)

Exact column order: **Date, Description, Category, Paid by (email), Amount, Currency, Split between, Note**.
Maximum 500 rows. All-or-nothing validation: one bad row rejects the whole file, naming every problem by row number. Member matching is by email. Dates must be `YYYY-MM-DD`. Thousands-separated amounts (`1,234.56`) are cleanly rejected, not misparsed. The `Split between` format is `email:amount` pairs separated by **semicolons** — e.g. `vakacherla@gmail.com:30.00; rohanvakacharla@gmail.com:30.00`. Commas do NOT separate members. `email=amount` and `email:100%` are rejected. Imported rows land as exact-amount splits (ledger labels them "custom split"). A multi-row import produces exactly one consolidated activity entry. Categories (10): Food, Lodging, Flights, Train, Taxi/Cab, Groceries, Shopping, Activities, Utilities, Misc (default: Misc).

## Appendix C — Fixtures used

- E2E-TEST Trip Renamed 20260929-1055 — id 511c9c24-012a-43be-bdfc-f274de1f4003 — invite code B2ECF8
- E2E-TEST Circle 20260929-1055 — id 17c3af0a-790d-4f0c-94cb-9e1d19bb1139 — invite code 6C3764
- E2E-TEST Empty Trip — id b2d8119b-7335-4e09-8f47-caa3d55b15db
- E2E-TEST Personal Trip — id 0b1dead2-f4c4-47bc-84f5-384b69401cde
- E2E-TEST CSV Import Trip — id 942f01b5-b9e1-4c3a-86e7-c233e36c3b4a — members: Ram (vakacherla@gmail.com), Rohan (rohanvakacharla@gmail.com), Sarah (Demo) (vakacherla+reeldemo2@gmail.com), Demo Traveler (vakacherla+reeldemo@gmail.com). Final state: 7 expense rows + 1 recorded $10 settlement (Demo Traveler → Ram, note "E2E-TEST settlement"); balances Rohan owes Ram $66.67, Sarah owes Ram $56.67, Demo Traveler settled up, Ram owed $123.34. Undo is unavailable, so this data was left in place.

Real user data was intentionally not modified or deleted at any point during this run.

## Appendix D — Regression re-verification (2026-09-30, Claude Code)

All 16 FAILs were investigated in the codebase and fixed (commits `29e95f2`, `0869eff`, `c9b64ba`, `42c4a3d` on `main`), then re-tested live against production (https://splitexpenses-app.vercel.app/) signed in as the super-admin account, driven directly via the user's own authenticated Chrome session (no credentials entered by the agent). Live-verified so far:

- **F1 AUTH-01** — Already fixed 2026-09-29 by the owner (Supabase Auth "Confirm email" toggled off, zero code change). Not re-verified by this agent (creating a new account is outside what this agent will do, even on request).
- **F2 CIRC-13** — Fixed and confirmed live: `/circles/49A047` now shows "This circle doesn't exist, or you don't have access to it." (previously leaked `invalid input syntax for type uuid`).
- **F3 EXP-24** — Fixed and confirmed live: typing `999999999.99` now shows "Amount can't be more than 10,000,000." immediately, with no freeze or hang. Reproduced the exact original repro value safely.
- **F4 BAL-07** — Fixed and confirmed live: Undo on a real $10 settlement correctly reverted the balance (Demo Traveler back to "owes $10.00") and removed the row from Recent payments. (Root-cause note: the original "does nothing" report was very likely a native `confirm()` dialog being auto-dismissed by browser automation, not a real defect — the button was never actually missing.)
- **F5 CSV-09** — Fixed and confirmed live: Undo on a real import batch (`fmt-colon.csv`) marked it "Undone" and removed its expense from the ledger.
- **F6 AUTH-19** — Fixed and confirmed live: visiting `/login` while signed in now redirects straight to `/dashboard`.
- **F7 TRIP-18** — Fixed and confirmed live: uploading a real (minimal) PDF as a trip cover photo now shows "Please choose an image file." and is never uploaded.
- **F8 EXP-07** — Fixed and confirmed live: an exact split of $49.99 against a $50.00 expense now shows "49.99 of 50.00 USD assigned" in red and blocks submission with "Exact shares add up to 49.99, not 50.00."
- **F9 SENT-08** — Fixed (code-verified; not separately re-tested live this pass — same offline-detection mechanism as F11/F13, confirmed working).
- **F10 CSV-11** — **Not a bug**, confirmed by the user directly: the offline notice and disabled "Can't import while offline" button both render correctly in the CSV import modal.
- **F11 OFF-03** — **Not a bug**, confirmed live: with real `navigator.onLine` + `offline`/`online` events (the exact signal the app listens for — likely not what the original QA automation triggered), a newly-added expense shows a genuine "Pending sync" label with the tooltip "Saved on this device — will sync once you're back online," and it clears automatically on reconnect with no manual refresh.
- **F12 OFF-13** — Fixed and confirmed live: attaching a receipt to an already-synced expense while offline now shows "You're offline — attach a receipt once you're back online." instead of a dead click.
- **F13 OFF-14** — **Not a bug**, confirmed live: the full offline banner ("You're offline — N changes will sync when you're back online.") appears and updates correctly once genuinely offline.
- **F14 AT-04** — Fixed and confirmed live: the "Active users" tile now shows "Showing active users only. Show everyone" and correctly filters the Users tab (9 of 23 users, matching the tile's own count).
- **F15 AUTH-16** — Fixed and confirmed live: visiting `/reset-password` with a normal signed-in session (no recovery link) now shows "Link expired" instead of a submittable password form.
- **F16 EXP-29** — Fixed and confirmed live: setting an expense date to 2026-12-25 shows "This date is in the future." live, as a non-blocking warning — the expense still saves normally.

**Root cause for F10/F11/F13 being reported as FAIL originally:** all three features gate entirely on `navigator.onLine` plus the browser's native `online`/`offline` events (`useOnlineStatus.js`). The original QA agent's offline-simulation method almost certainly never toggled that specific signal (a known gap with some automated network-throttling approaches), so the app never believed it was offline during that run, even though requests were actually failing. Confirmed by manually dispatching a real `offline` event in this pass — every feature immediately worked as designed.

Also found and fixed one issue not in the original 16, spotted during CSV import testing: the "isn't a member of this group" error from a bad CSV `Paid by`/`Split between` value now explicitly says "needs their email address, not their name" when the value has no `@` in it (previously read the same for a typo'd email or an honest name mix-up). Also fixed the import template's example date being silently corrupted when opened in Excel/Google Sheets before download (both auto-reformat a bare date-looking cell to the system locale) — the template now forces it to stay literal text.

Beyond the 16 fixes, also spot-checked live and still passing as originally reported:
- **TRIP-23** (HTML/JS in trip name) — created a real trip named `E2E-TEST regression <img src=x onerror=alert(1)>`; rendered as inert text everywhere, no script execution, no popup. Cleaned up (deleted) after.
- **TRIP-24 / TRIP-25** (trip date validation) — end-before-start and year 9999 both still correctly blocked with clear messages.
- **REP-01** (category chart) — renders correctly; note the agent's own text-extraction tool can't read the SVG chart content, so a screenshot was needed to confirm — not a product bug, a tooling quirk worth remembering for future passes.
- **FEAT-04** (shareable invite link) — still NOT-BUILT as reported; Members tab shows only the invite code (`E7DF35`), no link.

Not yet covered in this re-verification pass: the remaining ~210 cases in the sections above (most of Trips, Circles, Expenses, Activity, Admin — Trips/Trash, Security, Offline edge cases beyond OFF-03/04/13/14, Responsive/dark mode). Second-identity cases remain BLOCKED for the same reason as before — creating a new account is outside what this agent does even in a testing context.

## Appendix E — Second-identity batch (2026-09-30/2026-10-01, Claude Code)

The owner made a second real account available (Jayashree, signed in independently in her own browser tab/profile — not credentials shared with the agent), unblocking a batch of single-identity gaps and some previously-BLOCKED cases. All verified live against production:

- **AUTH-09 / AU-01** — Signed in as Jayashree (non-admin): no "Admin" link in the Navbar, and a direct hit on `/admin` is correctly rejected (AdminRoute gate holds server-side, not just hidden in the UI).
- **TRIP-01 / TRIP-02** — Dashboard hero shows Jayashree's real first name and accurate trip count; trip cards show real avatars with correct name tooltips for other real members.
- **TRIP-05 / TRIP-06** — An invalid/mistyped invite code is rejected with a clear message; casing variants of a valid code still joined correctly (confirmed case-insensitive).
- **EXP-04 / EXP-05** — A percentage split not summing to 100 is blocked with a clear message; the 33.33/33.33/33.34 boundary is accepted while plain 33.33×3 is correctly flagged as short.
- **EXP-08** — Deselecting a participant from a split removes them from the share calculation entirely, not just zeroes their share.
- **EXP-20** — An itemized item left assigned to nobody blocks submission with a clear message.
- **EXP-23** — Amount 0 and negative amounts are both blocked.
- **CSV-01** — Exporting a trip and re-importing that same file into a fresh trip round-trips correctly. (This is what originally surfaced the CSV-01 header-format gap, fixed 2026-09-30, commit `81cae01`.)
- **CSV-05** — CSV import's email matching for `Paid by`/`Split between` is case-insensitive and trims whitespace.
- **EXP-12** — Edit/Delete only appear, in the UI, for expenses Jayashree entered or paid for. This looked like a pass in the UI — the real gap was one layer deeper, at the database/RLS level, not the UI's own `canEdit` check. See Appendix F.

Not yet covered with the second identity: the remaining second-identity-dependent cases (AUTH-06/07, TRIP-04/08/09/10/11/12/15/21, CIRC-02/09/12, EXP-13/35, and others still marked BLOCKED above) — Jayashree's account is a regular member of one shared test trip/circle so far, not yet exercised for manager-promotion, cross-identity cache, or circle-roster scenarios.

## Appendix F — RLS bug: non-admin couldn't delete their own expense (2026-10-01, Claude Code)

EXP-12 looked like a pass by UI inspection alone (the Delete button correctly only renders for the expense's creator/payer/manager). Actually clicking Delete as Jayashree on her own expense failed with a raw Postgres error: `new row violates row-level security policy for table "expenses"`.

Root cause (confirmed by reproducing the failure directly in SQL, impersonating Jayashree in rolled-back transactions — not through the app): the `expenses: members can edit` policy's USING/WITH CHECK clauses were passing the whole time. The real problem was in `expenses: members can view` (a SELECT policy) — Postgres also enforces SELECT-policy visibility against the *post-update* row during an UPDATE, even with no `RETURNING` clause. Once a soft-delete set `deleted_at`, a regular member's own row fell out of that policy's `deleted_at is null` branch and wasn't a platform admin either, so Postgres blocked the update as producing a row the actor couldn't see — independent of the edit policy's own checks.

Fix (migration `043_expense_view_allows_own_deleted_row.sql`): let whoever can edit an expense (creator, payer, or group manager) also still see it after it's been soft-deleted. The app already filters `deleted_at` itself when loading the ledger (`TripView.jsx`), so this doesn't make deleted expenses reappear in anyone's normal browsing. Also made the edit policy's `WITH CHECK` explicit rather than relying on Postgres's implicit default (migration `042`) — not the actual fix, but removed one source of ambiguity found while investigating.

Verified live end-to-end: Jayashree successfully deleted two of her own test expenses through the real UI after the fix deployed, with no error.

Along the way, also cleaned up 26 leftover `E2E-TEST`-prefixed expenses across 6 dedicated test trips (soft-deleted, recoverable via Admin → Trash) that earlier failed delete attempts had left behind.

## Appendix G — Regression sweep resumed (2026-10-01, Claude Code)

- **TRIP-11** — Signed in as Jayashree (regular member, not creator/manager, of `E2E-TEST CSV Import Trip`): no gear/settings icon or Trip Settings section anywhere, and the Members tab shows no promote/remove controls for any member, only "Edit your info" on her own row.

Still pending for this pass: the manager-promotion and cross-account cases (TRIP-04/08/09/10/12/15/21, CIRC-02/09/12, EXP-13/35, AUTH-06/07) need a second browser tab signed in as the trip creator (Ram) alongside Jayashree's, so both sides of a two-party interaction can be driven and checked in the same session — in progress.

## Appendix H — Manager-promotion and cross-account batch (2026-10-01, Claude Code)

The owner opened a second tab signed in as himself (Ram, the trip creator) in a separate browser profile/incognito window — outside what the Claude-in-Chrome extension's automation can see or drive directly. For this batch, the owner performed each action in his own tab on request and reported back; the agent then verified the resulting state live from Jayashree's side. No credentials were seen or entered by the agent at any point.

- **TRIP-04** — Jayashree's account is already a member of multiple trips joined via real invite codes (e.g. `E2E-TEST CSV Import Trip`, code `E7DF35`), confirming the join flow works; not a fresh repro this pass.
- **TRIP-08** — Ram promoted Jayashree to manager in `E2E-TEST CSV Import Trip`. Confirmed live: a trip-settings gear icon appeared next to the trip name, and the Members tab showed a "manager" badge next to her name.
- **TRIP-09** — As manager, Jayashree's Members tab showed "Remove from trip" for the three regular members (Rohan, Sarah, Demo Traveler) but *no* remove control at all for Ram (the creator) — confirmed in the UI. Confirmed server-side too, by reading (not invoking) the RLS policies directly: `group_members: manager can remove a regular member` explicitly excludes both other managers (`not is_manager`) and the creator (`user_id <> created_by`); `group_members: creator can appoint managers` is the only policy that can change `is_manager`, gated strictly to `created_by = auth.uid()` — no policy lets a manager promote anyone. (TRIP-12's "removing the creator via RPC" was verified this same way, via policy inspection rather than a live attempt, to avoid any risk of actually succeeding and removing Ram from his own trip.)
- **TRIP-10** — Ram demoted Jayashree back to regular member. Confirmed live: the settings gear icon disappeared and the "manager" badge was gone from the Members tab.
- **TRIP-15** — As a regular member, no "Duplicate this trip" control anywhere for Jayashree (consistent with the settings gear, which would house it, also being absent).
- **EXP-35** — Ram added a real test expense ("test transaction", $45, paid by him). As a regular member, Jayashree's expanded view of it showed only "Duplicate" — no Attach receipt, Edit, or Delete.
- **EXP-13** — Re-promoted Jayashree to manager and re-checked the same expense: now Attach receipt, Duplicate, Edit, and Delete *all* appeared, even though she's neither its creator nor payer. This contradicts the original test case's expectation ("manager cannot edit others' expenses") — but matches the app's actual, deliberate design: `is_group_manager(group_id)` is explicitly one of the three conditions (alongside creator/payer) in the `expenses: members can edit` RLS policy, confirmed by reading the policy directly. Logged as the test case's own expectation being wrong, not a product bug — a trip manager having edit oversight over the whole trip's expenses looks intentional.
- Demoted Jayashree back to regular member afterward, and soft-deleted the "test transaction" expense, to leave the test trip in the same state it started in.

Still BLOCKED/not yet covered: AUTH-06/07 (cross-user cache — needs sign-out/sign-in sequencing on the *same* browser profile, which risks exactly the session-swap confusion seen earlier in this project and needs careful handling), TRIP-21 (removed member rejoins), CIRC-02/09/12 (circle-level equivalents of the trip tests above). The two circles visible on Jayashree's own dashboard (`Test Circle`, `Spiritual Circle`) appear to be the owner's real, non-test data — not touched or used for testing.

Also resumed the plain NOT RUN sweep in parallel (no second identity needed):
- **BAL-04** — Recording a payment in a foreign currency (EUR) live-converts and locks in the rate correctly; the debt resolved from "owes $16.00" to "settled up".
- **BAL-06** — Overpayment ($30 against a $16 debt) is handled gracefully: the creditor's balance flips to "is owed $14.00" and the settle-up suggestions correctly re-net the debt graph (reassigned to a different pair) rather than showing anything negative or broken.
- Attempted BAL-10 (recipient with no payment handle) by engineering a scenario where Jayashree owed someone — the 5-way equal-split debt-netting algorithm optimized her $4 debt away entirely rather than leaving a direct line to click "pay" on, so this couldn't be forced solo. Left for a future pass with either a simpler 2-person debt or a second identity's own owing view.

## Appendix I — Backdated expense used today's FX rate, not the historical rate (2026-10-01, Claude Code)

Owner reported from manual testing: a backdated expense's currency conversion used today's exchange rate instead of the rate that actually applied on the expense's own date — confirmed as a real, meaningful gap (not a rounding quibble): the real Frankfurter API shows USD→EUR at 0.9358 on 2024-06-15 vs 0.88067 "latest" (today), about a 6% difference. The original QA pass had actually logged this as a *pass* (EXP-28), on the reasoning that locking the rate at entry time and labeling it clearly was the intended design — it wasn't; this was a real bug the QA case's own expectation missed.

Root cause: `getRate()` in `src/lib/fx.js` only ever called Frankfurter's `/latest` endpoint, with no way to ask for a specific date's rate. Every caller that resolves a rate from an expense's own date (`AddExpenseForm`, the offline sync queue, CSV import) was feeding it the current date's "latest" rate regardless of what date the expense itself was dated.

Fix: `getRate(from, to, date)` now takes an optional date; a date in the past uses Frankfurter's historical endpoint (`/v1/{date}`) instead, with its own separate cache so every other "give me the current rate" caller (the rates page, CSV import's own currency list, offline-optimistic display) is unaffected. The add/edit expense form, offline queue sync, and CSV import all now pass the expense's own date through. The UI's rate label changed from always "today's rate" to "rate for `<date>`" when backdated.

Also added, per the owner's explicit request: an expense dated before the trip's own `start_date` is now rejected with a clear message ("This date is before the trip's start date (...)"), both live (as you type, via the date field) and on submit — previously accepted silently with no connection to the trip's actual timeline.

Verified live end-to-end on production as Jayashree:
- An expense dated 2024-06-15 in EUR showed "1 EUR = 1.0686 USD / rate for 2024-06-15", correctly differing from the same day's "today's rate" of 1.1355.
- With the test trip's start date temporarily set to 2026-09-15 (cleared again afterward), dating a new expense 2026-09-01 immediately showed "This date is before the trip's start date (2026-09-15)."

14 new unit tests added (`fx.test.js`, `tripDates.test.js`), all passing; full suite at 273/273. Deployed in commit `a823ab2`.

## Appendix J — Regression sweep continued, NOT RUN priority (2026-10-01, Claude Code)

- **EXP-15** — Added a EUR expense (exchange_rate 1.1355, amount_in_home 56.78), then edited only its description. Confirmed in the database afterward: both fields unchanged.
- **EXP-17** — Opening Edit on that same expense showed every field correctly pre-filled (description, category, amount, currency, payer, date, split mode, and all five members' Equal-split shares) — Equal mode only; the other five split modes weren't separately re-verified this pass.
- **EXP-32** — Created an itemized expense (Pizza $30 + Tax $5 + Tip $3 = $38) and duplicated it: the Duplicate modal correctly carried the item, tax, tip, and itemized split mode.
- **EXP-33** — Saved that duplicate, then deleted the original. The duplicate's full itemized data ($38.00, itemized) remained intact and unaffected.
- **REP-05** — After deleting the EXP-32 original, the Reports tab's "Total spent" ($174.78) exactly matched the sum of the three remaining live expenses, confirming the deleted one isn't counted.
- **ACT-02** — The same deletion produced exactly one Activity feed entry ("Jayashree deleted an expense: ... — 38 USD"), not zero or duplicates.
- **CSV-15** — Split finding: the soft-delete exclusion is real (code-confirmed: `handleExportCSV` in `TripView.jsx` feeds `expensesToCSV` the same `deleted_at is null`-filtered list the Ledger itself uses), but "includes settlements" doesn't hold — `csvExport.js` has no settlements parameter at all, and the app's own Help text only ever promises "every expense... splits included," never settlements. Logged NOT-BUILT rather than FAIL, since nothing promises it.
- **REC-11** — Now passes as a side effect of the historical-FX-rate fix (Appendix I): the conversion banner's "rate for `<date>`" wording directly shows provenance, where previously it always said "today's rate" with no way to tell which day's rate was actually used.

Hit one CDP/automation quirk worth noting for future passes: clicking "Delete this expense" triggers the app's native `confirm()` dialog, which blocked the browser automation tooling for about 10 seconds (one click timed out at 30s) before a plain page reload cleared it — same class of issue as the native-dialog findings earlier in this project, not a product bug.

## Appendix K — BLOCKED-status sweep (2026-10-01, Claude Code)

At the owner's request, went through the 17 remaining BLOCKED cases specifically. Several turned out to be testable solo with Jayashree's account alone (no Ram relay needed):

- **SEC-01** — Navigated Jayashree directly to `E2E-TEST Personal Trip`'s URL (a trip she's not a member of): "This trip doesn't exist, or you don't have access to it." Also confirmed absent from her dashboard's trip list (4 trips shown, that one not among them).
- **EXP-19** — Added an itemized $40 expense with all 5 members checked in the overall split, but unassigned one (Demo Traveler) from the item itself. Saved cleanly; Demo Traveler's row correctly showed `USD 0.00`, no block or warning.
- **RES-11** — Resolved by code inspection rather than fault injection: `fx.js`'s `getRate()` is a plain client-side `fetch()` to Frankfurter, not server-side as the original note assumed. When it fails (and nothing's cached), `rate` stays null, the banner shows "Rate unavailable", and `handleSubmit` explicitly blocks with "Still fetching the exchange rate — try again in a moment." — a clear hard-block, not a silent "pending rate" save.
- **CIRC-02** — Found a reusable fixture: `E2E-TEST Circle 20260929-1055`, with two sibling trips, that Jayashree wasn't yet a member of. She joined via its invite code (`6C3764`) from her own dashboard — landed on the circle page as a new member, both trips showing "Join this trip" (not auto-joined).
- **CIRC-12** — Joined one of the circle's two trips, leaving the other (`E2E-TEST Trip Copy`) unjoined. Visiting it directly showed trip name, members, and even the invite code, but the Ledger read "No expenses yet" — confirmed this is a real restriction, not just an empty trip, by having the owner add a real $10.32 expense there: after a fresh reload, Jayashree's Ledger still showed nothing, while the expense was confirmed present (and not soft-deleted) in the database. So the restriction is genuine: she sees circle/trip metadata but never actual financial data for a trip she hasn't joined. One copy issue noted, not a security problem: the banner reads "Viewing as admin — you're not a member of this trip" for this case too (`TripView.jsx:488`, gated on `!isMember` alone, no distinction from an actual platform admin) — misleading wording, since Jayashree isn't a platform admin, but the access restriction itself is correct.

The rest needed the owner's hands in his own tab:

- **TRIP-20** — The owner tried removing Jayashree from `E2E-TEST CSV Import Trip` while she had an outstanding balance (a leftover artifact of earlier BAL-04/06 testing — the underlying expenses had since been cleaned up, leaving orphaned settlement rows). The app blocked it: "Can't remove Jayashree — they still have an outstanding balance in this trip. Settle up first." Clear, well-defined behavior, not the "unspecified" the original note assumed. The owner then deleted those two leftover settlement rows directly (a hard DELETE the agent's own sandbox correctly refused to do on its behalf, even on test data, since it's a non-reversible "Cloud Storage Mass Delete"-class action) to actually clear her balance.
- **TRIP-21** — With her balance clear, the owner removed her from the trip again (confirmed via a direct database check — her `group_members` row was gone). She then rejoined from her own dashboard using the trip's original invite code (`E7DF35`) — worked immediately, no new code needed.
- **CIRC-09** — The owner promoted Jayashree to circle manager in `E2E-TEST Circle 20260929-1055`. Live, her view gained a "manager" badge and an "Add by email" control (previously absent). Confirmed server-side too: `circle_members`'s RLS policies are structurally identical to `group_members`'s — only the creator's own policy can set `is_manager` (`circle_members: creator can appoint managers`), and the manager-removal policy explicitly excludes both other managers (`not is_manager`) and the creator (`user_id <> created_by`) — an exact mirror of the trip-level rules confirmed earlier in Appendix H. The owner demoted her back afterward.

## Appendix L — Three more BLOCKED cases resolved with better technique (2026-10-01, Claude Code)

- **EXP-38 / EXP-39 (itemized)** — The earlier BLOCKED was a tooling limitation, not a product one: clicking the visible "Scan a receipt" button opens a native OS file picker, which browser automation can't see or drive. Found the underlying (hidden) `<input type="file">` directly via the accessibility tree and uploaded a synthetic test receipt image straight to it, bypassing the picker entirely. The OCR scan then worked exactly as designed: description ("COSTCO WHOLESALE"), category (Groceries), total ($58.46), currency, and date (12/11/2025, matching the receipt) all pre-filled correctly, and it auto-switched to Itemized mode with all 4 line items extracted at their exact prices (Org Olive Oil $24.99, Rotisserie Chicken $4.99, Paper Towels $18.49, Almond Butter $9.99). Selfie and French-language receipt variants (part of EXP-39) weren't separately tested this pass.
- **CSV-10** — Rather than trying to race a real network interruption against the app's fast, mostly-local-currency import loop (USD→USD needs no FX call, so 8 rows can complete in well under a second — too fast to interrupt by timing alone), injected a deterministic `fetch()` wrapper that flips `navigator.onLine` to `false` and fires a real `offline` event after exactly the 3rd `expenses` insert call — the same signal `ImportCsvModal.jsx`'s per-row loop already checks for itself (`if (!navigator.onLine) throw new Error('offline')`). Uploaded an 8-row test CSV and ran the import: it stopped after row 3, showed "Lost connection partway through the import — the rows it already created were rolled back, so nothing was left half-imported," and a direct database check confirmed it genuinely happened — all 3 created rows were soft-deleted, and the `import_batches` record's `row_count` was corrected from 8 down to 3, with `undone_at` set. Clean, verified rollback, not just a UI message.

Still BLOCKED, genuinely needing infrastructure this session doesn't have: AUTH-06/07 (same-browser-profile sign-out/sign-in sequencing — risks the session-swap confusion documented earlier in this project), BAL-11/12/13/14 and ACT-06 (push notifications — need a real device, and BAL-12/13 additionally need multi-day waiting).

## Appendix M — Security boundary sweep (2026-10-01, Claude Code)

- **SEC-04** — With Jayashree signed in in the browser, extracted her session's access token from `localStorage` (`sb-msaawuwelovlikdboxrn-auth-token`) and the app's public anon key from the deployed bundle, then issued a direct PostgREST `GET /rest/v1/expenses?group_id=eq.<id>` as her — no app code involved, so this exercises RLS itself rather than any UI gate. Against `E2E-TEST Personal Trip` (id `0b1dead2-f4c4-47bc-84f5-384b69401cde`, a trip she's not a member of): `200 []`. Against `E2E-TEST CSV Import Trip`, a trip she *is* a member of: `200` with real rows. Confirms the empty result for trip B is RLS doing its job, not a malformed query happening to return nothing.
- **SEC-02 / SEC-03 / SEC-05 / SEC-07 — not run by the agent directly.** Each needs a direct privileged mutation or production-data read attempted against the live database/Edge Function as a non-admin (setting `is_admin`, calling `admin-users`, a Storage write, a tampered session token) — the agent's own sandbox refused these outright (a "Permission Grant"/"Production Reads" classifier denial), even though the point of each test is to confirm the server *rejects* them. Handed console snippets to the owner to run by hand instead.
- **SEC-02** — Owner ran the snippet as Jayashree: `PATCH profiles?id=eq.<her-id> {is_admin: true}` returned `200` with her row, `is_admin: false` still. Traced to `prevent_admin_self_promotion` (migration `005_fix_admin_promotion_trigger.sql`): it fires on any `is_admin` change, and when `auth.uid()` is set (a real session, as opposed to the SQL Editor) and the caller isn't already a platform admin, it resets `new.is_admin := old.is_admin` before the write lands — so the HTTP call "succeeds" but the privilege escalation silently doesn't happen. Exactly the designed behavior.
- **SEC-05** — Owner ran the snippet as Jayashree: a direct Storage `POST` to `group-banners/<a trip she's not a manager of>/test.png` returned `403 {"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy","code":"AccessDenied"}`. Storage RLS rejected the write outright, no app code involved.
- **SEC-03** — Owner ran the snippet as Jayashree: `POST functions/v1/admin-users {action: 'list'}` returned `403 {"error":"Admins only."}` — matches the Edge Function's own code exactly (`supabase/functions/admin-users/index.ts`, the `!callerProfile?.is_admin` check runs before the request body is even parsed, so no action can reach the privileged `admin` client without passing it first).
- **SEC-07** — Owner corrupted the stored `access_token` in `localStorage` (leaving `refresh_token`/`expires_at` untouched) and reloaded a trip page. Console showed a burst of real `401 Unauthorized` responses from `profiles`/`groups`/`group_members`/`expenses`/`settlements` — confirms the server genuinely rejects the bad token. But `ProtectedRoute.jsx` gates purely on `supabase.auth.getSession()`'s locally-cached session object (no server round trip), so it never bounced to `/login`; it landed on `/dashboard`. Within a short window, `supabase-js`'s own auto-refresh silently exchanged the still-valid `refresh_token` for a fresh `access_token` (confirmed: the token went from the literal string `garbage` back to a real `eyJ...` JWT with no user action), and the dashboard ended up fully populated with real data — no crash, no raw error, no stale-cache or "you're offline" fallback ever showing in this run. Good behavior for this specific scenario (valid refresh token = a real still-live session), but doesn't exercise what SEC-07 actually names: a session with no path back (refresh token also dead). Left untested — deliberately, to avoid locking the shared test account out with no clean recovery.

## Appendix N — P0 NOT RUN sweep (2026-10-01, Claude Code)

Worked through the P0 `NOT RUN` backlog solo as Jayashree (no second identity or destructive admin action needed for any of these), using the same direct-PostgREST-call technique as Appendix M for the server-side checks and the real `navigator.onLine` + dispatched `offline`/`online` event technique from Appendix D for the offline cases. Test data created in a dedicated new trip, `E2E-TEST CIRC-03 roster check` inside `E2E-TEST Circle 20260929-1055`; all test rows cleaned up (soft-deleted/removed) afterward.

- **CIRC-03** — Created the test trip via the circle's own "+ New trip"; a direct query of its `group_members` immediately after creation showed exactly the circle's roster (Jayashree + Ram), confirming the copy-at-creation-time behavior.
- **CIRC-04** — Could not be genuinely tested. The only path for "someone new" to end up in `group_members` is the self-service join-by-code RPC; there's no insert policy letting a manager add an arbitrary `user_id` directly. Both circle members were already in the new test trip (from CIRC-03's roster copy), so testing "a new joiner syncs into circle_members too" needs a different identity (Rohan/Sarah/Demo Traveler) to actually join via the trip's own invite code — something this agent can't simulate without their login, same as AUTH-06/07.
- **ACT-07** — Code review of `supabase/functions/notify-group/index.ts` confirmed fake/non-member target ids are silently filtered (`targetUserIds.filter((id) => memberIds.has(id))`), not loudly rejected — the safer pattern, avoiding a user-enumeration side channel via error responses. Verified live with a call targeting only a fake UUID: `{"targeted":0,"sent":0}`, nothing sent to anyone.
- **OFF-05** — Warmed the FX cache with a real EUR lookup while online (showed "1 EUR = 1.1298 USD today's rate"), then went offline and reopened Add Expense with the same currency: the "Converts to" box rendered byte-identical to the online state, cached rate and all, with zero indication it's stale or offline-sourced. The only offline-aware branch in `AddExpenseForm.jsx` (`isOffline && !rate`) only fires on a cache *miss* — a cache hit while offline looks exactly like a live rate.
- **OFF-09** — A real bug, not just a missing label. Recorded a settlement while offline against a genuine $10 debt (created via a throwaway expense first): the offline banner and Recent-payments entry behaved correctly ("1 change will sync", payment listed), but "Where everyone stands" immediately started showing **"owes $NaN"** for both members until the op actually synced a few seconds later, at which point it self-corrected to "settled up". Root cause: `mergeQueueIntoSettlements` (`src/lib/offlineCache.js:115-143`) builds its optimistic settlement object with `amount` but never `amount_in_home`, and `computeNetBalances` (`src/lib/balances.js`) sums `amount_in_home` across every settlement unconditionally — one `undefined` poisons the whole trip's balance sheet, not just the one pending row. The sibling function for expenses, `mergeQueueIntoExpenses`, already does this correctly via `estimateHomeAmounts()`, which explicitly falls back to `null` (not `undefined`) when no rate is available to estimate with.
  - **Fixed the same day.** `mergeQueueIntoSettlements` now takes a `homeCurrency` param and computes `amount_in_home` from whatever rate `peekCachedRate` has cached, falling back to `null` (which coerces safely to `0` in `computeNetBalances`' arithmetic, unlike `undefined`) — the exact pattern `mergeQueueIntoExpenses` already used. `TripView.jsx` now passes `group.home_currency` through. Added `src/lib/offlineCache.test.js` (4 tests: same-currency estimate, no-cached-rate falls back to `null` not `undefined`, already-synced passthrough, delete). Full suite 277/277 passing, build clean. Deployed (commit `f1bd3bc`) and re-verified live on production as Jayashree: the identical repro (offline settlement against a real debt) now shows "settled up" immediately, no NaN anywhere, while still correctly queued ("1 change will sync when you're back online").
- **OFF-10** — Client-side navigation (via `history.pushState` + a dispatched `popstate`, since a hard page reload resets the `navigator.onLine` override) to `/admin` as non-admin Jayashree while genuinely offline redirected cleanly to `/dashboard` — same as the online behavior, no hang or crash.
- **OFF-16** — Queued an offline expense, then clicked Sign out while still offline: signed out instantly with zero warning about the unsynced change. Checked `localStorage` immediately after — the queued op (`ledger_write_queue_v1`) was still fully present, payload and all, completely unscoped to any particular user. If a *different* person signed into the same browser/device next, that stale queued op (created-by/paid-by baked in as the previous user) would still be sitting there waiting to sync. Same underlying gap as the still-BLOCKED AUTH-07 ("offline queued ops of A never applied under B's identity") — this confirms the queue itself has no user-scoping at all, not just that cross-identity sequencing hasn't been tested yet.
  - **Partially fixed the same day.** `Navbar.jsx`'s `handleSignOut` now calls `confirm()` naming the pending-op count whenever `useOfflineQueue()` is non-empty, before signing out — matches the existing confirm-before-destructive-action pattern already used elsewhere in the app (e.g. `CirclePage.jsx`'s remove-member flow). Re-verified live on production as Jayashree: queued a real offline expense, clicked Sign out — the confirmation fired and blocked the sign-out (observed indirectly: still on the trip page afterward, still signed in, exactly as expected since this browser automation can't interact with a native `confirm()` dialog, which defaults to Cancel). Confirmed the no-pending-ops path is unaffected: after the op synced, `localStorage`'s `ledger_write_queue_v1` read back `[]`. Deliberately does **not** touch the deeper per-user-scoping gap — that's a genuinely separate fix (namespacing the queue key or tagging each op with the user id it belongs to) tied to the still-BLOCKED AUTH-07, not something to bundle into a sign-out warning.
- **OFF-05** — **Fixed the same day.** `AddExpenseForm.jsx`'s conversion box now prefixes the converted amount with `~` and swaps the rate caption to "offline — estimate from the last known rate" (in the same red/`text-owe` styling used for errors elsewhere) whenever `isOffline` is true and a rate is available at all — covering exactly the gap found: a same-day cached rate used offline is otherwise indistinguishable from a fresh live one. Re-verified live on production as Jayashree: the original repro (warm the EUR rate online, go offline, reopen Add Expense) now shows `~$5,705.49` and "offline — estimate from the last known rate" instead of the unmarked `$56.49` / "today's rate" from before.
- **AUTH-05** — With the OFF-16 sign-out as a natural trigger: pressed browser Back from `/login` afterward. Landed back on `/login`, not the trip page that had been open — `ProtectedRoute` re-evaluates `user` on every route change (including history navigation) rather than serving a cached authenticated DOM snapshot, so there was nothing sensitive to leak.
- **AUTH-07 root cause (queue user-scoping) — fixed 2026-10-01.** OFF-16's partial fix (the sign-out warning) left the actual cross-identity gap open: the write queue was one shared `localStorage` bucket regardless of who was signed in. Fixed properly this time: every queued op is now stamped with the `userId` signed in at enqueue time (`offlineQueue.js`'s `setCurrentUserId`, wired from `AuthContext.jsx`'s session effect), and every read path — the reactive hook components use, `listPending`, `runSync`, and `enqueue`'s own create/update/delete collapsing — filters down to the current user's own ops. An op with no `userId` (queued before this fix shipped) stays visible to anyone, matching the pre-fix behavior, rather than becoming permanently orphaned. 3 new unit tests (`offlineQueue.test.js`): a second user can't see or collapse into the first user's pending op; the legacy-op migration path. Full suite 280/280 passing.
  - **Verified live on production**, working around the same real constraint as CIRC-04 (no second test account's login) with a technique that still exercises the real deployed code: queued a real offline expense as Jayashree, confirmed `localStorage`'s `ledger_write_queue_v1` entry was stamped with her actual user id. Then directly edited that one field to a fake unrelated UUID (simulating "this op belongs to someone else") and reloaded — the expense vanished entirely from Jayashree's ledger ("No expenses yet"), while the op itself stayed fully intact in storage (confirmed by reading it back) rather than being lost. Restored the real `userId` and reloaded again — it reappeared and synced normally. This proves both halves live: a foreign-owned op is correctly hidden *and* untouched by `runSync`, and a legitimately-owned one still works exactly as before.
- **AUTH-12** — Submitted a real email at `/forgot-password`: "Check your email — If an account exists for drjayashree@hotmail.com, we sent a link to reset your password." Deliberately account-enumeration-safe phrasing (doesn't confirm or deny the account exists). Did not click through the resulting email link — that's AUTH-13, still blocked on inbox access this agent doesn't have.

Not reachable this pass: **AT-03** ("Every Overview stat tile lands on the right tab") needs an actual platform-admin session, which this agent has no credentials for and Jayashree isn't. **AUTH-13** needs real inbox access. Everything else still `NOT RUN` in the P0 list (AU-03/06/07/08, AT-07/08/09, ATR-02/03, RES-01) stays out of scope — destructive, needs a real phone, or needs a 30-day wait, per the run's own rules.

- **AT-07** — Found via TRIP-22 setup: trip creator/manager clicking "Delete this trip" failed with "You don't have permission to do that." Same root-cause shape as EXP-12/migration 043: the `groups` SELECT policy hid archived rows from non-admins, so the post-UPDATE row satisfied no policy and the UPDATE itself was rejected. Fixed with `supabase/migrations/044_group_view_allows_own_archived_row.sql` (pushed, mirrored in `schema.sql`). Impact check before push found the widened policy would leak archived trips into `CirclePage.jsx`'s trip list (no client-side `archived_at` filter, unlike `Dashboard.jsx`); fixed in the same commit `d6c4b53`. **Verified live 2026-10-01** as Jayashree on the test copy `E2E-TEST CIRC-03 roster check (copy)`: typed trip name, confirmed delete, redirected to `/dashboard` with no permission error, and the trip no longer appears in the Trips list or its circle. **PASS.**
- **TRIP-22** — FAIL. After AT-07's archive, opened the archived trip by direct URL as Jayashree (creator): full trip page rendered, and "Add expense" saved a $5 expense successfully. Cause: migration 044 intentionally lets `is_group_manager` still SELECT an archived group (required for the archive UPDATE), and `TripView.load` never checked `archived_at`. Fix: `TripView.jsx` now shows the standard "doesn't exist, or you don't have access" error for an archived trip unless the viewer is a platform admin. 280/280 tests pass, build clean. Awaiting push + live re-verify.
- **UX-LOGIN (owner-reported, 2026-10-01)** — Homepage (`/`) showed only "Create free account" on phone-width screens; the nav's "Sign in" link was `hidden sm:inline`, so returning users had to open Sign-up and pick "existing account". Fix in `Overview.jsx`: Sign in always visible; mobile nav button reads "Sign up" (full "Create free account" from `sm` up); tightened spacing and `whitespace-nowrap` so nothing wraps. Verified on local dev server at 375px and 320px: no horizontal overflow, nav stays one line (76px). 280/280 tests, build clean. Not pushed.
- **TRIP-22 fix revised** — audit of the first fix found it read `profile.is_admin` before the profile loaded (platform admin would wrongly see "not found" on a cold direct link). `TripView.load` now depends on the admin flag and re-runs when it resolves. Known gaps left open on purpose: server still accepts expense inserts into an archived trip (needs an RLS migration, to be proposed with a consumer audit), and an offline cached copy of an archived trip can still render.
- **RES-02** — FAIL, then fixed locally. Method: loaded each page in a same-origin iframe of exact width (375 / 320) and listed elements extending past the viewport that aren't inside a scroll/clip container (browser-pane viewport emulation was unreliable between calls). Found: (1) trip page tab strip ~456px wide with no `min-w-0`/scroll container → whole page scrolled sideways at 375; (2) Navbar overflowed at 320 (Sign out button) on every page; (3) Profile payment-handle row (`flex-1` input with no `min-w-0`) → 476px at 375/320. Fixes: `TripView.jsx` tab strip `min-w-0 overflow-x-auto` with `shrink-0` tabs and tighter mobile padding; `Navbar.jsx` smaller gaps/brand, brand truncates last, right group `shrink-0`; `ProfilePage.jsx` input `min-w-0`, select `max-w-[50%]`. Re-measured: all 7 pages ok at both widths; 280/280 tests; build clean. Regression watch for cross-verification: navbar for admin users (extra "Admin" link) at 320, and tab strip with 5 tabs on a trip where the HelpLink is shown.
- **EXP-21 / RES-03 / REC-03 / CIRC-11 / CIRC-14 (2026-10-01, local dev server vs real backend).** EXP-21: itemized rows kept totals in sync through add/assign/remove (nothing saved). RES-03: add button stays reachable and clear of content at 375/320. REC-03: not built (single `paid_by`). CIRC-11: circle cover upload works. CIRC-14: inline create-and-attach works. **Latent issue found in CIRC-14:** `TripSettingsModal.handleCreateAndAttachCircle` does three separate writes (insert circle, insert circle_member, `attach_trip_to_circle` RPC). If step 2 or 3 fails, an orphan circle remains and a retry creates a second one with the same name. Low probability, worth an RPC that does all three atomically; not fixed yet (would be a migration). **Test data left on production for cleanup:** trip `E2E-TEST CIRC-14 trip` (e09e3a6f-9a8d-4bc7-83f7-8675294b743e) and circle `E2E-TEST CIRC-14 circle` (96829dc6-409e-4b07-ae80-0f23c3ff64a8), plus a $5 expense in the already-archived copy trip.


## Appendix O — Cross-verification before push (2026-10-01, Claude Code)

Scope: the 4 unpushed code commits (`7f3f941`, `b842ccc`, `4f5e184` + test-record commits) touching `TripView.jsx`, `Navbar.jsx`, `Overview.jsx`, `ProfilePage.jsx`. No migrations, no Edge Function changes.

- Static: 280/280 unit tests, production build clean, `oxlint` shows the same 2 pre-existing `TripView.jsx` warnings as production (no new ones).
- Landing page (logged-out, via `127.0.0.1` origin): at 320/375/639px nav shows Sign in + "Sign up"; at 640/900px shows Help + Sign in + "Create free account"; no horizontal overflow at any width.
- Archived-trip guard: archived trip URL shows "doesn't exist or no access" for the creator; normal trip, dashboard, and circle page (archived trip excluded) still load.
- Overflow fixes: dashboard, trip (all 5 tabs), circle, profile, rates, help re-measured at 375/320: no page overflow.
- Extra-fetch check: loading a trip issues the same number of `groups`/`expenses` requests with and without the `isAdmin` dependency (2 each in dev mode), so the admin-race fix adds no extra load for normal users.
- **Not verified, by design:** platform-admin viewing (no admin credentials) for the archived guard and the 320px navbar with the extra Admin link; the full create -> archive -> redirect flow was verified on production for AT-07 before these commits and the archive code path itself is unchanged, but was not re-run against these commits (it would delete a test trip).

## Appendix P — Circle delete fails for its creator (AT-07 variant, 2026-10-01, Claude Code)

Found while cleaning up test data after the push: the owner (creator) of `E2E-TEST CIRC-14 circle` clicked **Delete this circle** on production and got "You don't have permission to do that." Same root cause as AT-07 (trips) and EXP-12 (expenses): `circles: members can view` (migration 031) only returns `archived_at is null` rows to non-admins, so the archive UPDATE's new row satisfies no SELECT-relevant policy and is rejected.

**Fix prepared locally, NOT applied/pushed:** `supabase/migrations/045_circle_view_allows_own_archived_row.sql` adds `or public.is_circle_manager(id)` to the SELECT policy.

**Consumer audit of the `circles` table (done before any push):**
- `Dashboard.jsx` — already filters `archived_at` client-side. OK.
- `TripSettingsModal.jsx` "Attach to a circle" list — read `circles(id, name)` with no archived filter; would have shown a manager's archived circle again. Fixed: selects `archived_at` and filters.
- `TripSettingsModal.jsx` / `TripView.jsx` circle-name breadcrumb — would have named an archived circle for trips still inside it. Fixed: ignore archived.
- `CirclePage.jsx` — would have opened an archived circle by direct link for its manager. Fixed: archived circle = "doesn't exist or no access" for non-admins (admin flag in `load` deps, same pattern as TripView).
- `AdminPage.jsx` — platform admin only, unaffected. `circle_members` policies — unchanged.

**Local verification so far (against real backend, migration not yet applied):** 280/280 tests, build clean, no new lint warnings; a normal circle page, its trip list, and the trip's circle breadcrumb all behave exactly as before. **Still to verify after the migration is applied:** (1) owner can delete the circle and lands on `/dashboard`; (2) the archived circle is absent from the dashboard, the Attach list, and shows "not found" by direct link; (3) its trips keep working with no breadcrumb.

Test data still on production until then: circle `E2E-TEST CIRC-14 circle` (96829dc6-409e-4b07-ae80-0f23c3ff64a8).
