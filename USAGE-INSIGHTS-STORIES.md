# Usage Insights: epic and stories (draft for approval)

Status: **Phase 1 (REQ-USE-01..09) shipped to production on 3 Oct 2026.** Phase 2 and the parked items are not built. Design and mockups: https://claude.ai/artifact/2AjyRgZHFTwj1YTGGmy3re

Goal: give the platform admin a **Usage** tab in `/admin` that shows who is active, where new users get stuck, and which features get tried and repeated, so adoption work is driven by data. First-party only (Supabase), no paid third-party tools.

## Epic

| Epic | Name | Notes |
|---|---|---|
| EP-14 | Usage insights (admin) | New epic, key to be assigned on the board. Stories are `REQ-USE-nn`. Sits next to EP-09 Platform admin. |

Delivery is **parallel and flexible** (owner decision). Sprint numbers are labels, not a strict sequence. The only hard rule is that anything reading tracking data waits for tracking to exist.

| Track | Stories | Depends on | Goal |
|---|---|---|---|
| A: collection | USE-01, 02, 03, 04 | nothing | Start collecting usage data as early as possible, because it cannot be backfilled |
| B: reports from existing data | USE-05, 07, 08, 09 | nothing | Ship the Usage tab with funnel, time to first expense and stuck users from tables we already have |
| C: tracking-based reports | USE-06 (true DAU, WAU, MAU), USE-10, 11, 12, 23, 24 | Track A has run a few weeks | Feature adoption and true active-user numbers |

BRD section 11 still needs a sprint and goal for each story before it is built. Proposed: Tracks A and B in **Sprint 7**, Track C in **Sprint 8**, movable. Each story is still released and pushed to production separately with the owner's approval.

Sprint 6 stays as planned (regression sweep, settlement summary, amount calculator, DEF-025, DEF-026). Phases 3 to 5 stay parked until the user base reaches a few hundred (owner decision, 3 Oct 2026).

## Definitions (these decide what every number means)

| Term | Definition |
|---|---|
| Qualifying event | `app_open`, `page_view`, `feature_used`, or a milestone event (`trip_created`, `expense_added`, `settled_up`, `member_invited`). Background activity (service worker sync, push delivery, offline queue flush) does not count. |
| Active user | A signed-in, non-suspended user with at least one qualifying event in the window. Counted as **distinct users**, never as events. |
| DAU | Distinct active users in one calendar day. |
| WAU, MAU | Distinct active users in the 7 and 30 days ending today (rolling windows). |
| Stickiness | **Average DAU over the last 30 days divided by MAU.** Average, not today's DAU, because with a small base a single day swings too much. |
| Active now | Distinct users whose `last_seen_at` is within the last 5 minutes. |
| Excluded accounts | Admins, super admins and test accounts (email prefix `E2E-TEST`) are excluded by default. A checkbox in the filters bar turns the exclusion off. |
| Day boundary | Calendar day in the **admin's browser timezone**, sent as a parameter with every `admin_usage_*` call, falling back to UTC when missing. No fixed zone is hardcoded. (Owner decision, 3 Oct 2026: a fixed Asia/Kolkata assumption was rejected.) |

## Phase 1 (Sprint 7, must have)

### REQ-USE-01 Usage notice and Profile switch
As a user I am told in plain words that feature usage is recorded for maintenance and new features, and I can switch it off.
- Notice text shown at sign-up, in Help, and in Profile: records which features are used and the general type of device (phone, tablet or computer, and whether the app is installed), never amounts, descriptions, names or trip content, never sold or shared.
- Profile has a "Share usage data" switch, default on. Stored as `profiles.share_usage boolean not null default true`.
- When off: the client sends no events, and the database also refuses inserts for that user (enforced in RLS, not only in the UI).
- Turning it off does not delete past events. Account deletion does (cascade, see REQ-USE-02).
- Tests: switch off then confirm zero rows inserted; switch on then rows resume; notice visible on the three screens.
- Needs: migration (profiles column), UI in Profile, copy in sign-up and Help.

