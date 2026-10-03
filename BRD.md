# Business Requirements Document: Split Expenses

Version 1.0, 2026-10-02. Derived from `PRODUCT-ROADMAP.md`, `test-cases-2026-09-29.md` (Google Sheet `1QHNnjMGCffXa4okRjHJXi9tn_WjywgLFrAwy6kiyZXk`), `HANDOFF.md` and the migrations in `supabase/migrations`.

Purpose: one place that ties every requirement to its test cases and to every bug found against it, so Jira stories and bugs can be created from it and traced for the life of the product.

## 1. Product summary

Split Expenses is a free, ad-free, web and installable (PWA) app for splitting shared costs among friends and family on trips and in households. It is a **ledger, not a wallet**: it records who owes whom and makes settling up one tap away, but never moves money (see section 8).

- **Primary users:** small trusted groups (family, friends, flatmates), including multi-currency trips (INR, USD and 28 more currencies).
- **Roles:** Member, Trip or Circle manager (appointed by the creator), Creator/owner, Platform admin, Super admin (SU).
- **Stack:** React, Vite and Tailwind on Vercel; Supabase (Auth, Postgres with row-level security, Edge Functions, Storage); Gemini (with a Qwen fallback) for receipt scan and sentence parsing; Cloudflare Turnstile for bot protection.
- **Business goal:** more sign-ups and more trips, as the traction story for investors or acquirers. No monetisation yet.

## 2. Traceability model

| Artifact | ID format | Jira type | Where it lives |
|---|---|---|---|
| Epic | `EP-nn` | Epic | Section 4 |
| Requirement | `REQ-<epic>-nn`, e.g. `REQ-EXP-03` | Story | Section 4 |
| Test case | existing refs, e.g. `EXP-24`, `AU-04` | Test (linked to the story) | Google Sheet `Cases`, `test-cases-2026-09-29.md` |
| Defect | `DEF-nnn` | Bug (linked to the story and the test) | Section 6 |
| Change | commit hash or migration number | Link on the story or bug | git history, `supabase/migrations` |

Rules for keeping it traceable:
1. Every new feature gets a `REQ` row before it is built, with acceptance criteria.
2. Every test case names the `REQ` it verifies (the Sheet gets a `Req` column; see section 9).
3. Every bug is a `DEF` row naming the `REQ` it broke, the test that caught it, the fix commit or migration, and a status.
4. Status values: Shipped, Planned (Quick win), Parked, Blocked, Not built, Excluded.

## 3. Epic overview

| Epic | Title | Requirements | Shipped | Open |
|---|---|---|---|---|
| EP-01 | Accounts, access and abuse protection | 11 | 10 | 1 (blocked: email confirmation) |
| EP-02 | Trips | 16 | 12 | 4 (2 not built, 1 blocked: email invites, 1 superseded by REQ-INV-01) |
| EP-03 | Circles | 9 | 8 | 1 (circle balances, not built) |
| EP-04 | Expenses and splits | 16 | 12 | 4 (1 quick win, 1 parked, 1 not built, 1 blocked) |
| EP-05 | Balances and settling up | 9 | 7 | 2 (1 quick win, 1 parked) |
| EP-06 | Reports and data portability | 6 | 4 | 2 (1 not built, 1 parked) |
| EP-07 | Activity and notifications | 5 | 5 | 0 |
| EP-08 | Offline, PWA and install | 5 | 5 | 0 |
| EP-09 | Platform admin | 10 | 9 | 1 (not built) |
| EP-10 | Onboarding and navigation | 4 | 4 | 0 |
| EP-11 | Security and data integrity | 6 | 6 | 0 |
| EP-12 | Growth (parked) | 4 | 0 | 4 (1 superseded by REQ-INV-01) |
| EP-13 | Shared Fund mode (blocked) | 1 | 0 | 1 |
| EP-14 | Usage insights (admin) | 26 | 13 | 13 (3 not built, 10 parked) |

## 4. Requirements by epic

Status key: **S** Shipped, **Q** Planned quick win, **P** Parked, **B** Blocked, **N** Not built, **X** Excluded. "Tests" are case refs from the Sheet. "Bugs" are section 6 IDs.

### EP-01 Accounts, access and abuse protection

| ID | Requirement (story: "As a ..., I want ...") | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-AUTH-01 | As a new user I can sign up with email and password and land on the dashboard. | S | AUTH-01, AUTH-02 (not run), AUTH-10 | DEF-001 | Auth |
| REQ-AUTH-02 | As a user I can sign in, and wrong credentials give a clear message. | S | AUTH-03, AUTH-04 (not run) | | Auth |
| REQ-AUTH-03 | As a user I can sign out, and Back never shows cached private pages. | S | AUTH-05, AUTH-06 (blocked), AUTH-07 (blocked) | | Offline queue scoped per user |
| REQ-AUTH-04 | As a user I can reset a forgotten password by email link; with no recovery link the page says the link expired. | S | AUTH-12..16 | DEF-006 | Auth |
| REQ-AUTH-05 | Logged-out visitors are redirected to Login; signed-in users visiting /login go to the dashboard; non-admins are kept out of /admin. | S | AUTH-08, AUTH-09, AUTH-19, AUTH-20 | DEF-005, DEF-027 | Routing |
| REQ-AUTH-06 | Old /groups/&lt;id&gt; links redirect to /trips/&lt;id&gt;; malformed ids give a friendly not-found. | S | AUTH-17, AUTH-18, CIRC-13 | DEF-002, DEF-032 | Roadmap Now |
| REQ-AUTH-07 | A suspended user cannot sign in, loses a live session within 60 seconds, sees a clear screen and a mailto link to the administrator, and cannot read or write data. | S | AU-03, AU-04, AU-05, SUSP-01 | DEF-024 | Migration 047 |
| REQ-AUTH-08 | Sign-in, sign-up and forgot-password are protected by Cloudflare Turnstile. | S | CAP-01 | | Appendix V |
| REQ-AUTH-09 | Throwaway-email domains (64 listed) cannot sign up, in the form and at the database. | S | SIGN-01 (not run), SIGN-02 (not run) | | Migration 048 |
| REQ-AUTH-10 | AI features are capped per user per day (receipt scan 30, sentence parse 100); suspended users are refused. | S | AI-01 (not run) | | Migration 048 |
| REQ-AUTH-11 | Email confirmation required at sign-up. | B | AUTH-10, AUTH-11 | DEF-001 | Parked until a domain is bought and verified in Resend |

