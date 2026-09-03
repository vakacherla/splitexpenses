# Architecture review

Written the way a systems architect would actually do this: not a generic
checklist, but grounded in what genuinely happened building this app. Every
risk below is either something that already went wrong once in this
project, or a direct, evidenced extension of a pattern that did.

## The shape, in one paragraph

This is a Jamstack-over-BaaS architecture: a static React SPA (Vercel) that
talks directly to a Backend-as-a-Service (Supabase — Postgres, Auth,
Storage, Edge Functions) with no application server of our own in between.
Vercel's only job is handing over the compiled JS bundle once; every
runtime request after that goes straight from the browser to Supabase,
authorized by row-level security rather than by a backend checking
permissions. Two Edge Functions exist specifically because two operations
need a secret the browser can never hold: `admin-users` (the Supabase
service-role key) and `receipt-scan` (the Gemini/OpenRouter API keys).

**This shape is still correct** — the multi-currency, receipt-scanning,
and admin-tier growth this session all happened *inside* these same four
boxes (Postgres, Auth, Storage, Functions); none of it needed a new kind
of infrastructure. One thing has shifted since this framing was first
written, though: group-owner and co-manager permissions were built
specifically so multiple families can each self-manage their own group
without you as a bottleneck — "not a multi-tenant SaaS product" is less
true than it was. Still true: nothing here needs rebuilding for that: the
architecture already supports it, it's the operational habits (deploy
process, git) that haven't caught up yet — see the decision log below.

## What's already solid

Worth naming plainly, since a review that's all risk isn't credible:
- RLS is doing the actual security work, correctly, after two real bugs
  were found and fixed (the group-creation RETURNING-clause issue, and the
  admin-promotion trigger firing on SQL-Editor sessions). Both are the
  *kind* of bug this architecture is prone to, and both are now fixed and
  understood, not papered over.
- Privileged operations are correctly isolated into their own Edge
  Functions rather than leaking a service-role key into any client code
  path, anywhere.
- The financial math — the part where a silent bug costs someone real
  money — has actual automated test coverage. Most of this app's manual
  edge cases are UI/UX; that one category isn't.
- Zero servers to patch, scale, or lose sleep over. For this traffic
  volume, that's a genuine advantage, not a cop-out.

## The risks, in priority order

### P0 — addressed, then revisited (see the 2026-09-03 decision log entry — the recommendation changed)

**No CI, no repo-based deploy.** Every deploy up to this point was:
download a zip, manually sync it into a local folder, `grep` to confirm
the sync actually worked, then `vercel --prod` / `supabase functions
deploy` by hand. Look back through this conversation — the single largest
source of *actual* time lost wasn't a hard bug, it was stale files, wrong
directories, and forgotten redeploys.

**Decision (see chat): full GitHub + CI was considered and deliberately
not chosen yet.** The honest case against it, surfaced when this was
challenged rather than just accepted: I can't push to a GitHub repo
myself, so it wouldn't actually remove your manual step, just change its
shape — and git has never been part of this project's workflow, so it's
new surface area on top of everything else, for a benefit (deploy
history, rollback, eventual collaboration) this project doesn't need yet.

**What's actually in place instead: `npm run deploy`** (`deploy.sh`) —
runs `build`, `lint`, and `test` locally and refuses to call
`vercel --prod` if any of them fail. This is deliberately the smaller
fix: it directly targets the exact failure we hit (a build that
technically compiles but is broken — the balances-tab crash would have
been caught here), for zero new tools or accounts.

**What it does NOT fix, on purpose:** the file-sync step (still zip →
unzip → copy → confirm) and the Supabase side (migrations, Edge
Functions still deploy manually — see "Migration hygiene" below).

**Revisit full GitHub + CI when either becomes true:**
- Meaningful new functionality is being added regularly enough that
  deploy frequency itself becomes the bottleneck, or
- This moves toward being a multi-tenant / SaaS product rather than a
  personal deployment for one family's use — at that point rollback,
  deploy history, and genuine CI stop being nice-to-haves and become
  table stakes.

**RLS policies have zero automated regression coverage.** 29 tests cover
the split/balance math; the security boundary itself — who can see or
write what — is verified by hand, in `TESTING.md`, only when someone
remembers to run through it. We've already found two real RLS bugs in this
project by manual testing. The next one won't announce itself as clearly.
Once GitHub + CI exists (see the trigger conditions above), add pgTAP
tests (or even a plain SQL script asserting the policies behave as
expected) that run against a local Supabase instance (`supabase start`)
as part of that pipeline. Until then, this stays a manual-checklist risk
— worth remembering it's there, not worth building CI early just to
close it.