### REQ-USE-02 Usage event store with row-level security
As the platform owner I have a table that records usage events safely.
- Migration `049_app_events.sql`: `app_events(id, user_id, name, props jsonb, session_id, created_at)`, `user_id` references `profiles(id) on delete cascade`.
- `name` restricted by a CHECK allowlist (feature list in the design doc). `props` capped in size (CHECK on `pg_column_size`) and validated to contain only allowlisted keys (`feature`, `route`, `split_type`, `form_factor`, `install_mode`, `os`, `browser`) with allowlisted values for the device keys.
- RLS: authenticated users may insert only rows where `user_id = auth.uid()` and their `share_usage` is true; suspended users are refused (same rule as migration 047). **No select policy** for anyone through the API.
- Indexes on `(created_at)`, `(user_id, created_at)`, `(name, created_at)`.
- `supabase/schema.sql` updated alongside the migration (repo convention).
- Tests: user cannot insert for another user; user cannot select; non-allowlisted name rejected; oversized props rejected; suspended user rejected.
- Ask-before-prod: `supabase db push` is a separate approval.

### REQ-USE-03 Client tracking helper and first instrumentation
As the platform owner I get consistent events from the app without slowing it down or leaking content.
- `src/lib/track.js` with `track(name, props)`, pure logic in the lib and a sibling `track.test.js`.
- Batches events and flushes on a short timer and on page hide; never blocks UI; failures are swallowed and never shown to the user; no events while offline (dropped, not queued).
- Adds a random `session_id` per tab session. No device ids, no IP, **no raw user-agent string stored**.
- `app_open` also carries four coarse device labels, worked out in the browser by a pure function `detectDevice(env)` in `src/lib/device.js` (sibling `device.test.js`, tested with fake environments, never against the real `navigator`):
  - `form_factor`: `phone`, `tablet` or `desktop`. Uses client hints (`navigator.userAgentData.mobile`) where available, otherwise the **physical screen size** (shorter side under 600 px is a phone, 600 px or more with touch is a tablet) plus touch support. Window width is not used, because a resized browser window would flip the answer. An iPad that identifies as a Mac is detected by Mac platform plus more than one touch point.
  - `install_mode`: `pwa` (installed, detected with `display-mode: standalone` or `navigator.standalone` on iOS) or `browser`.
  - `os`: `ios`, `android`, `windows`, `macos`, `linux` or `other`. iPadOS counts as `ios`.
  - `browser`: `chrome`, `safari`, `firefox`, `edge`, `samsung` or `other`. No version numbers.
  - Any value outside these lists is stored as `other`; detection failure never blocks tracking.
- Fires: `app_open` (once per session), `page_view` (route pattern only, for example `/trips/:id`), and milestone events at the existing success points: trip created, expense added (props: `split_type`), settled up, member invited.
- Does not read or send expense amounts, descriptions, names, emails or trip names.
- Respects `profiles.share_usage` (REQ-USE-01).
- Tests: batching, flush on hide, drop when offline, props allowlist, nothing sent when switch is off; `detectDevice` cases for iPhone, iPad as Mac, Android phone and tablet, laptop with touch screen, installed PWA on iOS and Android, unknown browser.

### REQ-USE-04 Last seen and "active now"
As the admin I can see who is online right now and when each user was last seen.
- `profiles.last_seen_at timestamptz`, updated by a small throttled call at most once every 5 minutes while the tab is visible.
- Not Supabase Realtime Presence: that keeps a connection open per user and hits plan connection limits.
- Admin-only reads. Not exposed to other users.
- Respects `share_usage` (owner decision): when the switch is off, `last_seen_at` is not updated. Those users appear in an "opted out" count in the Overview so they are not mistaken for inactive.
- Tests: throttle holds at 5 minutes; hidden tab does not update; non-admin cannot read others' values.

