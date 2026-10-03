# Regression brief for the testing agent (written 2026-10-02, updated 2026-10-03)

Source of truth: `test-cases-2026-09-29.md` (mirrored to Google Sheet `1QHNnjMGCffXa4okRjHJXi9tn_WjywgLFrAwy6kiyZXk`, sheet `Cases`, E = Status, F = Evidence). Read `HANDOFF.md` first for rules.

## Rules
- App: production https://splitexpenses-app.vercel.app/ or dev `localhost:5183`. Test data prefix `E2E-TEST`; archive what you create.
- Never enter credentials, create accounts, or tap external payment links. Do not delete or archive anything through the UI without the owner's explicit OK in chat.
- Sign-in uses Cloudflare Turnstile, which the embedded pane browser fails. Work only in a session the owner has already signed in from real Chrome.
- Record results in both the md file and the sheet. Log every failure with steps, expected, actual, and a suggested layer for the fix. Do not fix and push; report.

## In scope for the agent
| Ref | Notes |
|---|---|
| RES-04 | Laptop-width layout, now including the new top navigation |
| BAL-10 | Needs one E2E-TEST trip with a member who has no payment handle |
| NAV-01..03 | Check light and dark mode, 375/320px, active-item highlight, breadcrumbs |
| INST-02 | Install card on Profile and Help |
| TOUR-02 | Checkbox persistence, Help replay, dashboard link (needs a signed-in account) |
| EXP-17, EXP-39 | Optional: the split types and receipt variants not yet covered |
| AT-09, ATR-03 | DONE 2026-10-03 (PASS). Do not repeat: the two eligible items were permanently deleted. |
| BAL-17..19 | NEW. Settlement summary: "Share summary" on Balances (debt trip, settled trip, copy/cancel/fail paths). A real desktop share dialog hangs automation, so stub `navigator.share` and `navigator.clipboard` in the page as the existing evidence did |
| EXP-40..45 | NEW. Amount calculator: typed sums, calculator keys, invalid text blocks Save, plain numbers unchanged, edit round trip, JPY rounding, Itemized unaffected |
| RES-09 | Re-run now that migration 055 is live (atomic save). Currently PARTIAL: no phantom expense any more, but the form still shows the raw "Failed to fetch" text (DEF-038). Test by patching `window.fetch` to throw after the `create_expense_with_splits` request goes out |
| TRIP-22 | Re-run for DEF-025 (migration 062): archive an E2E-TEST trip (owner OK), then try to add an expense from a tab that still shows the trip live. Expect "new row violates row-level security policy". Existing evidence is in `HANDOFF.md` |
| Regression of today's features | Exploratory, using E2E-TEST data: Admin > Usage (Overview with the Live now card and the clickable Active now tile, Funnel, Features, Devices, Stuck users) and the Device/Install filters; "View activity" on the Users tab and name links in Stuck users and Funnel; per-invite share links (`/join/<token>`) |

## Not for the agent (owner or phone)
- Real Chrome with Turnstile: AUTH-02, AUTH-04, SIGN-01, SIGN-02, TOUR-01
- Two accounts (normal plus incognito): AUTH-06, AUTH-07, CIRC-04
- Jayashree's console replay: AU-16, AU-19
- Throwaway account: AU-07, SEC-07
- Phone: RES-01, BAL-09, BAL-11, BAL-14, BAL-15, BAL-16, ACT-06, OFF-11, plus the new BAL-20, BAL-21 (share sheet on iPhone Safari and Android Chrome), EXP-46, EXP-47 (calculator keys on phones) and EXP-48 (offline add with a sum)
- Blocked: AUTH-11, 13, 14, 15 (domain and email), BAL-12, BAL-13 (days), RES-09 full PASS (needs DEF-038, the friendlier error message)

## Changes since the first version of this brief (2026-10-02 to 2026-10-03)
- Shipped and pushed: atomic expense save (055), Admin > Usage phase 1 and 2 (049 to 061: overview, live now, funnel, features, top events, devices, device filter, per-user timeline), per-invite share links (054), archived trips read-only for ledger entries (062), settlement summary, amount calculator.
- Sprint 6 is active on the Jira-lite board; Sprints 0 to 5, 7 and 8 are closed.
- Test data already in `E2E-TEST 047 write check`: rows named `E2E-TEST 055 ...`, `056 ...`, `058 calc`, `062 live trip still works`. Trip `E2E-TEST 062 archived trip` is archived. Reuse them; do not delete.

## Already known, do not log as new
- DEF-038 (SE-182): raw "Failed to fetch" text after a save whose response was lost.
- Balances screen says "You owes <name>" (should be "You owe"); found 2026-10-03, not yet logged.
- Open and understood: DEF-028 (iOS web push disappears), DEF-030 (offline sign-out partly fixed), DEF-031 (admin cannot purge a circle), DEF-035 (admin dropdown lists), DEF-036 (inline create-circle is three writes).
- A trip's archived state hides it from members but an admin can still open it (by design).

## Logging defects on the board
Bugs go on the Jira-lite board (`http://localhost:5173/board`, project SE) as type bug; reporter is **Ganesha - Testing Agent**. The owner signs in to the board; the agent never enters credentials. Add the matching `DEF-nnn` row to `BRD.md` section 6 and a test case row (md and Sheet) for anything new.
