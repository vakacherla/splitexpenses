# Handoff summary

Written to travel — paste this into a fresh Claude Code session, a new
claude.ai Project, or just keep it as the "what happened and why" record.
The four docs it points to (`README.md`, `ARCHITECTURE.md`,
`PRODUCT-ROADMAP.md`, `TESTING.md`) hold the actual detail; this is the
map, not the territory.

## What this is

**Split Expenses** — a multi-currency group expense-splitting web app.
React + Vite + Tailwind v4 on the frontend, Supabase (Postgres + Auth +
Storage + Edge Functions) as the entire backend, Vercel for static
hosting. Live at `https://varanasi-eta.vercel.app`. Built for a real
family pilgrimage trip, but built to work for any group.

## Everything built in this session, grouped

**Money & splitting (the original core):** multi-currency expenses with
locked-in historical exchange rates, equal/percentage/exact splits, debt
simplification, multi-currency settlements with undo, category reports.

**Making it self-service for a family, not just one admin:**
- Settle-up payment deep links (UPI/Venmo/PayPal) — set on `/profile`
- Search, saved default split, CSV export, notes on an expense
- Receipt photo scanning — Gemini (free) primary, Qwen2.5-VL (OpenRouter)
  automatic fallback, isolated in its own optional Edge Function
- A public `/help` page + in-app feature request form (Admin → Feedback)
- A full profile page — avatar, display name, payment info, two phone
  numbers (home + travel), and a nickname per group
- **Group owners can run their own group**: rename, remove a member
  (blocked while they have an outstanding balance), appoint a co-manager
  with the same powers, archive the group — none of it needs the
  platform admin

**Recoverability, once real people started actually using this:**
- Deleting a group *or* a single expense is a soft delete — hidden and
  excluded from every balance immediately, but the platform admin can
  restore it for 30 days (Admin → Groups → Archived, Admin → Trash)
  before a manual batch purge. This caught and fixed a real pre-existing
  gap: any group member could previously hard-delete any expense with no
  recovery path at all.

**Platform administration, properly tiered:**
- `is_admin` / `is_super_admin` — only a super admin can change anyone's
  admin status, nobody can act on their own account through that path
  (which is also what makes "zero super admins" structurally impossible),
  and the database enforces the hierarchy independently of the app code
- Admin → Overview (platform stats), Reports (spend by category/group,
  currency-grouped rather than converted — an INR total and a USD total
  never get added into one estimated number)
- "Ban" renamed to "Suspend" throughout — more accurate tone for a
  family app than public-platform moderation language

**Bonus:** `/rates` — a standalone currency reference page, defaults to
whichever currency the user's own groups use most.

## Current state

- **13 migrations** (`002` through `014`), all believed applied to the
  live database as of this session ending
- **3 Edge Functions**: `admin-users` (list/suspend/delete/promote/
  demote), `receipt-scan` (optional, needs `GEMINI_API_KEY` and/or
  `OPENROUTER_API_KEY` set), `admin-users` also does invite-code joins
  — see `README.md` for exact deploy commands for each
- **29 automated unit tests** (`npm test`) covering split/balance math
  only — none of this session's new RLS/permission logic (archive,
  trash, super admin, co-managers) has automated coverage; `TESTING.md`
  has the manual checklist for all of it
- `npm run deploy` (`deploy.sh`) runs build/lint/test before touching
  Vercel — use this instead of raw `vercel --prod`

## The operational lesson worth carrying forward

Two failure modes ate more real time this session than any actual bug:

1. **PostgREST schema cache staleness.** After a migration adds a new
   *column* (not just a policy), queries referencing it can fail with
   "column does not exist" even though the migration ran cleanly — the
   API layer cached the old schema. Fix: `NOTIFY pgrst, 'reload schema';`
   right after any migration that adds a column.
2. **A deploy that reports success but isn't actually live.** Caught by
   comparing the JS bundle hash a fresh `fetch(location.href, {cache:
   'no-store'})` returns against what's actually loaded — if they match,
   it's live; if not, redeploy. Root cause was never fully pinned down
   (possibly a stale local sync at the moment of deploy), but the
   symptom is now a known, fast, two-minute check rather than a
   confusing multi-round investigation.

Both of these are exactly the class of problem that goes away structurally
once edits happen directly on the real project files instead of through a
zip-download-sync cycle — see the Claude Code discussion below.

## Should this move to Claude Code / a dedicated project?

Short answer: **yes, and Git first.** Longer version, in the chat response
this file was delivered alongside.
