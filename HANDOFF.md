# Handoff summary

Written to travel — paste this into a fresh Claude Code session, or just
keep it as the "what happened and why" record. The four docs it points to
(`README.md`, `ARCHITECTURE.md`, `PRODUCT-ROADMAP.md`, `TESTING.md`) hold
the actual detail; this is the map, not the territory. This file
describes the session that just ended — for what happened before that,
`git log` and `PRODUCT-ROADMAP.md`'s own "Shipped" entries are the
record, not this file's history.

## What this is

**Split Expenses** — a multi-currency trip/group expense-splitting web
app. React + Vite + Tailwind v4 on the frontend, Supabase (Postgres +
Auth + Storage + Edge Functions) as the entire backend, Vercel for
static hosting. Live at `https://splitexpenses-app.vercel.app`
(`https://varanasi-eta.vercel.app` redirects to it — the older custom
domain, kept alive rather than broken for anyone with it bookmarked).
Built for a real family pilgrimage trip, but built to work for any
group of people taking trips together — formalized this session by the
new Circles feature (below) and the app-wide "Group"→"Trip" rename.

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
   ├─ Storage — receipt photos, profile avatars, trip cover-photo banners
   │  (bucket still literally named `group-banners` — schema/Storage names
   │  are intentionally untouched by this session's Trip rename, see below)
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

**Tech stack** — unchanged by this session (no new frontend dependencies
added): React 19, Vite 8, React Router 7, Tailwind CSS v4,
Recharts; Supabase (Postgres 17, Auth, Storage, Edge Functions/Deno);
Vitest, `oxlint`; Vercel + GitHub (`vakacherla/splitexpenses`, public
repo); Resend, Frankfurter API, Web Push, Google Gemini/OpenRouter (now
backing two features — receipt scanning and sentence parsing, not one).

## Everything built this session, grouped

**Circles: a parent above Trip/Group.** New optional layer so the same
group of people can take multiple trips without re-inviting each time —
join a Circle once, then create/join any Trip inside it. Membership is
per-Trip, copied from the Circle *once* at Trip-creation time, then
independently editable; balances always stay scoped per Trip, never
rolled up across a Circle. Fully backward-compatible (`circle_id is
null` for every pre-existing group). New tables `circles`/
`circle_members`, four new RPCs (self-service join/create/attach/detach
plus a super-admin-only `admin_attach_group_to_circle`), `CirclePage.jsx`,
`CircleMembersPanel.jsx`, `CircleIcon.jsx`. See `PRODUCT-ROADMAP.md`'s
"Circles" entry for the full detail (schema, RLS reasoning, what's
deliberately not built yet).

**One-time Activity-feed backfill** (migration 034) — the feed
(migration 026, earlier session) only ever logged forward from when it
shipped, so every pre-existing trip showed "Nothing yet" regardless of
real history. Reconstructs expense/settlement/CSV-import/member-joined
events from data still on hand, in the live `logActivity()` format
exactly; deliberately skips edits/deletions/removals since nothing
records *who* did those historically.

**App-wide "Group" → "Trip" rename**, on explicit product direction
(a prior session had explicitly decided *against* this same rename —
see the roadmap entry for why that reversed). Pure UI/naming change,
confirmed scope up front: **zero database schema change** — `groups`,
`group_members`, every RPC, the `group-banners` Storage bucket all keep
their real names on purpose. What changed: all user-facing text;
component/page files renamed for consistency (`GroupView.jsx` →
`TripView.jsx`, `GroupSettingsModal.jsx` → `TripSettingsModal.jsx`,
`MembersPanel.jsx` → `TripMembersPanel.jsx`, `GroupBanner.jsx` →
`TripBanner.jsx`, `GroupIcon.jsx` → `TripIcon.jsx`); the URL route
`/groups/:id` → `/trips/:id`, with the old path kept as a redirect
(`OldGroupLinkRedirect` in `App.jsx`) so existing bookmarks/push links
don't break. `TESTING.md` updated to match (wording, routes, component
names) alongside the code.