### EP-02 Trips

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-TRIP-01 | Create a trip with a home currency; dashboard shows first name and trip/circle counts. | S | TRIP-01, TRIP-03, TRIP-07, TRIP-02, REC-08 | | |
| REQ-TRIP-02 | Join a trip with an invite code; wrong codes give a clear message; codes are case-insensitive. | S | TRIP-04..06 | | |
| REQ-TRIP-03 | Creator can promote and demote managers; managers cannot promote or remove other managers or the creator (enforced in the database). | S | TRIP-08..12 | | Migration 013 |
| REQ-TRIP-04 | Regular members see no settings, promote or remove controls. | S | TRIP-11, TRIP-15 | | |
| REQ-TRIP-05 | Duplicate a trip (members, roles, currency; new invite code; no expenses). | S | TRIP-13..15 | | Migration 018 |
| REQ-TRIP-06 | Cover photo for owner or manager; images downscaled; non-images rejected; centre-cropped. | S | TRIP-16..19 | DEF-007, DEF-008 | Migrations 024, 025 |
| REQ-TRIP-07 | Removing a member who has an unsettled balance is blocked for everyone, including admins. Settled members can be removed and can rejoin. | S | TRIP-20, TRIP-21, ACT-05 | DEF-022 | Migration 046 |
| REQ-TRIP-08 | Archive a trip (soft delete); archived trips are not found by members and cannot take new expenses. | S | TRIP-22, AT-07, AT-08 | DEF-009, DEF-017, DEF-025 | Migration 044 |
| REQ-TRIP-09 | Trip names are safe against HTML/JS and long text. | S | TRIP-23, SEC-06 | | |
| REQ-TRIP-10 | Optional start and end dates, validated (end after start, plausible years). | S | TRIP-24, TRIP-25 | DEF-033 | Migrations 027, 028 |
| REQ-TRIP-11 | UI uses the word "Trip" (formerly Group) with no schema change. | S | AUTH-17 | | Roadmap 2026-09-07 |
| REQ-TRIP-12 | Shareable invite link in addition to the code. | X | FEAT-04 | | Superseded by REQ-INV-01 (owner decision 3 Oct 2026) |
| REQ-INV-01 | Per-invite share links, phase 1. A member makes a link for a trip or Circle (`/join/<token>`); it works for up to 20 people for 14 days, once per person (a removed member cannot reuse it), at most 20 new links per person per day. Join screen for signed-out and signed-in people showing the trip's cover photo or a playful illustration, and the inviter's first name and photo; the invite survives sign-up, sign-in and the confirmation email. Share by the phone share sheet, WhatsApp, email or copy, with a friendly message; the dashboard join box accepts a pasted link; fixed link-preview card; six-letter codes unchanged. Records who made each link, when and how it was shared, opens, and who joined (and whether their account was new). | S | INV-01..INV-12 (not run) | | `INVITE-LINKS` design: https://claude.ai/artifact/3ZVMNDBLeLPPgMU7TpCur6. Migration 054. Shipped 3 Oct 2026 (merge e3e3cfd); migration 054 applied. Supersedes REQ-TRIP-12 and REQ-GRO-01 (link, join page, sign-up survival, preview). |
| REQ-INV-03 | Invite visibility, phase 2: "Invites you sent" list with share-again and turn-off (the trip creator sees every member's); an invites report in Admin → Usage (created, opened, joined, new accounts, by channel); the funnel's "Shared an invite" step reads real invites; `list_invites` and `revoke_invite` functions. | N | none yet | | Phase 2 of the invite design |
| REQ-INV-04 | Invite links, phase 3: link-preview card with the real trip name and cover photo (small server function); "reset code" for the old six-letter code; "just one person" links. | P | none yet | | Phase 3 of the invite design |
| REQ-INV-02 | Email invites and one reminder, sent from the app address with the inviter's name as display name (never the inviter's address as sender), opt-in reply-to, unsubscribe and suppression list, daily cap, friend's email deleted on join or after 30 days. | B | none yet | | Blocked on a verified sending domain in Resend (as REQ-AUTH-11). `USAGE-INSIGHTS-STORIES.md`. |

### EP-03 Circles

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-CIRC-01 | Create a Circle, join it with its own code; it has its own dashboard section. | S | CIRC-01, CIRC-02 | | Migration 031 |
| REQ-CIRC-02 | A trip created inside a Circle copies the roster once. | S | CIRC-03 | | |
| REQ-CIRC-03 | Anyone added to a trip later is synced into the Circle; attaching or detaching a trip keeps rosters consistent. | S | CIRC-04 (blocked), CIRC-05, CIRC-06 | DEF-012, DEF-013 | Migrations 036, 039 |
| REQ-CIRC-04 | Balances and settle-up stay strictly per trip. | S | CIRC-07 | | |
| REQ-CIRC-05 | Removing someone from one trip leaves the Circle and sibling trips untouched. | S | CIRC-08 | | |
| REQ-CIRC-06 | Circle managers mirror trip managers; add a member by email. | S | CIRC-09, CIRC-10 | | Migrations 037, 038 |
| REQ-CIRC-07 | Circle cover photo; inline "+ Create new circle" in Trip settings. | S | CIRC-11, CIRC-14 | DEF-018 | Migration 040 |
| REQ-CIRC-08 | A Circle member sees sibling trips' info but never the ledger until they join. | S | CIRC-12 | DEF-029 | Migration 031 |
| REQ-CIRC-09 | Circle-wide balances report. | N | REC-10 | | Not planned |

