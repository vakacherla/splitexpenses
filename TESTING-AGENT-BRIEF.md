# Regression brief for the testing agent (written 2026-10-02)

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
| AT-09, ATR-03 | Only on 2026-10-03 after 06:55 AM IST, per `HANDOFF.md`; delete only the two named items, individually, after the owner confirms in chat |

## Not for the agent (owner or phone)
- Real Chrome with Turnstile: AUTH-02, AUTH-04, SIGN-01, SIGN-02, TOUR-01
- Two accounts (normal plus incognito): AUTH-06, AUTH-07, CIRC-04
- Jayashree's console replay: AU-16, AU-19
- Throwaway account: AU-07, SEC-07
- Phone: RES-01, BAL-09, BAL-11, BAL-14, BAL-15, BAL-16, ACT-06, OFF-11
- Blocked: AUTH-11, 13, 14, 15 (domain and email), BAL-12, BAL-13 (days), RES-09 (needs a migration)