### P1 — real gaps, worth closing deliberately

**Two Edge Functions were shipped without ever running them.** I don't
have a way to call a real vision API or the Supabase Admin API from my
sandbox, so `admin-users` and `receipt-scan` were both written correctly
by inspection and then debugged live, in production, together. That
worked, but it's not a repeatable practice — `supabase start` gives a full
local Postgres + Edge Runtime + Storage environment that could have caught
the CORS/JWT-verification issue before it ever reached you. Worth adopting
for any future function.

**No error visibility once something's live.** If `receipt-scan` starts
failing silently at 2am — Gemini's free tier rate-limited, an OpenRouter
key expired, whatever — nothing surfaces that except a family member
eventually saying "the scan button doesn't work." A lightweight error
tracker (even Sentry's free tier) on both the frontend and the Edge
Functions would turn "eventually someone complains" into "you already
know."

**No rate limiting on the paid-adjacent function.** `receipt-scan` now has
a real (if tiny) per-call cost. Any authenticated user — or a bug in the
client retrying aggressively — can call it as many times as they want.
At this app's real usage, the financial exposure is trivial, but it's
trivial *by luck of low usage*, not by anything the system enforces.

### P2 — worth knowing, not worth interrupting anything for

- **No audit trail for admin promote/demote.** The action itself is
  tightly gated (super-admin only, can't target your own account, can't
  remove the last super admin — see `profiles.is_super_admin` and the
  `prevent_admin_self_promotion` trigger), but there's no record of *who*
  promoted or demoted *whom*, or *when*. Fine with a single super admin;
  worth a simple log table if this ever has more than one.
- **Migration hygiene.** Seven migration files applied by hand-pasting SQL
  into the dashboard works, but there's no single source of truth for
  "what's actually applied to this specific database" versus "what's in
  `schema.sql`." The Supabase CLI's own migration commands
  (`supabase migration new` / `db push`) track this properly — worth
  switching to once the CI pipeline above exists to run them.
- **Secret sprawl.** Across Vercel and Supabase there are now six
  credentials (Supabase URL/anon key, service-role key, Gemini key,
  OpenRouter key, plus your own Vercel/Supabase account access). Fine at
  this scale; worth a mental note before it grows further.
- **No backup/restore story has been discussed explicitly.** Supabase's
  free tier has limited point-in-time recovery. This now holds real
  financial data for real people — worth at minimum knowing what your
  actual recovery options are, even if the answer is "acceptable for now."
- **Honest complexity check on the dual-provider receipt scan.** It's
  well-built, but two AI providers, two API keys, and a fallback path is
  genuine surface area for a feature a family uses a few times a week.
  Not wrong to have built it this way — just worth knowing it's the most
  architecturally complex feature in the app relative to how often it's
  actually exercised.

## Decision log

**2026-09-02 — GitHub + CI vs. a local pre-deploy script.** Full GitHub +
CI was the initial recommendation. Challenged before committing to it,
the case weakened on inspection: it wouldn't actually remove the manual
sync step (I can't push to a repo on anyone's behalf), and it introduces
git as a new tool into a workflow that's never used it, for benefits
(rollback, deploy history, collaboration) this project doesn't currently
need. **Decision: `npm run deploy` (local build+lint+test gate) now;
full GitHub + CI deferred until either meaningful new functionality
makes deploy frequency itself the bottleneck, or this moves toward a
multi-tenant/SaaS product** — see the P0 section above for the reasoning
in full. Revisit this decision, don't just re-read it, if either
condition is met — the tradeoffs may look different by then.

**2026-09-03 — Revisiting the above.** Both trigger conditions are now
arguably met: this session alone shipped 13 migrations and rebuilt the
group-permission model twice, and two deploy-verification incidents
(stale schema cache, a deploy that reported success but wasn't actually
live) cost more real time than any single bug did. Separately, `npm run
deploy` never solved the file-*sync* step — every round this session
still went zip → download → unzip → copy → grep-check before the script
even ran. Recommendation carried into `HANDOFF.md`: move to Git now, and
seriously consider Claude Code specifically, since it edits the actual
project files directly rather than a sandboxed copy that has to be
synced back — which is what actually caused both incidents above, not
anything wrong with the app's code itself.