### EP-04 Expenses and splits

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-EXP-01 | Add an expense in the home or any of 30 currencies with a locked-in rate. | S | EXP-01, EXP-02, EXP-26, EXP-27, EXP-09 | | |
| REQ-EXP-02 | Six split types: equal, percentage, exact, shares, adjustment, itemized (with proportional tax and tip); every invalid sum is blocked with a clear message. | S | EXP-03..08, EXP-18..22, REC-01, REC-02, EXP-10, EXP-37 | DEF-011 | |
| REQ-EXP-03 | Amount, description and date validation (zero, negative, over 10,000,000, empty, future date warns). | S | EXP-23..25, EXP-29 | DEF-003, DEF-012 | |
| REQ-EXP-04 | A backdated expense uses the historical rate for its date; an expense before the trip start is rejected. | S | EXP-28 | DEF-016 | Commit a823ab2 |
| REQ-EXP-05 | Edit an expense; edit never changes the locked rate unless amount or currency changes. | S | EXP-12..17 | DEF-014 | Migrations 017, 043 |
| REQ-EXP-06 | Delete is a soft delete, hidden from members and visible to admins in Trash. | S | EXP-11, ATR-01, ATR-04 | | |
| REQ-EXP-07 | Duplicate an expense (new date and fresh rate, original untouched). | S | EXP-30..33 | | |
| REQ-EXP-08 | Attach a receipt to an own expense, on the ledger row or in the edit modal. | S | EXP-34..36 | | |
| REQ-EXP-09 | Scan a receipt and pre-fill the form, including line items. | S | EXP-38, EXP-39 | | `receipt-scan` function |
| REQ-EXP-10 | Log an expense by typing a sentence; nothing is saved until the user confirms. | S | SENT-01..08 | DEF-013b | `parse-expense-text` function |
| REQ-EXP-11 | Search and filter the ledger; saveable default split per trip; note on an expense. | S | FEAT-01..03 | | |
| REQ-EXP-12 | Exchange rate and its date are shown in the UI. | S | REC-11 | | |
| REQ-EXP-13 | Calculator in the amount field (operator row, safe parser, live result). | Q | none yet | | `brief-amount-calculator.md` |
| REQ-EXP-14 | Automatic recurring expenses (scheduled). | P | none yet | | See REQ-GRO-04 |
| REQ-EXP-15 | Multiple payers, tags, reimbursable flag, comment threads, per-person export, voice input. | N | REC-03..07, REC-09, REC-12, REC-13 | | Not planned; testers to decide |
| REQ-EXP-16 | A phantom expense must never appear when the network drops during save (atomic save). | S | RES-09 | DEF-026, DEF-038 | Migration 055 (applied to production 3 Oct 2026): `create_expense_with_splits` and `update_expense_with_splits` save the expense and its splits in one transaction. App routed through them in the next push. The raw error text is DEF-038 |

### EP-05 Balances and settling up

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-BAL-01 | Per-member net balances, to the cent. | S | BAL-01 | | |
| REQ-BAL-02 | Suggested minimal settle-up payments. | S | BAL-02, BAL-08 | | |
| REQ-BAL-03 | Record a payment in home or foreign currency with the rate locked at record time; overpayment re-nets correctly. | S | BAL-03..06 | | |
| REQ-BAL-04 | Undo a settlement; failure is shown, never silent. | S | BAL-07 | DEF-004 | |
| REQ-BAL-05 | Settle-up deep links (UPI, Venmo, PayPal) with pre-filled amount, gated on the recipient's handle. | S | BAL-09 (not run), BAL-10 (not run) | | `upi-pay-link-fixes-2026-09-29.md` |
| REQ-BAL-06 | Reminders: automatic after the trip end date, every 3 days, plus a manual Remind button; email and web push. | S | BAL-11..16 (blocked or not run) | | `trip-reminders-cron`, `remind` |
| REQ-BAL-07 | Stale-rate protection when saving. | S | RES-10, RES-11 | DEF-019 | Appendix S |
| REQ-BAL-08 | One-tap plain-text settlement summary (share sheet or copy; no invite code). | Q | none yet | | `brief-settlement-summary.md` |
| REQ-BAL-09 | Neutral "paid so far vs. share" bar per person. | P | none yet | | Polish list |

### EP-06 Reports and data portability

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-REP-01 | Category chart, by-who-paid chart and category-by-person table, consistent with each other; empty state. | S | REP-01..05 | | |
| REQ-REP-02 | CSV export (excludes soft-deleted expenses). | S | CSV-14, CSV-15 | DEF-015 | |
| REQ-REP-03 | CSV import: template, preview, all-or-nothing, 500-row cap, email matching, one consolidated activity entry, undo, auto-rollback on a dropped connection, offline blocked. | S | CSV-01..14 | DEF-015, DEF-005b | Migrations 021, 023 |
| REQ-REP-04 | Round-trip: an exported file re-imports unmodified. | S | CSV-01 | DEF-015 | Commit 81cae01 |
| REQ-REP-05 | Date-range and member filters on Reports; settlements in CSV. | N | REP-06, CSV-15 (half) | | Roadmap gap 2 |
| REQ-REP-06 | End-of-trip PDF or Excel summary. | P | none yet | | See REQ-GRO-03 |

### EP-07 Activity and notifications

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-ACT-01 | Append-only activity feed: expense added, edited, deleted; settlement recorded, undone; member joined, removed; one row per CSV import. | S | ACT-01..05, ACT-08, ACT-09 | | Migration 026, 034 |
| REQ-ACT-02 | Removed members keep their name in old entries and balances ("Former member" fallback). | S | ACT-05 | DEF-022 | |
| REQ-ACT-03 | Push on expense added, settlement recorded (other party only) and CSV import; tap deep-links to the trip. | S | ACT-06 (blocked), BAL-11 (blocked) | | `notify-group` |
| REQ-ACT-04 | `notify-group` filters non-member targets server-side. | S | ACT-07 | | |
| REQ-ACT-05 | Push shows reliably on iOS. | S | BAL-11 | DEF-028 (open, unconfirmed) | Roadmap known issue |

