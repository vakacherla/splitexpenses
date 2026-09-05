# Product roadmap: closing the gap with Splitwise & Venmo

Researched via current (2026) coverage of both apps' actual feature sets
and pricing, not assumptions. Written as a product owner would: honest
about what's genuinely worth building here, and explicit about what to
deliberately skip and why.

## The one strategic call that shapes everything else

**Splitwise is a ledger. Venmo is a wallet.** Splitwise tracks who owes
whom and stops there — settling up means tapping out to Venmo, PayPal, or
cash. Venmo actually moves money, and that's *why* it exists as a company:
holding balances, transferring funds, and settling instantly is a
regulated money-transmission business — licensing per US state, KYC/AML
checks, PCI compliance for cards. That's a different company, not a
feature.

**This app should stay a ledger and get better at being one.** The
Venmo-shaped gap to close isn't "move money" — it's "make settling up one
tap away," by deep-linking to whatever payment app the group already
uses (UPI apps for INR groups, Venmo/PayPal/Zelle for USD ones) with the
amount pre-filled. Same pattern Splitwise itself uses. That's a
few-hours feature, not a compliance program.

## Where this app already beats what people pay for

Worth knowing, since it's easy to only see gaps: Splitwise's free tier
now caps you at roughly 3 new expenses a day and shows ads. Multi-currency
conversion, spending charts, and receipt scanning are all locked behind
Splitwise Pro ($59.99/year). This app already has percentage/exact
splits, live multi-currency conversion, and a category reporting
dashboard with charts — free, no cap, no ads, because there's no business
model forcing a paywall. Data portability is also a genuine
differentiator: it's your own Postgres database, exportable with a SQL
query any time, not locked in a vendor's export button.

## Feature comparison

| Capability | This app | Splitwise (free) | Splitwise Pro | Venmo |
|---|---|---|---|---|
| Equal / percentage / exact splits | Strong | Strong | Strong | Weak (basic request-split only) |
| Multi-currency, live rates | Strong | Weak (Pro-only conversion) | Strong | Absent |
| Debt simplification | Strong | Strong | Strong | Absent |
| Category reports/charts | Strong | Absent | Strong | Absent |
| Recurring expenses | **Absent** | Strong | Strong | Adequate (recurring *payments*, not shared splits) |
| Receipt scanning (OCR) | Strong (itemized, too) | Absent | Strong | Absent |
| Itemized bill splitting | Strong | Weak | Strong | Absent |
| Search/filter expenses | **Absent** | Weak | Strong | Adequate |
| Default/saved split settings | **Absent** | Absent | Strong | Absent |
| Data export | **Absent** (manual SQL) | Weak | Strong | Absent |
| Settle-up payment deep link | **Absent** | Adequate | Adequate | N/A (it *is* the payment) |
| Actually moves money | Not applicable | Absent | Absent | Strong |
| Offline mode | **Absent** | Strong | Strong | Absent |
| Push notifications / activity feed | Strong | Adequate | Adequate | Strong |
| Comments/notes on an expense | **Absent** | Weak | Weak | Strong (its whole social layer) |
| Multi-group platform admin | Strong | Absent | Absent | Absent |
| No daily limits, no ads | Strong | **Absent** | Strong | Strong |

## Now / Next / Later

### Now — quick wins (high value, low effort, no new infrastructure)

- ✅ **Shipped.** Settle-up payment deep link (UPI/Venmo/PayPal, pre-filled
  amount, gated on the recipient adding their handle), search/filter on
  the Ledger, a saveable default split per group, CSV export, and notes
  on an expense. See the README for how each works.
- ✅ **Shipped** — a lightweight recurring-expense helper. Not full
  automation — a "Duplicate" action on any existing expense (Ledger, next
  to Edit) that opens the add-expense form pre-filled with the same
  description, category, amount, currency, payer, and full split
  (including itemized items and tax/tip), so re-logging last month's rent
  or a recurring utility bill is a 10-second edit-and-save instead of a
  fresh form. Deliberately defaults the date to *today*, not the
  original's, and always fetches a fresh exchange rate on save — a
  duplicate is a new occurrence, not a correction, so it gets today's
  rate exactly like a brand-new expense would. Available to any group
  member, not gated to whoever entered/paid for the original — unlike
  Edit/Delete, duplicating doesn't touch the source expense at all, so
  there's no ownership boundary to protect. No schema changes needed —
  purely `AddExpenseForm`/`ExpenseRow`.
