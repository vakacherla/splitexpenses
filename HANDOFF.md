# Handoff summary

Written to travel — paste this into a fresh Claude Code session, or just
keep it as the "what happened and why" record. The four docs it points to
(`README.md`, `ARCHITECTURE.md`, `PRODUCT-ROADMAP.md`, `TESTING.md`) hold
the actual detail; this is the map, not the territory.

## What this is

**Split Expenses** — a multi-currency group expense-splitting web app.
React + Vite + Tailwind v4 on the frontend, Supabase (Postgres + Auth +
Storage + Edge Functions) as the entire backend, Vercel for static
hosting. Live at `https://varanasi-eta.vercel.app`. Built for a real
family pilgrimage trip, but built to work for any group. Working
directly in Claude Code on the real project files, in a real git repo —
the "should we move to git" question a previous handoff raised is
resolved; this section of history doesn't need repeating.

## Everything built in this session, grouped

**Admin, with real gaps closed by using it:** a super admin can add *or
remove* a user from any group directly, bypassing the invite code
(`admin_add_user_to_group` / `admin_remove_user_from_group`, migrations
018-019) — the "Manage groups" control on each user's row in Admin →
Users. Every group now shows who created it and when. A new **Admin →
Settlements** tab lists every settlement platform-wide. Every Overview
stat tile is clickable, jumping to the tab that explains it. Along the
way, fixed a real PostgREST bug this surfaced: embedding `profiles` on
`groups` failed with "more than one relationship was found" once a
bridge table (`group_members`) existed — needs an explicit FK hint
(`profiles!groups_created_by_fkey(...)`), worth remembering for any
future embed between two tables that also share a join table.

**Group + expense self-service:** duplicate a whole group (same people,
fresh invite code, no expenses carried over) or duplicate a single
expense (recurring bills). Attach a receipt to a manually-entered
expense after the fact — on the Ledger row *and* inside the Edit modal,
both in gold/accent color rather than the same green as Edit/Duplicate,
deliberately so it reads as "worth noticing." Fixed a real pre-existing
bug while at it: switching an expense's split mode to Itemized silently
dropped its total to 0.00 — now seeds one starting item with the prior
amount plus an explanatory hint.

**True offline mode — the big one.** Add, edit, or delete an expense (or
record a settlement) with no signal at all: a `localStorage`-backed
write queue (`src/lib/offlineQueue.js`) with client-generated ids
(no id-remapping problem — the optimistic row and the eventual server
row share one id from creation) and enqueue-time collapsing (an
edit/delete on an unsynced create merges into or cancels it, so strict
FIFO sync never needs a dependency graph). A read-cache
(`src/lib/offlineCache.js`) renders the last successful load when
there's no signal, instead of hanging. Exchange rates resolve for real
at sync time, not entry time. Conflict policy is last-write-wins with a
surfaced warning (`expenses.updated_at` + trigger, migration 020).
Real-world testing (two accounts, actual airplane-mode conditions,
Safari) caught and fixed several things design alone didn't: a synced
expense not appearing until a manual refresh (now auto-reloads on
sync-complete), Safari resolving a genuine network failure as a query
*error* rather than a rejected request (the opposite of what the
offline-cache fallback assumed), and `AdminRoute` hanging forever
offline waiting on a profile fetch with no fallback.

**Visual pass on the Dashboard**, done by mocking up three directions
first (warm/premium, SaaS-dashboard, fintech-table) in a published
artifact, iterating live with the user, *then* implementing the winner —
worth repeating as a pattern for the next page. Landed: a gradient-washed
hero with a session-persistent randomized greeting (9 variants, real
first name, a background watermark character matching the greeting's
tone), group cards with a deterministic per-group accent color and
decorative icon badge (no new "group type" field — just a hash of the
group's own id), real member avatars (photo when set, initials
fallback — reused the existing `Avatar` component) with a custom hover
tooltip, and a staggered entrance animation. Also fixed a real bug found
in the mockup phase: `color-mix()` with a percentage over 100% silently
breaks the whole `background` declaration, not just clamps — a button
had no background and invisible light text on top of it.