### EP-08 Offline, PWA and install

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-OFF-01 | Offline add, edit, delete and settle queue and sync in order with no loss or duplicates; sync banner reflects state. | S | OFF-01..15 | DEF-020b | `offlineQueue.js` |
| REQ-OFF-02 | Offline reload renders from cache; first-ever offline visit shows a clear message. | S | OFF-01, OFF-11 (not run), OFF-12 | DEF-021b | `offlineCache.js` |
| REQ-OFF-03 | Last-write-wins with a surfaced warning on conflicting edits. | S | OFF-06, OFF-08 | | Migration 020 |
| REQ-OFF-04 | Sign out offline with queued operations is safe. | S | OFF-16 (partial) | DEF-030 | |
| REQ-OFF-05 | Install prompt: native on Chrome/Edge, Add-to-Home-Screen steps on iPhone, 14-day dismissal, permanent card on Profile and Help. Native store app wrapper (Capacitor) is a later phase. | S | INST-01, INST-02 | | Commit c3f5946 |

### EP-09 Platform admin

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-ADM-01 | Admin link and /admin only for admins. | S | AU-01, AUTH-09 | | |
| REQ-ADM-02 | List every user; suspend, unsuspend; delete a user with no history; deleting a user with live history is refused with a clear message. | S | AU-02..08 | DEF-023 | `admin-users` |
| REQ-ADM-03 | Cannot suspend or delete your own account; only SU promotes and demotes. | S | AU-09..12 | | |
| REQ-ADM-04 | Add or remove a user in any trip (SU only), server-enforced; balance check applies. | S | AU-13..19 | DEF-022 | Migrations 018, 019, 046 |
| REQ-ADM-05 | Every trip platform-wide with member count, creator and date. | S | AT-01, AT-02 | | |
| REQ-ADM-06 | Overview tiles link to the right tab; Active users filters. | S | AT-03, AT-04 | DEF-010 | |
| REQ-ADM-07 | Platform-wide settlements view. | S | AT-05 | | |
| REQ-ADM-08 | Rename, archive, restore a trip; attach a trip to any circle; read-only trip view. | S | AT-06..11 | DEF-017 | |
| REQ-ADM-09 | Trash: restore, and permanently delete only after 30 days (bulk purge gated; per-row delete any age). | S | ATR-01..05, AT-09 (not run), ATR-03 (not run) | | |
| REQ-ADM-10 | Admin can permanently delete a Circle; signups-per-day tile; bulk suspend. | N | none yet | DEF-031 | Backlog |

### EP-10 Onboarding and navigation

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-ONB-01 | First-run welcome tour of four illustrated cards (Trip first, then Circle, then start); "show every time" option; replay from Help and Dashboard. | S | TOUR-01, TOUR-02 | DEF-034 | Roadmap feedback item 3 |
| REQ-ONB-02 | Top menu on desktop and bottom tabs on phones (Trips, Circles, Rates, Help, Profile). | S | NAV-01, NAV-02, RES-02..04, RES-01 | DEF-020 | Commit 4d23709 |
| REQ-ONB-03 | Breadcrumbs on trip and circle pages; "Where do I start?" strip on Overview. | S | NAV-03 | | |
| REQ-ONB-04 | Help page; light and dark theme with persistence. | S | RES-05..08 | | |

### EP-11 Security and data integrity

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-SEC-01 | Non-members never see another trip's data (RLS), including direct API calls. | S | SEC-01, SEC-04 | | |
| REQ-SEC-02 | A non-admin cannot self-promote or call admin functions. | S | SEC-02, SEC-03, AU-16, AU-19 (not run) | | |
| REQ-SEC-03 | Storage writes only for managers. | S | SEC-05 | | |
| REQ-SEC-04 | User text is inert (no XSS). | S | SEC-06 | | |
| REQ-SEC-05 | A tampered or expired session degrades safely. | S | SEC-07 (partial) | | |
| REQ-SEC-06 | RLS policies that read other tables go through SECURITY DEFINER helpers. | S | EXP-12, TRIP-22 | DEF-014, DEF-009 | Engineering rule, migration 025 |

### EP-12 Growth (parked, in priority order; none started)

| ID | Requirement | St | Notes |
|---|---|---|---|
| REQ-GRO-01 | Join by link, Copy/Share link, invite survives sign-up, Open Graph preview, admin Growth tab. | X | none yet | | Superseded by REQ-INV-01 for the link, join page, sign-up survival and preview; the admin Growth tab is covered by the Usage tab (REQ-INV-03). Owner decision 3 Oct 2026. |
| REQ-GRO-02 | Read-only balance link (hashed, expiring, revocable; privacy review first; "Join this trip" call to action). | P | Depends on REQ-GRO-01. |
| REQ-GRO-03 | End-of-trip PDF or Excel export. Open decision: free core or Plus. | P | |
| REQ-GRO-04 | Automatic recurring expenses. Open decision: free core or Plus. | P | pg_cron already exists. |

### EP-13 Shared Fund mode

| ID | Requirement | St | Notes |
|---|---|---|---|
| REQ-FUND-01 | Shared Fund mode (family fund). | B | Blocked on a family verdict on its separate BRD. |

### EP-14 Usage insights (admin)

Design and mockups: https://claude.ai/artifact/2AjyRgZHFTwj1YTGGmy3re. Full acceptance criteria, definitions and open questions: `USAGE-INSIGHTS-STORIES.md`. REQ-USE-01..09 shipped on 3 Oct 2026 (push 24e35ae, fixes in b8972d5; migrations 049 to 051). REQ-USE-06 was built in the first push, not later, because it works from write activity until tracking data exists. Still to build: REQ-USE-10, 11, 12, 23, 24. Phases 3 to 5 are parked until the user base reaches a few hundred.

