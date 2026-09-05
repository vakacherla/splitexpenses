# Handoff summary

Written to travel — paste this into a fresh Claude Code session, or just
keep it as the "what happened and why" record. The four docs it points to
(`README.md`, `ARCHITECTURE.md`, `PRODUCT-ROADMAP.md`, `TESTING.md`) hold
the actual detail; this is the map, not the territory. This file
describes the session that just ended — for what happened before that,
`git log` and `PRODUCT-ROADMAP.md`'s own "Shipped" entries are the
record, not this file's history.

## What this is

**Split Expenses** — a multi-currency group expense-splitting web app.
React + Vite + Tailwind v4 on the frontend, Supabase (Postgres + Auth +
Storage + Edge Functions) as the entire backend, Vercel for static
hosting. Live at `https://varanasi-eta.vercel.app`. Built for a real
family pilgrimage trip, but built to work for any group.

## System shape

```
Browser (React SPA)
   │  compiled JS bundle, handed over once
   ▼
Vercel — static hosting only, nothing runs here at request time

Browser (React SPA)
   │  every runtime read/write goes straight here — authorized by
   │  row-level security, no application server in between
   ▼
Supabase
   ├─ Postgres (RLS)
   ├─ Auth ──sends email via── Resend SMTP (noreply@mail.rajarori.com) ──► user's inbox
   ├─ Storage — receipt photos, profile avatars, group cover-photo banners
   └─ Edge Functions — exist only because these need a secret the browser can't hold
        ├─ admin-users          service-role key (admin list/suspend/promote/etc.)
        ├─ receipt-scan         Gemini / OpenRouter key (AI receipt parsing)
        ├─ parse-expense-text   Gemini / OpenRouter key (typed-sentence parsing — new this session)
        ├─ remind               manual "nudge to settle up" (sends a push)
        ├─ trip-reminders-cron  pg_cron daily sweep (sends a push)
        └─ notify-group         general activity push (new this session — expense added, payment recorded, CSV import)

Called directly from the browser — no secret involved, so no Edge Function needed
   ├─ Frankfurter API (api.frankfurter.dev) — exchange rates
   └─ Web Push (VITE_VAPID_PUBLIC_KEY)      — push subscription
```

`ARCHITECTURE.md`'s "The shape, in one paragraph" section and its risk
log underneath have the actual reasoning and tradeoffs — this diagram
is just kept current alongside it.

**Tech stack** — unchanged from before this session (no new frontend
dependencies added): React 19, Vite 8, React Router 7, Tailwind CSS v4,
Recharts; Supabase (Postgres 17, Auth, Storage, Edge Functions/Deno);
Vitest, `oxlint`; Vercel + GitHub (`vakacherla/splitexpenses`, public
repo); Resend, Frankfurter API, Web Push, Google Gemini/OpenRouter (now
backing two features — receipt scanning and sentence parsing, not one).

## Everything built this session, grouped

**CSV bulk-import** — the top-ranked open roadmap item. Bring in a
backlog already tracked in a spreadsheet: a strict template (mirrors the
existing CSV export's columns, email instead of name for exact person
matching), a "Download template" link inline in the modal, a mandatory
preview table, and **all-or-nothing validation** — one bad row rejects
the whole file with every problem listed, nothing silently skipped.
Every import is tagged (`import_batches`, migration 021) so it's
undoable in one click, either right after or later from Group settings.
**Capped at 500 rows per file**, stated up front in the modal (added
after this session's own work was reviewed and the cap was flagged as
missing) — the import loop inserts one row at a time, no batching, so an
unbounded file would just get slower with no warning.