- ✅ **Shipped** — duplicate a group, without its expenses. User feedback:
  same people often do a next trip together, and re-inviting everyone
  from scratch is unnecessary friction. A new `duplicate_group(source_id,
  new_name)` RPC (migration 018) copies every member's row — including
  manager roles — plus the home currency into a new group with its own
  fresh invite code; expenses, settlements, and trip dates deliberately
  stay behind, since it's a new trip, not a continuation. The person who
  duplicates becomes the new group's owner regardless of their role on
  the source (even a manager, not just the creator, can do this — same
  permission bar as renaming or archiving), and their own copied row is
  forced to non-manager so ownership is the only thing granting them
  power in the new group; everyone else's role carries over exactly.
  Reachable from Group settings → "Duplicate this group," with an
  editable name field defaulting to "<name> (copy)". Considered and
  deliberately not doing: a literal "Group → Trip" rename. The
  create-group placeholder itself ("Goa trip, Flat 4B, Family fund…")
  and this app's own stated positioning ("built to work for any group,"
  not just trips) are in real tension with narrowing the word
  everywhere — a flat-share's expenses or an ongoing family fund isn't a
  trip, and the rename would touch schema comments, RLS policy names,
  every doc, and the UI for a label change alone. Trip-specific
  *language* already shows up contextually where it fits (e.g. "Trip
  dates," not "Group dates") without renaming the underlying concept.
- ✅ **Shipped** — admin can add a user to a group directly. Real gap
  found in practice: creating an account and joining a group are two
  separate steps (self-service `join_group_by_code` only) — someone who
  signs up and never gets/uses an invite code sits with zero groups
  indefinitely, and no admin action could place them into one. Fix: a
  super-admin-only `admin_add_user_to_group(target_user_id,
  target_group_id)` RPC (migration 018) plus a small addition to Admin →
  Users — a "Manage groups" control on each user's row, visible only to
  a super admin, that picks any active group and adds them, bypassing
  the invite code entirely. Called directly as a Postgres RPC rather than
  routed through the `admin-users` Edge Function — the function's own
  `is_super_admin()` check inside the `SECURITY DEFINER` body is exactly
  as trustworthy as the Edge Function's service-role check, without
  needing a redeploy.
  - ✅ **Shipped, same day** — the removal counterpart. Real feedback
    from actually using the feature: a super admin can just as easily
    pick the wrong group by mistake, and the group owner/manager removal
    path doesn't help when the super admin isn't that group's
    owner/manager. `admin_remove_user_from_group(target_user_id,
    target_group_id)` (migration 019) plus "Manage groups" now also
    lists everyone the picked user is currently in, each with its own
    Remove — same panel, not a separate screen. Deliberately skips the
    balance check the self-service owner/manager removal enforces
    (`computeNetBalances` is a client-side computation, not something
    this function can check) — this is an explicit admin correction
    tool, not a control surfaced to everyone, so the trust bar is
    different.
  - ✅ **Shipped, same day** — Admin → Groups now shows "Created &lt;date&gt;
    by &lt;name&gt;" under every group (active and archived), for platform-wide
    traceability. Prompted directly by using the two RPCs above in
    practice — no schema change needed, `groups.created_by`/`created_at`
    have existed since the original schema; this just surfaces them in
    the one place (Admin) where "who made this and when" actually
    matters across every group, not just your own.
  - ✅ **Shipped, same day** — that surfacing exposed a real PostgREST
    ambiguity bug: `groups` and `profiles` are connected two ways once a
    bridge table exists (`groups.created_by` directly, and
    `groups → group_members → profiles`), so the naive embed failed with
    "more than one relationship was found." Fixed with an explicit FK
    hint (`profiles!groups_created_by_fkey(...)`) — worth remembering for
    any future embed between two tables that also share a join table.
  - ✅ **Shipped, same day** — every Overview stat tile is now clickable,
    jumping straight to the tab that explains the number (Groups/Users/
    Active users/Expenses logged → their existing tabs). Settlements
    recorded needed a genuinely new destination — a **Settlements** tab
    listing every settlement platform-wide (from → to, group, date,
    amount, home-currency equivalent) — since no global settlements view
    existed anywhere before. Read-only, no admin actions on it (nothing
    here needs an undo/restore the way Trash does).

### Next — real features, real effort, still clearly worth it

**Priority order set 2026-09-04**, for the four items open in this
section at the time: **1. CSV bulk-import, 2. Log an expense by typing a
sentence, 3. Push notifications / activity feed, 4. Shared Fund mode**
(tracked separately — see its own BRD, out for family review). #1, #2,
and #3 are now shipped (below); #4 remains, blocked on family review.

- ✅ **Shipped** — edit an existing expense. User feedback: real friction
  in practice, not hypothetical — the only way to fix a mistake used to
  be deleting the whole expense and re-adding it from scratch, for any
  split type. `AddExpenseForm` now does double duty (an `editingExpense`
  prop switches it into edit mode) rather than a separate form, so every
  split type it already knows how to build, it already knows how to
  rebuild from an existing expense's data — verified directly for both
  itemized and percentage splits (every field, including per-item
  assignments and tax/tip, round-trips exactly). Editing replaces the
  whole `expense_splits` set rather than diffing row by row, same as a
  fresh add computes shares from scratch. One deliberate refinement on
  the "changes shouldn't shift history" principle: `exchange_rate` and
  `amount_in_home` are only recomputed (against today's live rate) if
  the amount or currency actually changed — fixing a typo in the
  description, or just reassigning the split, leaves the original
  locked-in conversion untouched. Receipt attachment isn't editable
  (re-scanning would overwrite fields you're specifically trying to
  fix) — edit an expense's own fields by hand instead. Reachable from an
  "Edit" link next to "Delete this expense" on the Ledger, gated
  identically to delete.
  - ✅ **Fixed** — the permission gap this feedback actually surfaced,
    ahead of the edit feature itself. `ExpenseRow.jsx` only ever *showed*
    the delete button to whoever entered or paid for an expense, but the
    server-side RLS policy backing it (`expenses: members can edit`,
    the UPDATE policy the deleted_at soft-delete trick uses) was still
    `is_group_member(group_id)` — any member, full stop — left over from
    before migration 014 narrowed delete's own policy. Since Postgres
    OR's multiple policies for the same command, that meant any group
    member could already update or soft-delete *any* expense in the
    group, UI restriction notwithstanding. Migration 017 tightened it to
    `created_by = auth.uid() or paid_by = auth.uid()`, matching the UI —
    the exact rule the edit feature above now also builds against.
- ✅ **Shipped** — the visual polish pass: hand-drawn category icons
  (`CategoryIcon`) instead of plain colored dots on expense rows; loading
  skeletons (`Skeleton`/`SkeletonRows`/`SkeletonStatGrid`/`SkeletonChart`)
  shaped like the content they stand in for, instead of "Loading…" text,
  across the Dashboard, Ledger, Rates page, and every Admin tab; a more
  visual Balances tab (avatars plus a colored bar per person, sized to
  their share of the group's largest balance); and warmer empty states
  (a small icon in a tinted circle — `EmptyState`) for "no groups yet,"
  "no expenses yet," and "nothing to report yet." None of it changes
  behavior — all of it changes how the app feels to hand to family who
  aren't going to read a README first.

- ✅ **Shipped** — PWA groundwork: a manifest, app icon (favicon +
  180/192/512px), and a minimal service worker (app-shell caching only,
  installable to the home screen on iOS/Android). Deliberately stops
  short of true offline data entry — see the next item, which is the
  bigger, separate piece this sets up but doesn't attempt.
- ✅ **Shipped — push notifications + activity feed.** "Someone added an
  expense" or "you were asked to settle up" is what makes an ongoing
  group actually stay current instead of going stale between trips.
  Built the fuller of two possible scopes: push notifications *and* a
  persistent, browsable "Activity" tab (new, alongside Ledger/Balances/
  Reports/Members) — not just a phone buzz that's easy to miss, but
  something to actually scroll back through. Nearly all the push
  plumbing already existed from the settle-up reminder work
  (`push_subscriptions`, VAPID keys, `src/lib/push.js`, the service
  worker's already-generic `push` handler) — what's new is an
  append-only `activity_events` table (migration 026), since the
  existing schema can't reconstruct a removed member or an edit's
  history, only a live snapshot.

  **Logged**: expense added/edited/deleted, settlement recorded/undone,
  member joined/removed, one consolidated row per CSV import — verified
  live that a multi-row import produces exactly one feed entry, never
  one per imported row, which would otherwise drown out everything
  else. **Push-notified** (the two examples the roadmap actually names,
  plus CSV import since it's a single consolidated action): expense
  added, settlement recorded (targeted at just the other party in the
  settlement, not the whole group), CSV import. Edits, deletes, and
  member changes are feed-only — lower-signal events that would make
  push noisy without adding much. Deliberately not logged this pass:
  group rename, trip dates, duplication, banner uploads — not part of
  the roadmap's motivating examples. Deliberately not built: a
  cross-group notification center (navbar bell/badge aggregating unread
  counts across every group) — this is a per-group feed, same scope
  boundary as Ledger/Balances/Members today; a global center would be a
  materially different, bigger feature.

  New `notify-group` Edge Function (structural sibling of `remind`) —
  never trusts the client's target list blindly, since that's exactly
  the kind of endpoint that could otherwise spam arbitrary users: looks
  up the group's real membership with the service-role client, confirms
  the caller is actually in it, and intersects the requested targets
  against it (verified live — a fake/non-member id passed as a target
  came back `targeted: 0`, correctly dropped). `_shared/notify.ts`'s
  `sendReminderPush` renamed to `sendPush`, since `notify-group` proved
  it was already fully generic — nothing about the implementation was
  settle-up-specific, just the name. The service worker's
  `notificationclick` now deep-links to the group that triggered it
  (`event.notification.data.url`) instead of always opening `/dashboard`,
  the one piece that needed to change to make tapping a notification
  actually useful.

  Membership events are logged from inside the existing `SECURITY
  DEFINER` RPCs that make them (`join_group_by_code`,
  `admin_add_user_to_group`, `admin_remove_user_from_group`) rather than
  from client code, so it works identically regardless of who triggers
  it — verified live for both the self-service join path and the
  admin-add path (re-added a removed test member via
  `admin_add_user_to_group` and confirmed "Shaurin joined the group"
  logged correctly). Every trigger point that can happen offline
  (expense/settlement create/edit/delete) logs its event at **sync
  time** inside `offlineQueue.js`'s apply functions, not at enqueue
  time — same reasoning the exchange-rate lookup already uses, since
  both genuinely need a live connection. The actor's display name and
  the group's name are stashed directly in the offline payload at
  enqueue time (mirroring how `homeCurrency` is already stashed there)
  since the sync-time code has no access to `members`/`group` state to
  look them up otherwise.
- ✅ **Shipped** — trip dates + a settle-up nudge, phase 1 (user feedback,
  with Splitwise screenshots for reference). Optional start/end dates on
  a group (Members → Group settings); once the end date passes, anyone
  who still owes money gets a reminder, repeating every 3 days until
  settled; a manual "Remind" button also sits on the Balances tab's
  suggested settle-up list, for nudging on demand rather than waiting.
  Delivery is email (via Resend) and/or Web Push, whichever you
  configure — see the README's "Set up settle-up reminders." The
  automatic sweep is a `pg_cron`-scheduled Edge Function
  (`trip-reminders-cron`, confirmed scheduled and active); the manual
  nudge is its own (`remind`), both sharing one `_shared/notify.ts` for
  the actual sending. Both channels confirmed working end to end in
  production 2026-09-04: a real reminder email was received (Resend,
  correct subject/body/amount), and a real push notification was
  delivered and rendered on an iOS device with the correct content.
  **Known issue, not yet root-caused:** on that iOS device the push
  notification then disappeared — not even in Notification Center
  afterward — despite every relevant setting (Immediate Delivery, all
  three alert types, Persistent banner style) already correct. Ruled
  out: duplicate/stale push subscriptions (only one, legitimate,
  existed), and app-side notification-settings misconfiguration. Likely
  a genuine iOS/WebKit quirk in PWA web push persistence specifically,
  not a bug in this app's code, but unconfirmed — temporary diagnostic
  logging was added to `public/sw.js`'s `push`/`notificationclose`
  handlers and then left in place (harmless, and useful if this comes up
  again) rather than removed before root cause was found. Remote
  debugging (Mac Safari's Develop menu → device → the live PWA's Web
  Inspector) is set up and working if this gets picked up again — needs
  the iPhone connected via USB with Web Inspector enabled
  (Settings → Apps → Safari → Advanced) and "Trust This Computer"
  accepted. Phase 2, later, and specifically tied to if/when this app is
  ever monetized: WhatsApp (Business Platform — per-message cost once
  outside a 24h reply window, plus Meta business verification and
  message-template approval), Telegram (free, no approval process, just
  a one-time "start the bot" click per person — cheaper to add than
  WhatsApp if it's ever wanted), and/or SMS (real per-message cost,
  phone verification). None of these are worth the setup cost for a
  free family app; revisit only alongside an actual monetization
  decision.
- ✅ **Shipped** — receipt photo capture + AI extraction, via the optional
  `receipt-scan` Edge Function (Supabase Storage for the photo, Gemini
  3.6 Flash as the free primary provider with Qwen2.5-VL-72B as an
  automatic paid fallback for receipts Gemini can't read). Now including
  line-item itemization: the extraction also pulls individual receipt
  items where legible, the add-expense form gets a fourth "Itemized"
  split mode alongside equal/percentage/exact, and tax and tip (as
  separate figures) each split proportionally by what each person
  actually ordered — the restaurant-split case the original idea was
  missing.
- ✅ **Shipped** — attach a receipt to a manually-entered expense. Real gap:
  skip "Scan a receipt" and fill an expense in by hand, and there was no way
  to attach the photo afterward — not a technical limit, just missing UI.
  The existing "no receipt option while editing" rule was specifically about
  *re-scanning* (AI auto-fill silently overwriting fields you'd manually
  fixed) — a plain attach (upload only, no OCR, no field changes) doesn't
  have that problem. Lives right on the Ledger row (`ExpenseRow.jsx`, next to
  "View receipt"), not behind the edit flow — reuses the exact Storage
  upload path `AddExpenseForm.jsx` already had, gated to the same
  created-by-or-paid-by rule as Edit/Delete. No schema change.
- ✅ **Shipped — log an expense by typing a sentence.** Originally an
  idea from 2026 competitive research: HippoSplit (the newest entrant in
  this space) is chat-first — type "lunch 24.50 split with Anna and Ben"
  and it parses that straight into a logged, categorized, split expense,
  no form at all. Built as a genuinely smaller version of a problem
  already solved here: a new `parse-expense-text` Edge Function is a
  structural copy of `receipt-scan` (same Gemini-first/Qwen-fallback
  provider order, same CORS/auth boilerplate, same `verify_jwt = false`
  reasoning, no new secrets needed), just swapping the image input for
  text. A text input sits right above "Scan a receipt" on the add-expense
  form, pre-fills the exact same form state the receipt path already
  fills (`AddExpenseForm`'s existing setters), and the normal Save button
  is the actual commit step — nothing is written by the parse call
  itself, same review-before-save handoff every other AI-filled path in
  this app already uses. Scope is deliberately equal-splits-only (no
  itemization, no parsing stated per-person amounts from prose) — the
  quick single-payer/small-group case this is actually aimed at, not a
  general natural-language interface.

  The one real design problem a receipt never had: resolving names to
  actual people. Rather than hand-roll fuzzy matching, the group's
  member list (id + display name, with a flag marking the caller) is
  sent to the model, and the response schema constrains `payer_id` /
  `participant_ids` to an **enum of the real member ids** — Gemini's
  native structured-output enforcement means the model can match
  "Anna," a nickname, or "I"/"me" to the right person, but can never
  hallucinate an id that doesn't exist in the group. Whatever it can't
  confidently resolve is simply omitted, and the client defaults exactly
  like a fresh manual add already does (payer → the caller, participants
  → everyone) — verified live: naming someone not actually in the group
  correctly fell through to "everyone," not a wrong guess.

  Also correctly resolves relative dates ("yesterday," verified live
  against a real Gemini call resolving to the actual prior day) and
  currency symbols ("$53.77" → USD, live-converted at the same rate the
  rest of the app uses), and needs a live connection for the same reason
  receipt scanning does — gated by the same `!editingExpense && !isOffline`
  condition, verified live to disappear (with a shared, now dual-purpose
  offline notice) when simulating offline and reappear the instant
  connectivity returns.
- ✅ **Shipped — true offline mode.** Priority raised per 2026 competitive
  research (Tricount, Settle Up, and Splid all treat offline capture as
  baseline, not a nice-to-have — directly relevant to the pilgrimage-trip
  use case this app was built for). A page-JS write queue
  (`src/lib/offlineQueue.js`), not the Background Sync API or
  service-worker fetch interception — Background Sync has no iOS Safari
  support, which is this app's real usage. Client-generated ids
  (`crypto.randomUUID()`, already the pattern for itemized-split item ids)
  mean the optimistic local row and the eventual server row share one id
  from creation — no id-remapping problem. Enqueue-time collapsing (an
  edit/delete on an unsynced create merges into or cancels it) keeps
  strict FIFO sync safe without a dependency graph. Exchange rates are
  deliberately *not* resolved at entry time when offline — the sync
  engine calls the real rate once it actually runs, online, same
  "locked-in historical rate" principle just applied at sync time instead
  of entry time. Conflict policy is last-write-wins with a surfaced
  warning, not a merge — a new `expenses.updated_at` column + trigger
  (migration 020) is the only schema change needed to detect "this
  changed on the server while I was offline." A read-cache
  (`src/lib/offlineCache.js`) mirrors the last successful load of the
  Dashboard and each group in `localStorage`, so a reload with no signal
  renders from cache instead of hanging — this also surfaced and fixed a
  real pre-existing bug: neither `Dashboard.jsx`'s `loadGroups()` nor
  `GroupView.jsx`'s `load()` had a `try/catch`, so an offline fetch
  rejected unhandled and the skeleton spun forever, offline mode or not.
  Same pass fixed a second, unrelated offline hang: `AdminRoute` waited on
  `profile` indefinitely with no fallback when that fetch failed.
  Deliberately excluded from v1 (stated, not silent): creating or joining
  a group, all admin-panel and `admin-users`/`remind` Edge Function
  actions, push subscribe/unsubscribe, and receipt scanning/attaching
  (which needs a live Gemini call to mean anything, and — per the
  now-shipped "attach a receipt to a manually-entered expense" feature
  right above — can be added once reconnected instead). No IndexedDB:
  every queued payload is small JSON, matching `fx.js`'s existing
  `localStorage` rate-cache scale.
  - ✅ **Shipped, same day — fixes and polish from actually testing it.**
    Real offline testing (two accounts, real airplane-mode conditions,
    Safari) surfaced several gaps the design alone didn't catch:
    - A synced expense didn't appear until a manual page refresh — the
      queue entry disappearing on success doesn't put the real row into
      `GroupView`'s own state on its own. Fixed by watching the
      syncing→idle transition and reloading automatically the moment a
      sync run finishes.
    - On Safari specifically, a genuine network failure resolves as a
      query *error* ("TypeError: Load failed") rather than a rejected
      request — the opposite of what the offline-cache fallback assumed,
      so a real offline reload was showing that raw error instead of
      falling back to cache. Fixed by checking `navigator.onLine`
      alongside any query error before deciding which path to take.
    - The sync status banner's text was easy to miss (uniform small
      size, no color distinction) and had no visual sense of motion.
      Now: larger text, a small hand-drawn icon per state (wifi-off,
      spinning refresh, clock, warning triangle — matching the app's
      existing icon style rather than a library), offline in red,
      syncing in green.
    - "Receipts need a connection" was a plain dashed-border note easy to
      skim past — now a red warning box with an icon, matching how the
      app already surfaces real errors elsewhere.
    - Switching split mode to Itemized on an expense that already had a
      total silently dropped it to 0.00 (itemized computes its total
      from line items, not the plain amount field) — this predates
      offline mode but was caught while testing it. Now seeds one
      starting item with the prior total plus a hint explaining it's the
      whole original amount, not a real per-item breakdown yet.
    - "Attach a receipt" was only reachable from the collapsed Ledger
      row, not from "Edit" itself — confusing, since Edit is where
      someone would expect to fix everything about an expense. Now also
      available inside the Edit modal (same plain-upload logic, still no
      re-scanning), and both surfaces use the same gold/accent color
      rather than the same green as Edit/Duplicate, so it reads as
      "worth noticing."
- ✅ **Shipped — custom group cover photo.** Came up while reviewing the
  visual-polish pass (2026-09-04): a decorative per-group icon badge got
  added to the Dashboard mockup, auto-assigned for visual variety — the
  natural next ask was letting the group's owner/manager upload their
  own image instead. Reconsidered mid-build from "a small icon" to a
  **wide cover-photo banner**: the actual use case is a real trip photo
  (a Varanasi/Rameswaram group shot), which a tiny square crop would do
  little justice to. A `groups.banner_path` column plus a new
  `group-banners` Storage bucket (same public-read shape as the existing
  `avatars` bucket), with write access scoped to the group's owner or
  any manager. Both the Dashboard card and the group page itself got a
  full-bleed banner strip at the top — a real photo when uploaded,
  otherwise the same accent-gradient + first-letter watermark treatment
  the card always used, just promoted from a small corner flourish into
  the actual banner area (so every existing group keeps its current
  identity, nothing looks broken or half-finished for groups that never
  set one). Upload lives in Group settings, right above the group name,
  with a live preview using the same component the card renders — what
  you see while choosing is exactly what ships.

  **Real bug caught live, not in review:** the first version of the
  Storage RLS policy did a raw join against `group_members`/`groups`
  from inside the policy check — but those tables are themselves
  RLS-protected, and a plain (non-`SECURITY DEFINER`) query against them
  from within another table's RLS evaluation is still subject to their
  own policies, which don't resolve the same way in that nested context.
  Uploading failed with "new row violates row-level security policy"
  even as the group's actual owner. The existing `receipts` bucket
  policy already avoided exactly this by calling `is_group_member()`, a
  `SECURITY DEFINER` function that bypasses RLS entirely — fixed by
  adding the equivalent `can_manage_group()` function and using it
  instead of the inline join (migration 025, following 024). Worth
  remembering alongside the existing PostgREST-embed lesson: any RLS
  policy that needs to check *other* tables should go through a
  `SECURITY DEFINER` helper, not a direct join, or it can fail in ways
  that only show up when actually exercised, not from reading the SQL.

  Verified end-to-end against the live database: upload succeeds as the
  group's owner, replaces (not duplicates) the file on re-upload, shows
  correctly on both the Dashboard card and the group page immediately
  after upload (no manual refresh needed), and every group without a
  custom banner still renders the gradient+letter fallback cleanly.
- ✅ **Shipped — CSV bulk-import.** The real intent: someone's already
  tracking a group's expenses in a spreadsheet and wants to bring the
  backlog in at once instead of re-entering every row by hand — not a
  general-purpose data pipe. Scoped exactly as tightly as planned, since
  a bad bulk import (wrong person, wrong currency, a silently skipped
  row) is much harder to trust than one bad manual entry: CSV only, a
  strict template mirroring the existing CSV export's column order and
  punctuation (with email swapped in for display name in the two
  people-columns, since names aren't unique and exact email matching was
  the actual requirement), a "Download template" link inline in the
  import modal so nobody has to reverse-engineer the format from
  scratch, and a mandatory preview table of every row before anything
  touches the database. **All-or-nothing, not a partial import**: if any
  row fails validation (unknown email, unknown category, unsupported
  currency, non-positive amount, a malformed date, or split amounts that
  don't sum to the row's total), the whole file is rejected with every
  problem listed by row number — no row is ever silently skipped, which
  is exactly the trust gap that made a looser version not worth
  building. Every successful import is tagged with a new
  `import_batches` row (migration 021) — its own `id` is stamped onto
  every `expenses.import_batch_id` it creates — so it can be undone in
  one click two ways: an inline "Undo this import" right after a
  successful run, or a persistent **"CSV imports"** list in Group
  settings (filename, date, row count, who ran it) for undoing a bad
  import discovered later, not just immediately after. Undo needed no
  new RPC: it's a plain `update ... where import_batch_id = $1`
  soft-delete, already permitted by the existing "creator or payer can
  edit" RLS policy on `expenses` (migration 017) since the importer is
  always `created_by` on every row in their own batch — v1 undo is
  therefore self-service only (whoever ran the import), not a
  manager-can-undo-anyone's-import tool, which would need a new
  `SECURITY DEFINER` function and wasn't asked for. Exchange rates
  resolve at import time (today's live rate), the same deliberate
  "locked-in at entry, not backdated to the row's own date" convention
  already established by Duplicate expense and the offline sync engine —
  no new historical-rate API integration needed. Itemized splits aren't
  supported in v1 since the export itself doesn't emit itemized detail
  either, so every imported row is written as an "exact" split.
  Reachable from "Import CSV" next to "Export CSV" on the Ledger —
  unlike Export, always visible (not gated on the group already having
  expenses), since an empty new group is the main backfill case this
  exists for.

  **Needs a connection to actually import — deliberately, not an
  oversight.** Unlike a single expense add, a bulk import can't be
  handed to the offline write queue: that queue replays operations
  independently, one at a time, with no concept of "this batch of N
  either all lands or none does" (deliberately, so it never needs a
  dependency graph). The whole point of the mandatory preview is
  exactly that all-or-nothing guarantee, so rather than weaken it for
  the offline case, import requires a live connection outright — same
  as receipt scanning already does elsewhere in this app — while
  parsing and previewing a file works fully offline (useful on its own:
  prep the CSV on a flight, import once landed). The modal reacts live
  to connectivity changes (same `useOnlineStatus` hook as the rest of
  the app) with a clear warning box, not a silent failure. And if the
  connection genuinely drops mid-import — a real risk over many
  sequential row-by-row round trips even when it started online — the
  rows that run already created are automatically rolled back before
  the error is shown, so a dropped connection can never leave a silent
  partial import sitting in the ledger.

  That rollback surfaced a real bug worth recording: the first version
  tried to hard-*delete* the `import_batches` row on rollback, but
  `expenses.import_batch_id` still points at it even after those
  expenses are soft-deleted (the rows still exist, just hidden), so the
  delete violated that foreign key — and because supabase-js resolves a
  query error rather than throwing one, the failure was silent. Caught
  live: a rolled-back import's batch row was left behind, showing up in
  Group settings as a normal, still-undoable import instead of
  disappearing. Fixed by marking the batch `undone_at` (the same
  mechanism a real undo already uses, with `row_count` corrected to how
  many rows actually landed before the failure) instead of deleting it
  — which needs no delete policy at all, so the one migration 022 added
  was reverted in migration 023. The broader lesson, consistent with
  `HANDOFF.md`'s Safari lesson about swallowed errors: a Supabase call
  that isn't explicitly checked for `.error` can fail completely
  silently, which matters most exactly in cleanup/rollback code, where
  nothing else will surface a failure.

  Verified end-to-end against the live database with realistic
  decimal amounts across four different currencies (USD, EUR, GBP, and
  INR itself) in one file: correct live FX conversion and rounding on
  each row, balances netting out correctly across the mixed currencies,
  the all-or-nothing rejection path (mixed valid/invalid rows correctly
  blocking the whole file), a simulated offline state blocking the
  Import button while still allowing preview (and re-enabling live the
  moment connectivity returns), a simulated mid-import network failure
  correctly triggering the auto-rollback with zero rows left behind,
  and undo restoring the ledger to empty and marking the batch
  "Undone."

### Deliberately not doing — and why

- **Auto-creating a Google Sheet in someone's Drive.** CSV export
  already gets the data out in a format Sheets opens natively — this
  would mean standing up real Google OAuth (a Cloud project, consent
  screens, token storage and refresh, a new Edge Function to hold the
  credentials) for a benefit ("drag the CSV into Drive" becomes
  automatic) that isn't worth that much new infrastructure.

- **Actually transferring money (Venmo's core business).** Money
  transmission licensing, KYC/AML obligations, PCI compliance for card
  handling. This is a multi-million-dollar regulatory undertaking for a
  company, not a feature for a personal project. The settle-up deep link
  above gets ~90% of the user-facing benefit with none of the liability.
  Reconfirmed 2026-09-05 after specifically checking whether a payment
  gateway API (UPI, PayPal, Venmo, Google Pay) could get around this for
  free: none can. Every one of them requires the *sender* to authenticate
  inside that provider's own interface for a real transfer — none offer
  silent third-party-initiated P2P payment, for the same fraud/AML
  reasons this was excluded in the first place. This isn't a pricing
  problem to solve later; it's structural. Decision: keep "Record
  payment" exactly as it works today — pay by whatever method actually
  works (UPI/Venmo/PayPal deep link, cash, bank transfer, anything),
  then mark it settled here for a clean ledger. That's the whole feature;
  nothing further to build.
- **Bank/card transaction auto-import (Plaid or similar).** Splitwise
  Pro's version of this uses Plaid-style bank integrations, for a
  benefit (auto-detecting expenses) that matters more to someone
  tracking solo spending than to a small trusted group entering shared
  costs deliberately. Specifically checked 2026-09-05: Plaid's real bank
  coverage is the US, Canada, UK, and EU — no India, no UPI-linked banks.
  Its free tier is also better than expected (a real Trial plan, up to
  10 production connections, no cost) — but coverage is the actual
  blocker here, not price: this app's real usage (UPI, INR, the
  Varanasi/Rameswaram trip) is squarely outside where Plaid works at
  all, so this stays excluded regardless of budget.
- **A public/social activity feed.** Venmo's default-public payment feed
  is one of its most consistently criticized design choices — people
  regularly get surprised their transactions were visible to strangers.
  This app is for trusted family/friend groups handling real financial
  detail; more privacy than Venmo, not less, is the right default here.
- **Business/merchant payment profiles.** Not relevant to peer expense
  splitting.

## If you want to pick a starting point

The "Now" list is roughly a day or two of work total and doesn't touch
infrastructure. The settle-up deep link is the best single next thing to
build — it's the most visible "this feels like a real app now" moment for
the least amount of code.