| ID | Requirement | St | Tests | Bugs | Source |
|---|---|---|---|---|---|
| REQ-USE-01 | Usage notice at sign-up, Help and Profile, and a "Share usage data" switch (default on) enforced in RLS, not only the UI. | S | USE-03, USE-11 (not run) | | Track A |
| REQ-USE-02 | `app_events` table (migration 049) with allowlisted event names and props. RLS on and no policies, so nothing is readable or writable through the API; rows arrive only through `track_events()` (25 per call, 2000 per day, server clock, silent drops, respects the switch and suspension) and are removed with the account. | S | USE-02, USE-04 (not run) | | Track A |
| REQ-USE-03 | `track()` helper and first events (`app_open`, `page_view`, milestones, `invite_shared`) plus coarse device labels (form factor, install mode, OS, browser) from a tested `detectDevice`; no raw user agent, no content. | S | USE-02, USE-03 (not run) | | Track A |
| REQ-USE-04 | Last seen and "active now": the app sends a heartbeat every 2 minutes while the tab is visible; "active now" means seen in the last 5 minutes. Stored in `user_activity`, closed to the API (trip-mates cannot see it); admin-only; respects the switch. | S | USE-10 (not run) | | Track A |
| REQ-USE-05 | Usage tab in Admin with period and exclude-admins/test-accounts filters; data only via `admin_usage_*` `SECURITY DEFINER` functions that check `is_platform_admin()` and return names and avatars, never emails; chart/table toggle. | S | USE-01, USE-04 (not run), USE-12 (not run) | | Track B |
| REQ-USE-06 | Overview: Active now, DAU, WAU, MAU, stickiness (average DAU over MAU), DAU/WAU chart, in the admin's browser timezone with UTC fallback. | S | USE-01, USE-13 (not run) | | Track C |
| REQ-USE-07 | Activation funnel: signed up, created or joined a trip, added an expense (chained); then shared an invite, someone joined their trip, settled up (each measured among people who added an expense). Drop-off user lists with paging; median step times; "shared an invite" shows "No data yet" until invite events exist. | S | USE-05, USE-06 (not run) | | Track B. Reads `invites` after REQ-INV-01. |
| REQ-USE-08 | Time to first expense: median, p90 and histogram including "never". | S | USE-07 (not run) | | Track B |
| REQ-USE-09 | Stuck users by segment (no trip, trip but no expense, never invited, quiet 14+ days); "never invited" means added expenses and is not in any trip with someone else in it (people who joined another person's trip are not listed; fixed in migration 052, applied 3 Oct 2026); names and avatars only; CSV export without emails. | S | USE-08, USE-09 (not run) | | Track B |
| REQ-USE-10 | Feature adoption: tried vs repeated (2+ days), discovery gap and quality gap diagnosis, minimum-sample rule. | S | `056_usage_feature_adoption.test.sql` (7 checks), `usageStats.test.js`; verified live 3 Oct 2026 | | Track C. Migration 056 (applied 3 Oct 2026), Admin > Usage > Features. Settle up and Circles tracking added but not run live; other tracking points were. Pushed with the next release |
| REQ-USE-11 | Top events this week by distinct users. | S | `057_usage_top_events.test.sql` (6 checks), `usageStats.test.js`; verified live 3 Oct 2026 | | Track C. Migration 057 (applied 3 Oct 2026), card on Admin > Usage > Overview. Pushed with the next release |
| REQ-USE-12 | Per-user activity timeline for admins; names and avatars only. | N | none yet | | Track C |
| REQ-USE-13 | Trip pulse for trip creators (who has not added an expense, who has not joined, who is owed). | P | none yet | | Later, after REQ-INV-01. Belongs to Trips. |
| REQ-USE-14 | Weekly retention cohorts. | P | none yet | | Parked until a few hundred users |
| REQ-USE-15 | "Tried feature X vs not" retention comparison. | P | none yet | | Parked until a few hundred users |
| REQ-USE-16 | Active hours heatmap. | P | none yet | | Parked until a few hundred users |
| REQ-USE-17 | Weekly adoption digest emailed to the admin. | P | none yet | | Parked; needs a verified domain |
| REQ-USE-18 | In-app tips and push or email nudges for stuck and non-joined users, with a send log. | P | none yet | | Parked; depends on REQ-INV-02 |
| REQ-USE-19 | Threshold alerts. | P | none yet | | Parked |
| REQ-USE-20 | Daily rollup tables and 180-day raw event cleanup job. | P | none yet | | Parked until volume grows |
| REQ-USE-21 | Test-account exclusion list managed in the UI. | P | none yet | | Parked; the `E2E-TEST` prefix rule is enough for now |
| REQ-USE-22 | Admin action audit log. | P | none yet | | Parked; separate security story |
| REQ-USE-23 | Devices and install mode report (device type, installed app vs browser, iOS vs Android and others). | N | none yet | | Track C |
| REQ-USE-24 | Device filter across usage views. | N | none yet | | Track C |
| REQ-USE-25 | "Never signed in" group on Stuck users: accounts over an hour old with no sign-in and no activity, with a yes/no for whether the email was ever confirmed (never the address); first group on the screen; CSV includes the yes/no. Migration 053. Added 3 Oct 2026 after two real users could not get past sign-up. | S | USE-14 (not run) | | Shipped 3 Oct 2026 (merge 9a14398); migration 053 applied. |
| REQ-USE-26 | Live users now: a section on Admin > Usage > Overview listing the people in the app right now (heartbeat within 5 minutes, the same rule as the Overview "active now" number), with the part of the app they last opened, their device and how long ago they were seen. Refreshes every 30 seconds. Names and avatars only, no email; at most 50 listed, count is the true total. | S | `058_usage_live_now.test.sql` (7 checks), `usageStats.test.js`; verified live 3 Oct 2026 | | Track C. Added 3 Oct 2026 at the owner's request, Sprint 8 (SE-183). Migration 058 (applied 3 Oct 2026). Pushed with the next release |

## 5. Quick wins (planned, not started)

1. **REQ-BAL-08** one-tap settlement summary, effort small.
2. **REQ-EXP-13** amount calculator, effort medium (fixes a latent `parseFloat('12.5+8')` bug).
3. Polish: avatar chips on ledger rows, paid-vs-share bar.

## 6. Defect register

Status: Fixed (verified on production), Open, Partial. "Layer" is where the fix was made. This list is rebuilt from the Sheet evidence column and roadmap; IDs with a trailing letter are historical items fixed before the QA sheet existed.

| ID | Req | Test | Summary | Fix | Status |
|---|---|---|---|---|---|
| DEF-001 | AUTH-01 | AUTH-01 | Sign-up failed: Supabase gated account creation on the Resend confirmation email. | Config: Confirm email turned off 2026-09-29 | Fixed |
| DEF-002 | AUTH-06 | CIRC-13 | Malformed circle id showed a raw Postgres error. | 29e95f2 | Fixed |
| DEF-003 | EXP-03 | EXP-24 | Amount 999999999.99 froze the split preview. | 0869eff | Fixed |
| DEF-004 | BAL-04 | BAL-07 | Settlement undo silently did nothing when blocked. | 29e95f2 (row-count guard) | Fixed |
| DEF-005 | AUTH-05 | AUTH-19 | /login did not redirect when signed in. | 0869eff | Fixed |
| DEF-005b | REP-03 | CSV-09 | Import undo silently did nothing when blocked. | 0869eff | Fixed |
| DEF-006 | AUTH-04 | AUTH-16 | /reset-password showed the form with no recovery link. | 0869eff | Fixed |
| DEF-007 | TRIP-06 | TRIP-18 | A PDF was accepted as a cover photo. | 0869eff | Fixed |
| DEF-008 | TRIP-06 | TRIP-19 | A 14.1 MB image was stored and served in full. | a5b64e1 (downscale to JPEG) | Fixed (avatar path not live-tested) |
| DEF-009 | TRIP-08 | TRIP-22 | An archived trip stayed reachable to its creator and accepted an expense. | TripView treats archived as not found | Partial: server RLS still allows inserts into an archived trip (see DEF-025) |
| DEF-010 | ADM-06 | AT-04 | Active users tile did nothing. | 0869eff | Fixed |
| DEF-011 | EXP-02 | EXP-07 | Exact split off by 0.01 was accepted. | 0869eff | Fixed |
| DEF-012 | EXP-03 | EXP-29 | Future-dated expense gave no warning. | 0869eff (warn, still saves) | Fixed |
| DEF-013 | CIRC-03 | Circle E2E | Trips attached to a Circle did not sync their roster. | Migration 039 | Fixed |
| DEF-013b | EXP-10 | SENT-08 | Offline sentence parse showed a generic message. | 0869eff | Fixed (code-verified) |
| DEF-014 | EXP-05 | EXP-12 | A member could not delete their own expense (RLS view policy). | Migration 043 | Fixed |
| DEF-015 | REP-04 | CSV-01 | An exported CSV did not re-import. | 81cae01 | Fixed |
| DEF-016 | EXP-04 | EXP-28 | Backdated expenses used today's rate. | a823ab2 | Fixed |
| DEF-017 | ADM-08 | AT-07 | Admin archive failed with an RLS error. | Migration 044, d6c4b53 | Fixed |
| DEF-018 | CIRC-07 | Appendix P | Circle delete failed for its creator. | Appendix P | See Appendix P |
| DEF-019 | BAL-07 | RES-10 | A stale exchange rate was saved. | Appendix S | Fixed |
| DEF-020 | ONB-02 | RES-02 | Horizontal overflow at 375 and 320 px (trip tabs, profile, navbar). | RES-02 fix | Fixed |
| DEF-020b | OFF-01 | offline testing | A synced expense needed a manual refresh. | Auto reload after sync | Fixed |
| DEF-021b | OFF-02 | offline testing | Safari offline resolved as a query error, not a rejection. | Check navigator.onLine | Fixed |
| DEF-022 | TRIP-07 | ACT-05, TRIP-20 | Admin removal with an unsettled balance orphaned a member's name and balance. | Migration 046 + "Former member" label | Fixed |
| DEF-023 | ADM-02 | AU-08 | Deleting a user with history gave "Database error deleting user". | f8cdde5 (admin-users) | Fixed |
| DEF-024 | AUTH-07 | AU-04 | A suspended user's live session kept working. | Migration 047 + session revoke | Fixed |
| DEF-025 | TRIP-08 | TRIP-22 | Server RLS still allows expense inserts into an archived trip. | Needs a migration | Open |
| DEF-026 | EXP-16 | RES-09 | Dropped connection mid-save can leave a phantom expense. | Migration 055 (atomic save functions) plus the app's five write sites routed through them; one fixed id per open Add form so a retry returns the saved expense | Fixed 3 Oct 2026 (migration applied; app change committed, awaiting push) |
| DEF-038 | EXP-16 | RES-09 | After a save whose response was lost, the Add form shows the raw browser text "Failed to fetch", which reads as "not saved" although it was. | Needs a friendlier message that says to check the ledger before retrying | Open |
| DEF-027 | AUTH-05 | AUTH-20 | Admin link and name missing right after a fresh load. | See Sheet | Fixed |
| DEF-028 | ACT-05 | BAL-11 | iOS web push disappears after display. | Diagnostic logging in `sw.js`; cause unconfirmed | Open |
| DEF-029 | CIRC-08 | CIRC-12 | The "Viewing as admin" banner wrongly shows for a non-joined Circle member. | Fixed in 1059afb (2026-10-01) | Fixed |
| DEF-030 | OFF-04 | OFF-16 | Sign out offline with queued ops only partly fixed. | Partial | Partial |
| DEF-031 | ADM-10 | AU-08 | A user cannot be deleted if their archived circle still exists; admin has no circle purge. | Backlog | Open |
| DEF-032 | AUTH-06 | AUTH-18 | Malformed trip id showed a raw Postgres error. | `TripView.jsx` | Fixed |
| DEF-033 | TRIP-10 | TRIP-24, TRIP-25 | Trip dates had no validation. | Migrations 027, 028 | Fixed |
| DEF-034 | ONB-01 | TOUR-02 | Tour disappeared on untick; replay reappeared after refresh. | Fixed during build | Fixed |
| DEF-035 | ADM-04 | AU-15 | "Add to trip" lists trips the user is already in; Admin Circle dropdown lists archived circles. | Backlog | Open (nit) |
| DEF-036 | CIRC-07 | CIRC-14 | Inline create-circle does three non-atomic writes (orphan or duplicate if one fails). | Backlog | Open (latent) |
| DEF-037 | OFF-01 | historical | An unhandled fetch error left skeletons spinning offline (dashboard, trip, admin route). | try/catch added | Fixed |

## 7. Open decisions

1. Free core or Plus tier for PDF export (REQ-GRO-03) and automatic recurring expenses (REQ-GRO-04).
2. Shared Fund mode: awaiting the family verdict (REQ-FUND-01).
3. Domain purchase, which unblocks email confirmation (REQ-AUTH-11), the admin mailbox, and the inbox test cases (AUTH-11, 13, 14, 15).
4. Which "Not built" expense items (REQ-EXP-15) testers actually want.
5. Native store app: Capacitor wrapper needs an Apple developer account, review, and retest of push and UPI deep links on iOS.
6. Confirm the Gemini API tier (see `website-sync-notes.md`) since the AI caps assume the free quota.
7. Resolved 3 Oct 2026: REQ-INV-01 supersedes REQ-TRIP-12 and REQ-GRO-01 (join by link). The one open piece is the Supabase redirect list: add the app's address with a `/join/**` wildcard so confirmation emails can return to an invite.

## 8. Out of scope (deliberately)

Moving money or holding balances (licensing, KYC/AML, PCI); bank or card auto-import (Plaid has no India coverage); auto-creating Google Sheets (CSV opens natively); a public or social activity feed (privacy); merchant profiles; a "who should pay next" nudge (balances are not turn order; replaced by the neutral paid-vs-share bar). Reasons are in the roadmap.

## 9. Next steps to make this live in Jira

1. Add a `Req` column to the Sheet and fill it from the "Tests" column above (a one-off script).
2. Generate the Jira import file (CSV with Epic, Story, Bug, links) from sections 4 and 6.
3. From then on, every new feature starts as a `REQ` row and every bug as a `DEF` row before any code.

## 10. Jira key index

Board: Jira-lite, project SplitExpenses (key SE), imported 2026-10-02; EP-14 stories (SE-152..181) and DEF-038 (SE-182) and REQ-USE-26 (SE-183) added 2026-10-03. Every story and bug is linked to its epic (parent). Source: `jira/SE-key-map.csv`.

| Type | ID to key |
|---|---|
| Epics | EP-01 = SE-1, EP-02 = SE-2, EP-03 = SE-3, EP-04 = SE-4, EP-05 = SE-5, EP-06 = SE-6, EP-07 = SE-7, EP-08 = SE-8, EP-09 = SE-9, EP-10 = SE-10, EP-11 = SE-11, EP-12 = SE-12, EP-13 = SE-13, EP-14 = SE-152 |
| Stories | REQ-AUTH-01 = SE-14, REQ-AUTH-02 = SE-15, REQ-AUTH-03 = SE-16, REQ-AUTH-04 = SE-17, REQ-AUTH-05 = SE-18, REQ-AUTH-06 = SE-19, REQ-AUTH-07 = SE-20, REQ-AUTH-08 = SE-21, REQ-AUTH-09 = SE-22, REQ-AUTH-10 = SE-23, REQ-AUTH-11 = SE-24, REQ-TRIP-01 = SE-25, REQ-TRIP-02 = SE-26, REQ-TRIP-03 = SE-27, REQ-TRIP-04 = SE-28, REQ-TRIP-05 = SE-29, REQ-TRIP-06 = SE-30, REQ-TRIP-07 = SE-31, REQ-TRIP-08 = SE-32, REQ-TRIP-09 = SE-33, REQ-TRIP-10 = SE-34, REQ-TRIP-11 = SE-35, REQ-TRIP-12 = SE-36, REQ-CIRC-01 = SE-37, REQ-CIRC-02 = SE-38, REQ-CIRC-03 = SE-39, REQ-CIRC-04 = SE-40, REQ-CIRC-05 = SE-41, REQ-CIRC-06 = SE-42, REQ-CIRC-07 = SE-43, REQ-CIRC-08 = SE-44, REQ-CIRC-09 = SE-45, REQ-EXP-01 = SE-46, REQ-EXP-02 = SE-47, REQ-EXP-03 = SE-48, REQ-EXP-04 = SE-49, REQ-EXP-05 = SE-50, REQ-EXP-06 = SE-51, REQ-EXP-07 = SE-52, REQ-EXP-08 = SE-53, REQ-EXP-09 = SE-54, REQ-EXP-10 = SE-55, REQ-EXP-11 = SE-56, REQ-EXP-12 = SE-57, REQ-EXP-13 = SE-58, REQ-EXP-14 = SE-59, REQ-EXP-15 = SE-60, REQ-EXP-16 = SE-61, REQ-BAL-01 = SE-62, REQ-BAL-02 = SE-63, REQ-BAL-03 = SE-64, REQ-BAL-04 = SE-65, REQ-BAL-05 = SE-66, REQ-BAL-06 = SE-67, REQ-BAL-07 = SE-68, REQ-BAL-08 = SE-69, REQ-BAL-09 = SE-70, REQ-REP-01 = SE-71, REQ-REP-02 = SE-72, REQ-REP-03 = SE-73, REQ-REP-04 = SE-74, REQ-REP-05 = SE-75, REQ-REP-06 = SE-76, REQ-ACT-01 = SE-77, REQ-ACT-02 = SE-78, REQ-ACT-03 = SE-79, REQ-ACT-04 = SE-80, REQ-ACT-05 = SE-81, REQ-OFF-01 = SE-82, REQ-OFF-02 = SE-83, REQ-OFF-03 = SE-84, REQ-OFF-04 = SE-85, REQ-OFF-05 = SE-86, REQ-ADM-01 = SE-87, REQ-ADM-02 = SE-88, REQ-ADM-03 = SE-89, REQ-ADM-04 = SE-90, REQ-ADM-05 = SE-91, REQ-ADM-06 = SE-92, REQ-ADM-07 = SE-93, REQ-ADM-08 = SE-94, REQ-ADM-09 = SE-95, REQ-ADM-10 = SE-96, REQ-ONB-01 = SE-97, REQ-ONB-02 = SE-98, REQ-ONB-03 = SE-99, REQ-ONB-04 = SE-100, REQ-SEC-01 = SE-101, REQ-SEC-02 = SE-102, REQ-SEC-03 = SE-103, REQ-SEC-04 = SE-104, REQ-SEC-05 = SE-105, REQ-SEC-06 = SE-106, REQ-GRO-01 = SE-107, REQ-GRO-02 = SE-108, REQ-GRO-03 = SE-109, REQ-GRO-04 = SE-110, REQ-FUND-01 = SE-111, REQ-USE-01 = SE-153, REQ-USE-02 = SE-154, REQ-USE-03 = SE-155, REQ-USE-04 = SE-156, REQ-USE-05 = SE-157, REQ-USE-06 = SE-158, REQ-USE-07 = SE-159, REQ-USE-08 = SE-160, REQ-USE-09 = SE-161, REQ-USE-10 = SE-162, REQ-USE-11 = SE-163, REQ-USE-12 = SE-164, REQ-USE-23 = SE-165, REQ-USE-24 = SE-166, REQ-USE-25 = SE-167, REQ-INV-01 = SE-168, REQ-INV-03 = SE-169, REQ-INV-04 = SE-170, REQ-INV-02 = SE-171, REQ-USE-13 = SE-172, REQ-USE-14 = SE-173, REQ-USE-15 = SE-174, REQ-USE-16 = SE-175, REQ-USE-17 = SE-176, REQ-USE-18 = SE-177, REQ-USE-19 = SE-178, REQ-USE-20 = SE-179, REQ-USE-21 = SE-180, REQ-USE-22 = SE-181 |
| Bugs | DEF-001 = SE-112, DEF-002 = SE-113, DEF-003 = SE-114, DEF-004 = SE-115, DEF-005 = SE-116, DEF-005b = SE-117, DEF-006 = SE-118, DEF-007 = SE-119, DEF-008 = SE-120, DEF-009 = SE-121, DEF-010 = SE-122, DEF-011 = SE-123, DEF-012 = SE-124, DEF-013 = SE-125, DEF-013b = SE-126, DEF-014 = SE-127, DEF-015 = SE-128, DEF-016 = SE-129, DEF-017 = SE-130, DEF-018 = SE-131, DEF-019 = SE-132, DEF-020 = SE-133, DEF-020b = SE-134, DEF-021b = SE-135, DEF-022 = SE-136, DEF-023 = SE-137, DEF-024 = SE-138, DEF-025 = SE-139, DEF-026 = SE-140, DEF-027 = SE-141, DEF-028 = SE-142, DEF-029 = SE-143, DEF-030 = SE-144, DEF-031 = SE-145, DEF-032 = SE-146, DEF-033 = SE-147, DEF-034 = SE-148, DEF-035 = SE-149, DEF-036 = SE-150, DEF-037 = SE-151, DEF-038 = SE-182, REQ-USE-26 = SE-183 |

## 11. Sprint plan

Sprints are working bursts, assigned by the date a story or bug first shipped (from git history). Pushes are release markers, not sprints. Closed sprints hold only completed work; open items stay in the backlog. From Sprint 6 onward every new feature is assigned to a sprint with a goal before it is built.

| Sprint | Dates | Goal | Issues |
|---|---|---|---|
| Sprint 0 | 2 to 4 Sep | Core functionality: accounts, trips, expenses and splits, balances, reports, offline, platform admin, security baseline | 49 |
| Sprint 1 | 5 to 7 Sep | CSV import, typed-sentence expenses, push and activity feed, cover photos, Circles, Trip rename, Help | 17 |
| Sprint 2 | 13 Sep | Shares and Adjustment splits, Circle sync and settings, public overview page | 4 |
| Sprint 3 | 30 Sep | QA fixes round 1 | 15 |
| Sprint 4 | 1 Oct | QA fixes round 2 | 13 (DEF-009 is partial, so it returned to the backlog on close) |
| Sprint 5 | 2 Oct | Abuse protection, onboarding, navigation, install prompt, removal-with-balance block | 15 |
| Sprint 6 | 3 Oct onward (planned) | Regression sweep, AT-09 and ATR-03, settlement summary, amount calculator, DEF-025, DEF-026 | 4 |
| Sprint 7 | 3 Oct (closed) | Usage insights phase 1, the never-signed-in group and per-invite share links. Shipped in pushes 24e35ae (migrations 049 to 051 fixes in b8972d5), 9a14398 (REQ-USE-25) and e3e3cfd (REQ-INV-01, migration 054) | 11 (REQ-USE-01..09, REQ-USE-25, REQ-INV-01) |
| Sprint 8 | 3 Oct (active) | Usage insights phase 2: feature adoption, top events this week, per-user timeline, devices and install mode, device filter, live users now (REQ-USE-26, added at the owner's request) (their data is already being collected). Started on the board 3 Oct 2026; no end date set | 6 (REQ-USE-10, 11, 12, 23, 24, 26) |

The board has one Sprint 7 for both the usage and invite stories; the earlier draft split them into Sprints 7 and 9. Not in any sprint: parked and not-built requirements, and open bugs DEF-028, DEF-030, DEF-031, DEF-035, DEF-036. Story dates for requirements are estimates from the roadmap and commit history; bug dates come from their fix commits.

## 12. Release labels

Every push to `main` deploys to production. Each shipped story and bug on the board carries a label `rel-<date>-<tip sha>` naming the push that first delivered it (114 issues, 32 releases). `RELEASES.md` lists all 60 pushes with the issues each one shipped; rebuild it with `jira/build_releases.py`. Sprints follow commit dates, labels follow push dates, so a fix committed late on 1 Oct and pushed after midnight sits in Sprint 4 with a 2 Oct label (DEF-008, DEF-019, REQ-BAL-07). REQ-ACT-05 moved to Sprint 1 to match its push. For new work, add the `rel-` label when the push is made.