Needs a live connection to actually write (parsing/previewing works
offline, the "Import" button doesn't) — a bulk import can't safely go
through the offline write queue, since that queue has no all-or-nothing
concept and this feature's whole value is that guarantee. If the
connection drops mid-import anyway, whatever it created gets
automatically rolled back. **Real bug caught live, not in review:** the
first version of that rollback tried to hard-*delete* the batch row,
which silently failed (a still-existing soft-deleted expense's foreign
key blocks it, and supabase-js doesn't throw on query errors) and left a
"ghost" batch behind — fixed by marking it undone instead (migrations
022→023 revert the unneeded delete policy).

**Log an expense by typing a sentence** — "lunch 24.50 split with Anna
and Ben" parsed straight into a categorized, split expense. New
`parse-expense-text` Edge Function, a structural copy of `receipt-scan`
(same Gemini/Qwen fallback, same auth pattern) with the image input
swapped for text. The one new problem a receipt never had — resolving
names to real people — is solved by constraining the response schema's
`payer_id`/`participant_ids` to an enum of the group's actual member
ids, so the model can match "Anna" or "I"/"me" to the right person but
can never hallucinate one that doesn't exist; whatever it can't resolve
falls back exactly like a fresh manual add does (payer → the caller,
participants → everyone).

**Custom group cover-photo banner** — started as a small planned
"per-group icon upload," reconsidered mid-plan to a wide cover photo
instead, since the actual use case is a real trip photo, which a tiny
square crop would do little justice to. New `group-banners` Storage
bucket + `groups.banner_path`; shows full-bleed on the Dashboard card
and the group page, falling back to an accent-gradient + first-letter
treatment (promoted from what used to be a small corner watermark) when
unset. **Real RLS bug caught live:** the storage policy's first version
did a raw join against `group_members`/`groups` from inside the policy
check — those tables are themselves RLS-protected, and a plain query
against them nested inside another table's RLS evaluation doesn't
resolve the same way, so uploading failed even as the group's own owner.
Fixed with a `SECURITY DEFINER` helper (`can_manage_group()`, migration
025 following 024), the same pattern the existing `receipts` bucket
policy already used via `is_group_member()` — worth remembering for any
future Storage policy that needs to check other tables.

**Push notifications + a persistent activity feed** — the last roadmap
priority item, built at the fuller of two possible scopes (notifications
alone vs. notifications + a browsable feed) on request. New append-only
`activity_events` table (migration 026) — current schema can't
reconstruct a removed member or an edit's history, only a live snapshot.
Logs expense add/edit/delete, settlement record/undo, member
joined/removed, and one consolidated row per CSV import (verified live:
a multi-row import produces exactly one feed entry). Pushes only for
expense-added, settlement-recorded (targeted at just the other party),
and CSV-import — edits/deletes/membership changes are feed-only, to keep
push from getting noisy. New "Activity" tab on the group page, alongside
Ledger/Balances/Reports/Members. Reuses essentially all the existing
push plumbing from the settle-up reminder work (`push_subscriptions`,
VAPID keys, the service worker's already-generic `push` handler) via a
new `notify-group` Edge Function that validates every target against
real group membership rather than trusting the client's list — verified
live that a fake/non-member id passed as a target comes back
`targeted: 0`. `_shared/notify.ts`'s `sendReminderPush` renamed to
`sendPush` since it was already fully generic. The service worker's
`notificationclick` now deep-links to the group that triggered it
instead of always opening `/dashboard`.

**Documentation catch-up, done at the end of this session on request**
(a good habit to repeat): `PRODUCT-ROADMAP.md`'s feature-comparison table
had gone stale — it still listed Search/filter, Default splits, Data
export, Settle-up deep link, Offline mode, and Comments as **Absent**
long after all of them had shipped in earlier sessions; fixed, and the
closing "where to start" section (which was still pointing at the
settle-up deep link as the next thing to build) rewritten to reflect
that everything in "Now" and three of "Next"'s four items are done.
`HelpPage.jsx` had never been updated for *any* of this session's
features, or for some from before it — added sections for CSV
import/export/search, the sentence-parser, the Activity tab and
notifications (including a first mention that notification settings
even exist, which had never been documented), and a "Group settings"
paragraph covering rename/trip-dates/duplicate/cover-photo together
(the gear-icon modal itself had never been documented either).

## Current state

- **27 migrations** (`002` through `028`), all applied to the live
  database as of this session ending
- **6 Edge Functions**: `admin-users`, `receipt-scan`,
  `parse-expense-text` (new), `remind`, `trip-reminders-cron`,
  `notify-group` (new) — all deployed live
- **92 automated unit tests** (`npm test`) — 26 new this session
  (`src/lib/tripDates.test.js`: exact boundaries, off-by-one, leap days,
  whitespace/garbage strings, missing arguments, combined failures) on
  top of the earlier 18 (`src/lib/csvImport.test.js`). Everything else
  new this session (the Edge Functions, the activity feed, the banner
  upload/redesign) is manual-checklist-verified against the live dev
  server and the real Supabase project, same as this app's established
  pattern for AI-integration and Storage-RLS paths
- **Git**: `origin/main` up to date through `78827cf` — every commit
  this session pushed individually, in the order the features shipped
- **New Storage buckets**: `group-banners` (public read, owner/manager
  write via `can_manage_group()`) — `avatars` and `receipts` unchanged

## Follow-up work, same session, after the above was written

**Cover-photo upload control, redesigned.** The upload affordance went
through several rounds of live design feedback after first shipping: a
plain text link → an accent-colored pill badge (read as too washed
out/too loud in different combinations) → landed on reusing the dashed
dropzone pattern `AddExpenseForm`'s receipt scanner already established,
so it reads as native to the app rather than a one-off treatment. The
hint copy was simplified from "Best as a wide photo, about 3:1 (e.g.
1200×400px)" to "Landscape photos work best — square or portrait shots
will get cropped to fit." — dropping the pixel/ratio jargon. **Lesson:**
when a small UI detail goes through repeated "still doesn't look right"
feedback, the fix usually isn't another color/weight tweak — check
whether the app already has an established pattern for this exact kind
of control before inventing a new one.

**Real bug caught in production testing: trip end date could be set
before the start date, with zero validation anywhere** (client or
database) — and separately, a native `<input type="date">` accepts a
typed year like `0005` or `0644` with no complaint, which the
ordering-only fix didn't catch (a start/end pair with two absurd years
can still be validly "ordered"). Fixed in two passes:

1. `src/lib/tripDates.js` (`validateTripDates`) — ordering check, wired
   into `GroupSettingsModal` (Save disables + inline error) with
   matching `min`/`max` on the date inputs. Migration 027 adds the same
   check as a DB constraint, correcting the one already-bad row found in
   the wild by swapping start/end (a sensible correction for an ordering
   mistake).
2. Caught via manual production testing that the year-range case wasn't
   covered — `validateTripDates` extended to bound each date to
   2000–2100 independently of ordering. Migration 028 adds the matching
   DB constraint, first nulling out the one row with a typo'd year
   (`0005`/`0644` has no sensible "corrected" value, unlike an ordering
   swap, so it's cleared rather than guessed).

Both migrations applied directly via `supabase db push` (CLI already
linked to the project) rather than the manual SQL-Editor-paste path
described in `README.md` — worth knowing that path exists and is faster
when the CLI is already authenticated.

## Operational lessons worth carrying forward

1. **A Storage RLS policy that needs to check other tables must use a
   `SECURITY DEFINER` helper, not a raw join.** Those other tables
   (`group_members`, `groups`) are themselves RLS-protected, and a plain
   query against them from inside another table's policy evaluation
   doesn't resolve the same way — it can silently deny access that
   should be allowed. The existing `receipts` bucket policy already knew
   this (via `is_group_member()`); the new `group-banners` one didn't at
   first, and failed live even for the group's own owner before being
   fixed the same way.
2. **supabase-js resolves a query error, it doesn't throw one.** Any
   `await supabase.from(...)...` whose `{ error }` isn't checked can
   fail completely silently — this matters most in cleanup/rollback
   code, where nothing else is watching for the failure. Found via a
   CSV-import rollback that tried to delete a row a foreign key was
   still blocking, "succeeded" from the code's point of view, and left
   a ghost record behind.
3. **Offline-queued operations need their own display-name context
   stashed at enqueue time**, not looked up at sync time. `offlineQueue.js`'s
   apply functions run later, detached from the component that queued
   them, with no access to `members`/`group` state — the same reasoning
   `homeCurrency` was already stashed in the payload for the exchange-rate
   lookup now also applies to `actorName`/`groupName` for activity
   logging.
4. **Docs drift even when the roadmap doc itself is kept current per
   feature.** The feature-comparison table and the closing "start here"
   section are separate prose that doesn't auto-update just because the
   detailed "Shipped" bullets above them do — worth a deliberate skim of
   the *whole* roadmap doc (not just the section just edited) before
   calling a docs pass done. `HelpPage.jsx` drifts independently of
   `PRODUCT-ROADMAP.md` entirely — nothing keeps them in sync
   automatically, so a new user-facing feature needs its own explicit
   Help update, checked for, not assumed.
5. **A native `<input type="date">` validates *format*, not
   *plausibility*.** It'll refuse "13/45/2026" but happily accepts a
   typed year like "0005" — so "add a date field" quietly needs its own
   sane-range check (and, for a start/end pair, its own ordering check)
   every time; neither is a given from the input type alone. Both need
   checking at the database layer too, not just in the component, for
   any table only ever touched via a plain `.update()` with no RPC in
   front of it — nothing else stops a future caller from skipping
   whatever the client-side check does.

(Earlier sessions' lessons — `color-mix()` percentage clamping, the
PostgREST embed ambiguity fix, Safari's query-error-vs-rejection
behavior, `schema.sql` drift, the mock-first-for-visual-passes pattern,
`emailRedirectTo`'s allow-list requirement, and Supabase's two separate
email throttles — are still valid and still worth knowing; trimmed from
this file since they're about code that hasn't changed, not this
session. `git log` on the relevant files is the way back to that detail
if it's needed again.)

## What a fresh session should probably do first

Check on: whether the Shared Fund BRD (the one remaining roadmap
priority item) got a family verdict — it's the only thing left in that
ranked list, blocked on that, not on effort. The stray `splitexpenses`
Vercel project cleanup (`vercel remove splitexpenses --yes`) is still
outstanding from before this session — untouched, still worth doing.
Whether the Dashboard/GroupView visual language (cover photos now
settled, dropzone-style upload) should extend further — Admin and Login
haven't had a visual pass yet. Worth a quick pass over other date/number
inputs in the app (expense date, amounts) for the same class of
"format-valid but implausible" gap trip dates just had — none reported
yet, but none had been checked for it either before this session.