### REQ-USE-05 Usage tab shell and admin-only data access
As an admin I open a Usage tab next to Reports and see only aggregate data through guarded functions.
- New tab "Usage" in the `TABS` array of `AdminPage.jsx`, lazy-loaded like the others, with sub-views Overview, Funnel, Features (greyed "coming in phase 2"), Stuck users.
- Filters bar: period (7, 30, 90 days) and "Exclude admins and test accounts" (on by default). Applies to every view.
- All data comes from `SECURITY DEFINER` functions named `admin_usage_*`, each starting with an `is_platform_admin()` check, `set search_path`, and returning names and avatar paths only, never emails.
- Every chart has a Chart/Table toggle; empty and "not enough data" states (under 10 users) are designed, not blank.
- Recharts for charts, lazy-loaded so the main bundle does not grow.
- Tests: non-admin route redirects (existing `AdminRoute`); non-admin calling a function gets an error; period filter changes results.

### REQ-USE-06 Overview: active users
As an admin I see how many people use the app and whether it is growing.
- KPI tiles: Active now, DAU, WAU, MAU, Stickiness, each with change vs the previous period.
- Line chart of DAU and WAU for the selected period, with hover values, a visible legend and direct end labels, plus table view.
- Numbers match the definitions above. Before REQ-USE-03 ships, DAU is derived from write activity and sign-in only, and the tab says so in a small note until tracking data exists.
- Tests: a fixture with known events yields exact DAU, WAU, MAU and stickiness; admins and test accounts excluded; a user active twice in a day counts once.

### REQ-USE-07 Activation funnel
As an admin I see where new users drop off.
- Stages: signed up, created a trip, added an expense, **shared an invite**, **someone joined**, settled up. Counts for users who **signed up in the selected period**.
- Each stage shows count, % of signups, % of previous stage, and median time from the previous stage.
- Clicking a stage lists the users who stopped there (name and avatar, signup date, last seen), 10 per page.
- Phase 1 computes stages from existing tables (`profiles`, `groups`, `expenses`, `group_members`, `settlements`), so it works for historical signups.
- Both invite numbers are shown (owner decision): "shared an invite" is the user copying or sharing their trip invite code or link (needs an `invite_shared` event from Track A); "someone joined" is another user joining via that trip's code. The drop between them is the headline figure.
- Limit: trips are joined with a shared code, so until REQ-INV-01 ships the app does not know who an invite was for. We can count shares and joins per trip but cannot list the specific people who did not join. Nudging them depends on REQ-INV-02 (see below), not on this story.
- Data source: once REQ-INV-01 ships, "shared an invite" and "someone joined" are read from the `invites` table (created vs accepted). Until then they come from the `invite_shared` event and from joins via the trip code.
- Before Track A has data, "shared an invite" is unavailable and the funnel shows "someone joined" only, with a note.
- Tests: fixture users at each stage; drop-off lists exactly the stopped users; median time correct; soft-deleted trips and expenses do not count.

### REQ-USE-08 Time to first expense
As an admin I see how long it takes a new user to reach first value.
- Median and 90th percentile of signup to first expense, and a histogram (under 1 hour, 1 to 24 hours, 1 to 3 days, over 3 days, never), with table view.
- Never-added users shown as their own bar, not hidden.
- Tests: bucket boundaries; never bucket count equals signups minus converted.

### REQ-USE-09 Stuck users
As an admin I get a list of users who stalled, so I can follow up.
- Segments with counts: no trip yet, trip but no expense, never invited anyone, quiet 14+ days.
- Row shows name, avatar, what they stopped at, last seen, days stuck. **No email address anywhere.**
- Sort and segment filter; CSV export of the visible list (name only, no email).
- Test accounts excluded by default.
- Tests: each segment boundary (13, 14, 15 days quiet); a user in two segments appears in each; export has no email column.

## Phase 2 (Sprint 8, core, builds on the data from Sprint 7)

### REQ-USE-10 Feature adoption
As an admin I see which features are tried and which are repeated.
- Per feature: users who tried it, users who used it on 2+ separate days, as counts and as % of active users.
- Diagnosis pill: **Discovery gap** (tried by under 15% of active users), **Quality gap** (tried by 15% or more but repeated by under 30% of those), **Healthy** otherwise. Thresholds stored as constants so they can be tuned.
- Under 10 users total: shows the numbers but no diagnosis.
- Chart is a stacked bar (repeated plus tried once); table view lists all columns.
- Covers write and browse features (receipt scan, text parse, itemized split, CSV import and export, settle up, invite link, circles, trip reports, rates, reminders, push opt-in, offline queue, help, tour).
- Tests: boundary cases for each diagnosis; one-day repeat counts as one.

