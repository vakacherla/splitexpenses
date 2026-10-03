# Usage Insights: epic and stories (draft for approval)

Status: **DRAFT, nothing built.** Design and mockups: https://claude.ai/artifact/2AjyRgZHFTwj1YTGGmy3re

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

## Invite stories (separate feature, feed the funnel)

These are product features, not admin analytics, so they belong under EP-02 Trips (or EP-12 Growth, where join-by-link is already parked). They are listed here because REQ-USE-07 reads from them. Decision 3 Oct 2026: build links first, email later.

### REQ-INV-01 Per-invite share links
As a trip member I can invite a friend with a link made just for that invite, and share it through any app on my phone.
- "Invite a friend" in the trip members panel creates a unique, unguessable link (random token, not the trip's invite code).
- Share through the device share sheet (WhatsApp, text and so on) or copy the link. Where the share sheet is unavailable, copy only.
- Optional "Who is this for?" label (a first name or nickname, never an email). Shown only to the inviter and the trip creator. **Default included; owner has not confirmed, easy to drop.**
- New table `invites(id, token, group_id, inviter_id, label, created_at, accepted_by, accepted_at, expires_at)`. One invite is one link; accepting it joins the trip like the existing code does and records who accepted. Links expire (default 14 days) and can be revoked by the inviter.
- RLS: members can create and see invites for their own trips; accept goes through a `SECURITY DEFINER` function (same pattern as `join_group_by_code`) that checks expiry, revocation, suspended users, and that the person is not already a member. The existing trip code keeps working.
- Respects abuse rules: per-user daily cap on created links (default 20), suspended users refused.
- Feeds REQ-USE-07: created vs accepted counts, per inviter and per trip. Admin views show names and avatars only, never emails.
- Tests: expired, revoked and reused links; accept by an existing member; cap enforcement; non-member cannot create; accepted-by recorded once.
- Ask-before-prod: migration push, deploy and `git push` are separate approvals.

### REQ-INV-02 Email invites and reminders (PARKED until a sending domain is verified in Resend)
As a trip member I can enter my friends' email addresses and the app sends each an invite, and one reminder if they have not joined.
- Blocked by: domain bought and verified in Resend (same blocker as REQ-AUTH-11); until then Resend only delivers to the owner's own address.
- Builds on REQ-INV-01: an email invite is a link invite with a recipient email attached, so sent vs accepted per person comes for free.
- Guardrails (all required, none optional): daily cap per user; reuse the blocked-email-domain list; reply-to is the inviter; unsubscribe link in every message and a suppression list that is checked before every send; at most one reminder, after 3 days, only if not joined; a friend's email is deleted when they join or after 30 days, whichever comes first; the address is never used for anything else; the usage and privacy notice says so.
- Enables the "invited but did not join" list in the admin and REQ-USE-18 nudges.
- Not sized or scheduled. Revisit when the domain exists.

## Backlog candidate: awaiting a decision

### REQ-USE-13 Trip pulse for trip creators (candidate, later)
The existing per-trip Reports tab is already visible to every member of a trip, creators included. Trip pulse would be a small panel only the trip creator sees in their own trip, for example: "Dev and Anita have not added an expense", "Priya has not joined, the invite code is unused", "Maya has been owed money for 12 days". It uses data creators can already read (`activity_events`, `group_members`, balances), needs no tracking, and would be built under EP-02 Trips, not admin analytics. Not sized or scheduled; owner has not yet decided.

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
1. Trip pulse (REQ-USE-13): yes, no, or later?
2. Device filter (`REQ-USE-24`): drafted for Track C as recommended; confirm or drop.
3. Confirm the epic name and key (EP-14) when the board issues are created.