**Two bugs found and fixed during post-rename regression testing**
(manual, walked through interactively with the user rather than an
automated browser — see "Operational lessons" below for why automation
wasn't possible this session):
1. Visiting a trip URL with a malformed or nonexistent id (e.g.
   `/trips/49A047`) surfaced the raw Postgres error text ("invalid
   input syntax for type uuid...") directly on screen. `TripView.jsx`
   now shows a clean "This trip doesn't exist, or you don't have access
   to it." The identical pattern exists on `CirclePage.jsx` too — not
   yet fixed, flagged as a follow-up task since it wasn't reproduced
   this pass.
2. Circles and standalone Trips rendered back-to-back on the Dashboard
   with no visual separation between the two sections — easy to misread
   which trips belonged to a Circle. Added "Circles"/"Trips" section
   headings (the "Trips" one only shows when a Circle is also present).

**New functionality identified, not yet built** (queued for next
session, on the user's own request to revisit tomorrow): an admin/
super-admin way to add a specific *user* directly into a Circle — today
a super admin can attach an entire *trip* to a circle, or add a user to
a *trip* directly, but there's no equivalent for adding one person
straight into a Circle without them using its invite code themselves.

## Current state

- **34 migrations** (`002` through `034`), all applied to the live
  database as of this session ending (031-034 are new this session:
  Circles schema, Circle RPCs, attach/detach RPCs, activity backfill)
- **Edge Functions unchanged this session** — same six as before
  (`admin-users`, `receipt-scan`, `parse-expense-text`, `remind`,
  `trip-reminders-cron`, `notify-group`), all still deployed live
- **110 automated unit tests** (`npm test`), all passing — 12 of those
  were silently never running in a sandbox with no `.env`
  (`offlineQueue.test.js`'s whole file failed to import because
  `supabaseClient.js` throws on an empty URL); fixed by adding a local
  placeholder `.env` (gitignored, not committed) rather than touching
  any test or source logic. Everything else this session (Circles,
  the rename, the two bugs above) is manual-checklist-verified —
  `TESTING.md` is the record, only partially walked so far (Auth &
  routing, Trips section; Admin — Trips spot-checked via the "Manage
  trips"/Circle questions below)
- **Git**: `origin/main` up to date through the Dashboard section-
  heading commit — every commit this session pushed individually to
  `claude/new-session-e3l0jw` first, merged to `main` (fast-forward)
  only after explicit confirmation, since `main` auto-deploys to
  production via Vercel
- **No new Storage buckets or Edge Functions this session**

## Operational lessons worth carrying forward

1. **This session's remote environment cannot reach arbitrary external
   hosts** — its network policy allows only a fixed allowlist (npm,
   GitHub, PyPI, etc.), enforced by a hard 403 at the egress proxy, not
   a soft timeout. Confirmed by testing both the production Vercel URL
   and the Supabase API host directly — both denied identically. This
   ruled out automated Playwright-driven regression testing entirely,
   even against a local dev server, since the dev server still needs to
   reach the real Supabase API to do anything. A user's real password
   was shared in chat before this was discovered — worth remembering to
   check reachability *before* asking for credentials, not after. If a
   future session needs to drive a real browser against this app, the
   environment's network policy needs to be set to allow broader
   outbound access *before* the session starts (an existing session's
   policy is fixed at creation and can't be changed mid-session).
2. **A prior session's "deliberately not doing" call is not permanent**
   — it was reversed here on new explicit product direction (Circles
   changed what "a group" conceptually means). When reversing one,
   update the roadmap entry itself (strikethrough + a pointer to the
   new entry) rather than just adding a contradicting bullet elsewhere,
   so a future reader doesn't hit two conflicting claims in the same
   doc.
3. **A raw `supabase-js` query error should never reach `setError()`
   unfiltered** — a malformed id, a nonexistent row, and a real RLS
   denial all produce different Postgres error text, none of which
   means anything to an end user. `TripView.jsx` had this bug; grep for
   `setError(.*\.error\.message)` elsewhere (found the same pattern
   still on `CirclePage.jsx`, not yet fixed) before assuming any one
   fix generalizes.
4. **A file-rename-only refactor still needs the full verification
   loop, not just a diff review** — `npm run build` catches missed
   import paths immediately (caught a real miss: `Dashboard.jsx` still
   importing `GroupBanner` after the file itself was renamed), but only
   `npm test` catches a hardcoded path string inside a *test* pointing
   at the old filename (`helpContent.test.js` referenced
   `pages/GroupView.jsx` directly, which would have failed file-not-
   found on the next run rather than at build time).

(Earlier sessions' lessons — Storage RLS needing `SECURITY DEFINER`
helpers over raw joins, supabase-js resolving rather than throwing on a
query error, offline-queued ops needing display-name context stashed at
enqueue time, docs drifting even when the roadmap itself is kept
current, native date inputs validating format but not plausibility,
`color-mix()` percentage clamping, the PostgREST embed ambiguity fix,
Safari's query-error-vs-rejection behavior, `schema.sql` drift, the
mock-first-for-visual-passes pattern, `emailRedirectTo`'s allow-list
requirement, and Supabase's two separate email throttles — are still
valid; trimmed from this file since they're about code that hasn't
changed this session. `git log` on the relevant files is the way back
to that detail if it's needed again.)

## What a fresh session should probably do first

**Finish the regression pass** — `TESTING.md` has a lot left unchecked
beyond Auth & routing and Trips (Expenses, Balances & settling up,
Reports, Admin — Users/Trash, Security boundaries, Cross-device,
Offline mode, Resilience). Do it interactively with the user (walk
through a batch, they report pass/fail) unless the environment's
network policy has been widened to allow real browser automation — see
lesson 1 above.

**Build the queued Circle feature**: admin ability to add a specific
user directly into a Circle (see "New functionality identified" above)
— the user explicitly asked to pick this up next.

**Fix the known follow-up bug**: `CirclePage.jsx`'s raw-error-leak
(same pattern as the `TripView.jsx` fix this session, not yet applied
there) — a `spawn_task` suggestion for it already exists from this
session (title: "Fix raw DB error leaking on CirclePage").

Also still outstanding from earlier sessions, untouched this one:
whether the Shared Fund BRD got a family verdict (blocked on that, not
effort); the stray `splitexpenses` Vercel project cleanup (`vercel
remove splitexpenses --yes`); whether Admin/Login should get the same
visual-polish pass Dashboard/TripView already have.