### REQ-USE-11 Top events this week
As an admin I see what active users actually did.
- Distinct users per event for the last 7 days, top 8, chart and table.
- Tests: distinct counting; allowlisted events only.

### REQ-USE-12 Per-user activity timeline
As an admin I can open one user and see what they have been doing, to understand a stall.
- From the Stuck users list and the Users tab: timeline of events, newest first, name and avatar, no email, last 30 days.
- Reads only through an `admin_usage_*` function. Viewing is not logged in phase 2 (admin audit log is parked, REQ-USE-22).
- Tests: non-admin refused; timeline excludes props content that is not allowlisted.

### REQ-USE-23 Devices and install mode
As an admin I see which devices and install modes people use, so I know where to invest.
- Users and sessions by form factor (phone, tablet, desktop), by install mode (installed app vs browser), and by OS (iOS vs Android vs others), each as chart and table.
- Counts users per device type, so a person on two devices appears in both and shares can add up to more than 100%. The view says so.
- Under 10 users total: shows counts but no percentages.
- Excluded accounts and the opted-out rule apply like every other view.
- Tests: user on two devices counted once per device type; sessions vs users totals; PWA vs browser split.

### REQ-USE-24 Device filter across views
As an admin I can filter any usage view by form factor or install mode, for example the funnel for phone users only.
- Added to the shared filters bar; applies to funnel, stuck users and feature adoption where events carry the device labels.
- A user's device for filtering is the one on their most recent `app_open` in the period; users with several devices are included if any session matches (stated in the tooltip).
- Tests: filter combinations; users without device data (before tracking) shown as "unknown".

### REQ-USE-25 "Never signed in" group (added 3 Oct 2026)
As an admin I see people who created an account and never got in, so I can help them.
- Why: two real users could not get past sign-up in September (confirmation emails that never arrived). The other groups all start from "signed in at least once", so they could not show this.
- A person is in the group when their account is over an hour old and we have never seen them do anything: no sign-in, no heartbeat, no events, no writes.
- Each row says whether their email was ever confirmed ("Email never confirmed" or "Email confirmed, never signed in"). The yes/no is returned; the address never is. CSV carries the same yes/no.
- It is the first group on the Stuck users screen, with a short note explaining the two cases.
- Migration 053; `admin_usage_stuck` gains a last column `email_confirmed`, so the app can deploy before or after the migration.
- Tests: 050 SQL check 13 (members, email flag, a heartbeat removes someone, other groups still work after the function is replaced); unit tests for the CSV and the "stopped at" text.

### REQ-USE-26 Live users now (added 3 Oct 2026, Sprint 8)
As an admin I see who is in the app right now, so I can watch a launch or a fix land and see what people are doing.
- Added at the owner's request: the Overview already shows an "Active now" number (REQ-USE-04); this is the list behind it.
- A "Live now" card on Overview lists everyone with a heartbeat in the last 5 minutes (the same rule and the same eligible-people rule as the number, so the two agree). Each row: name, avatar, the part of the app they last opened ("Viewing a trip"), their device ("Phone · installed app · iOS"), and how long ago they were seen.
- "Where" comes from the route pattern of their last page view in the last 24 hours (never a real trip id or name); "device" from their last app open in the last 24 hours. Either can be missing, and the row then says "In the app" or "Unknown device".
- Refreshes itself every 30 seconds while the tab is visible, keeping the list on screen while it refreshes. Names and avatars only, no email. People who switched usage data off send no heartbeat, so they never appear.
- At most 50 people are listed, newest first; the heading shows the true count.
- The "Active now" tile on Overview is a button ("Click to see who") that jumps to this list; added after the owner pointed out that the bare number was not useful.
- Migration 058; tests: `058_usage_live_now.test.sql` (7 checks) and unit tests for the wording.

## Invite stories (separate feature, feed the funnel)

These are product features, not admin analytics, so they belong under EP-02 Trips (or EP-12 Growth, where join-by-link is already parked). They are listed here because REQ-USE-07 reads from them. Decision 3 Oct 2026: build links first, email later.