**Proposed, not yet decided:** a Shared Fund group mode (pool money up
front for a trip, track spend by category, no hard budget caps — full
BRD published as an artifact, out for the user's family to review).
Priority order agreed for the roadmap's remaining open items:
**1. CSV bulk-import, 2. Log an expense by typing a sentence, 3. Push
notifications / activity feed, 4. Shared Fund mode.** None started yet.
A custom per-group icon *upload* (as opposed to the auto-assigned
decorative one) was raised and logged in `PRODUCT-ROADMAP.md` as a real
feature to scope later, not folded into the UI-only pass above.

## Current state

- **19 migrations** (`002` through `020`), all applied to the live
  database as of this session ending
- **4 Edge Functions**: `admin-users` (list/suspend/delete/promote/
  demote — also where `join_group_by_code`-adjacent admin actions live),
  `receipt-scan` (optional, needs `GEMINI_API_KEY` and/or
  `OPENROUTER_API_KEY`), `remind` (manual settle-up nudge), and
  `trip-reminders-cron` (the automatic daily sweep, `pg_cron`-scheduled)
- **48 automated unit tests** (`npm test`) — split/balance/currency math
  plus, new this session, the offline write-queue's enqueue/collapsing
  logic and merge functions (`src/lib/offlineQueue.test.js`). Everything
  else (RLS/permission logic, the offline flow end-to-end, the Dashboard
  redesign) is manual-checklist-only — `TESTING.md` has it, several
  items marked `[x]` where actually verified in production this session
  and dated, the rest still open checkboxes
- **Git**: two commits made this session (`a62156c`, `b039327`) sitting
  on `main`, **not yet pushed to `origin`** — `origin/main` is still at
  `2498e2f`. Decide whether to push before starting fresh tomorrow, or
  the local/remote gap will just keep growing
- `npm run deploy` (`deploy.sh`) runs build/lint/test before touching
  Vercel — prefer this over raw `vercel --prod`; direct `vercel --prod`
  was used a few times this session when `npm run deploy` hit an
  unrelated `--debug`-only quirk, always followed by the bundle-hash live
  check described below

## Operational lessons worth carrying forward

1. **`color-mix()` percentages must stay within 0–100%.** A value like
   `color-mix(in srgb, var(--x) 108%, white 0%)` doesn't clamp — it makes
   the *entire* declaration invalid, silently, so the property falls back
   to nothing rather than erroring visibly. Caught via a screenshot of a
   blank button, not a linter.
2. **A PostgREST embed between two tables that also share a bridge
   table is ambiguous by default.** `groups` ↔ `profiles` directly
   (`created_by`) and `groups` → `group_members` → `profiles` both exist,
   so a bare `profiles(...)` embed on `groups` fails with "more than one
   relationship was found." Fix: an explicit FK hint,
   `profiles!<constraint_name>(...)`.
3. **Safari can resolve a genuine network failure as a query *error*,
   not a rejected promise.** Don't assume `try/catch` around a
   `Promise.all` of Supabase calls is what catches "offline" — check
   `navigator.onLine` alongside any query error too, or an offline-cache
   fallback silently never fires on that browser.
4. **`schema.sql` is not kept in sync with `supabase/migrations/*.sql`
   as new ones land** (confirmed stale as of at least migration 016
   onward). For a fresh project setup, the migrations directory run in
   order is the actual source of truth right now, not `schema.sql` alone
   — worth a dedicated pass to regenerate it, or explicitly documenting
   that it's frozen at a point-in-time baseline.
5. **Mock the UI before implementing it, for anything more than a small
   tweak.** The Dashboard redesign went: three directions in one
   published artifact → live iteration with the user (colors, icons,
   copy, a real avatar photo, a real CSS bug caught in the mockup before
   it ever reached real code) → one confident implementation pass. Worth
   repeating for Group view / Admin if a further visual pass happens.

## What a fresh session should probably do first

Check in on: whether the Shared Fund BRD got a family verdict, which of
the four prioritized roadmap items to start, whether to push the two
local commits to `origin`, and whether the Dashboard's visual direction
should extend to Group view / Admin / Login — the mockup pattern above is
ready to reuse for any of them.