### REQ-INV-01 Per-invite share links (phase 1, built 3 Oct 2026)
Design and mockups: https://claude.ai/artifact/3ZVMNDBLeLPPgMU7TpCur6. The owner approved all seven design recommendations on 3 Oct 2026, and the invitation was asked to feel fun: the trip's own cover photo where there is one, a playful illustration where there isn't.
As a trip or Circle member I can invite a friend with a link made for that invite and share it anywhere, and the friend can join in one tap.
- **Link:** `/join/<token>`, a random 32-character token. One per invite, for trips and Circles. The address it is built on is one setting (`VITE_PUBLIC_APP_URL`, default the current address).
- **Rules:** any member can make one; up to 20 people; 14 days; once per person, so someone removed from a trip cannot return through it; at most 20 new links per person per day; a suspended inviter's links stop working. The six-letter codes are untouched.
- **Invite card** in the trip's and Circle's members panel: optional "Who is this for?" (only you see it), Create invite link, then Share… (phone share sheet), WhatsApp, Email (the person's own mail app), Copy link, a preview of the message, and the code as a quiet fallback.
- **Message:** "Hi! ✈️ I've set up “Goa weekend” on Split Expenses so we can split costs in any currency and settle up easily. Tap to join 👉 <link>". Never contains the private name.
- **Join screen** (public): the trip's cover photo, or one of eight playful illustrations (a sun in sunglasses, a smiling suitcase, a palm island, a looping plane, a camera, a tent under the moon, a smiling house, a ring of friends) picked from the trip's id; the inviter's first name and photo; Join (signed in) or Create account / I already have an account (signed out). Clear messages for expired, turned-off, full, removed, archived and invalid links, and for people already in.
- **Survives sign-up:** the invite is remembered through sign-up, sign-in, and the confirmation email (the email link returns to the invite, even on another device), and clears itself once used or dead, so it cannot loop.
- **Dashboard** "Join with a code" boxes accept the code, a pasted link, or a whole pasted chat message containing the link.
- **Link preview in chat:** a fixed card ("Join a trip on Split Expenses", a friendly picture) for every link. The trip's real name in the card is phase 3.
- **Recorded per link:** who made it, when, when and how it was first shared (share sheet, WhatsApp, email, copy), real opens, and who joined with it and whether their account was new. Closed to the API; admins see counts only, never the private name.
- Migration 054 (tables `invites`, `invite_accepts`; functions `create_invite`, `preview_invite`, `accept_invite`, `mark_invite_shared`). Written to paste into the Supabase SQL editor.
- **Tests:** 17 SQL checks (`supabase/tests/054_invite_links.test.sql`, verified to fail when membership, use-limit or removed-member rules are broken); 24 unit tests for the link logic; browser checks of the join screen in eight states, the invite card, sign-up survival and the redirect, against a mocked backend.
- **Needs outside the repo:** (1) run migration 054 in the SQL editor; (2) in Supabase Authentication → URL configuration, add the app's address with `/join/**` to the redirect list; (3) the link-preview picture address in `index.html` is the current Vercel address and must be updated when the app gets its own domain.

### REQ-INV-03 Invite visibility (phase 2)
- "Invites you sent" list for each trip and Circle: each link's label, when sent, how, and "not used yet" or "N joined"; share again; turn it off. The trip creator sees every member's invites; everyone else sees their own. Adds `list_invites` and `revoke_invite`.
- Invites report in Admin → Usage: created, opened, joined, new accounts, by channel, counts only. The funnel's "Shared an invite" step reads real invites instead of the copy-button event.

### REQ-INV-04 Invite links, phase 3 (later)
- Link-preview card with the trip's real name and cover photo (a small server function); "reset code" for the old six-letter code; "just one person" links.

### REQ-INV-02 Email invites and reminders (PARKED until a sending domain is verified in Resend)
As a trip member I can enter my friends' email addresses and the app sends each an invite, and one reminder if they have not joined.
- Blocked by: domain bought and verified in Resend (same blocker as REQ-AUTH-11); until then Resend only delivers to the owner's own address.
- Builds on REQ-INV-01: an email invite is a link invite with a recipient email attached, so sent vs accepted per person comes for free.
- Sender rules: the message is sent **from the app's own address on the verified domain, with the inviter's name as the display name** (for example "Priya via SplitExpenses"), subject "Priya invited you to 'Goa weekend' on SplitExpenses". **It never uses the inviter's own email address as the sender**: Gmail, Outlook and Yahoo reject or spam mail that falsely claims their domain, Resend refuses unverified sender domains, and it would be impersonation. The inviter's address appears as reply-to **only if the inviter ticks an opt-in box**, because it reveals their address to the recipient.
- Guardrails (all required, none optional): daily cap per user; reuse the blocked-email-domain list; unsubscribe link in every message and a suppression list that is checked before every send; at most one reminder, after 3 days, only if not joined; a friend's email is deleted when they join or after 30 days, whichever comes first; the address is never used for anything else; the usage and privacy notice says so.
- Enables the "invited but did not join" list in the admin and REQ-USE-18 nudges.
- Until the domain exists, the "Email" option in REQ-INV-01 covers the same need through the user's own mail app. A domain costs roughly 10 to 15 USD a year and also unblocks REQ-AUTH-11 (email confirmation) and more reliable password-reset email, so buying one is recommended regardless of this story.
- Not sized or scheduled. Revisit when the domain exists.

## Backlog candidate: awaiting a decision

### REQ-USE-13 Trip pulse for trip creators (candidate, later)
The existing per-trip Reports tab is already visible to every member of a trip, creators included. Trip pulse would be a small panel only the trip creator sees in their own trip, for example: "Dev and Anita have not added an expense", "Priya has not joined, the invite code is unused", "Maya has been owed money for 12 days". It uses data creators can already read (`activity_events`, `group_members`, balances), needs no tracking, and would be built under EP-02 Trips, not admin analytics. Not sized or scheduled. Owner delegated the call (3 Oct 2026); decision: later, after REQ-INV-01 ships, because it is most useful once invites carry a "who is this for?" label.

## Parked until the base reaches a few hundred users (phases 3 to 5)

| REQ | Story | Why parked |
|---|---|---|
| REQ-USE-14 | Weekly retention cohorts | Noisy with small cohorts |
| REQ-USE-15 | "Tried feature X vs not" retention comparison | Needs weeks of data and enough users |
| REQ-USE-16 | Active hours heatmap | Pattern invisible at low volume |
| REQ-USE-17 | Weekly adoption digest emailed to the admin (Resend) | Useful once numbers are stable |
| REQ-USE-18 | In-app tips and push or email nudges for stuck users | Needs the reports to be trusted first; also needs a send log. Nudging people who were invited but did not join depends on REQ-INV-02 |
| REQ-USE-19 | Threshold alerts | Needs a baseline |
| REQ-USE-20 | Daily rollup tables and 180-day raw event cleanup job | Only matters at volume |
| REQ-USE-21 | Test-account exclusion list managed in the UI | The `E2E-TEST` prefix rule is enough for now |
| REQ-USE-22 | Admin action audit log | Separate security story |

## Build notes: where the Phase 1 build differs from the stories above

Recorded 3 Oct 2026 on branch `feat/usage-insights-phase1`. Nothing here is applied to any database or pushed to `main`.

| Story | Written as | Built as | Why |
|---|---|---|---|
| REQ-USE-02 | insert-only RLS policy for the user's own rows | no policies at all; rows arrive only through `track_events()` | A function can enforce a 25-per-call and 2000-per-day cap, take the timestamp from the server so nobody can backdate, and drop invalid events silently. A direct insert policy could do none of that. |
| REQ-USE-04 | heartbeat at most every 5 minutes, "active now" = last 5 minutes | client beats every 2 minutes while the tab is visible; server ignores writes within 1 minute; "active now" is still the last 5 minutes | With a 5-minute heartbeat and a 5-minute window, a user who is actively using the app would flicker in and out of "active now". |
| REQ-USE-04 | `profiles.last_seen_at` | separate `user_activity` table with no policies | Profiles are readable by trip-mates, so a column there would let them see when you were last online. |
| Test accounts | "email prefix E2E-TEST" | email at `@example.com` (QA accounts, see migration 048) or display name starting `E2E-TEST` | The `E2E-TEST` prefix in HANDOFF.md names trips and circles, not accounts. My earlier wording was wrong. |
| REQ-USE-06 | Track C (needs weeks of tracking data) | built now; "active" = any tracked event plus writes, joins, the activity feed, the heartbeat and the latest sign-in | Works from day one and gets more accurate as events accumulate; the tab says so while no tracking data exists. |
| REQ-USE-07 | stage 2 "created a trip"; stages chained | stage 2 is "created or joined a trip"; stages 1 to 3 are chained; stages 4 to 6 (shared an invite, someone joined, settled up) are each measured among people who added an expense | People invited into a trip are users too and should not count as a drop-off for never creating one; and an invite can be shared outside the app, so the later stages are not strictly ordered. |
| REQ-USE-07 | "shared an invite" read from `invites` | read from the `invite_shared` event until REQ-INV-01 exists; shows "No data yet" rather than 0 before any such event | Matches the story note; avoids a misleading zero. |
| REQ-USE-09 | "never invited" | added expenses, is not in any trip that has someone else in it, and no `invite_shared` event | Does not depend on tracking data existing. The first version only looked at trips the person had created, so people who joined someone else's trip were wrongly listed; found by the owner on 3 Oct 2026 and fixed in migration 052. |
| REQ-USE-03 | events listed | also fires `feature_used` for receipt scan, text parse, CSV import and export, push opt-in and opening a trip's Reports tab | Collection cannot be backfilled, so the cheap ones start now; the Phase 2 adoption report needs them. |

Feature adoption (REQ-USE-10, migration 056) and top events (REQ-USE-11, migration 057) are built (3 Oct 2026). Devices (REQ-USE-23, migration 059) is built (3 Oct 2026). The device filter (REQ-USE-24, migration 060) is built (3 Oct 2026).

### Verification done

- `supabase/tests/049_usage_insights.test.sql`: 10 checks. `supabase/tests/050_usage_admin_reports.test.sql`: 12 checks with hand-computed expectations. Both run against a scratch Postgres 16 with Supabase-style roles, and were checked to fail when a leaking policy or the admin guard is removed.
- 59 new unit tests (device 20, tracker 20, notice 2, stats 17). Full suite 278 passing; lint at the 20-warning baseline; build clean.
- The Usage tab was driven in a real browser (light, dark, phone width) against a mocked backend, and the tracker's real network traffic was captured against a production build: with the switch on, one batched request carries `app_open` and `page_view` with phone/browser/ios/safari labels and route patterns only; with it off, no events and no heartbeat are sent.
- Not verified: anything against the real Supabase project. Migrations 049 and 050 have not been applied anywhere except the scratch database.

## Definition of done for every story (from HANDOFF.md)

1. Assigned to the sprint above with its goal before work starts.
2. BRD `REQ` row added with acceptance criteria and test IDs; Sheet `Req` column filled.
3. Pure logic in `src/lib/*.js` with a sibling `*.test.js`; schema change as a new numbered migration plus `supabase/schema.sql`.
4. Fix at the right layer: privacy rules live in RLS and database functions, not only in the UI.
5. Before pushing: grep consumers, unit tests, build, lint with no new warnings (baseline 20), and run the real flow with `E2E-TEST` data.
6. Owner approval before `supabase db push`, any function deploy, and any `git push`. One story at a time.
7. After the push, `rel-<date>-<sha>` label on each shipped issue.

## Open questions

Resolved 3 Oct 2026: device tracking by coarse browser-derived labels, no raw user agent (collection in REQ-USE-03, report in REQ-USE-23); day boundary (admin browser timezone, UTC fallback), invites (show shared and joined), switch (applies to last seen and active now), delivery (parallel tracks, flexible sprints).

Still open:
1. ~~Trip pulse (REQ-USE-13)~~ Decided: later, after REQ-INV-01.
2. Device filter (`REQ-USE-24`): drafted for Track C as recommended; confirm or drop.
3. Confirm the epic name and key (EP-14) when the board issues are created.
