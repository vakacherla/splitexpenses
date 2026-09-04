# Manual test plan

The automated suite (`npm test`) covers split math, balance/debt logic, and
currency formatting — the parts where a silent bug means someone's money is
wrong. Everything below needs a real browser, a real session, and human
judgment (visual layout, whether an error message actually makes sense),
so it's written as a checklist rather than code.

Priority tags: **P0** = would actually hurt someone (wrong money, broken
security boundary, data loss) — don't ship with a failing P0. **P1** =
broken/confusing but not dangerous. **P2** = polish.

Where a case needs a second account, sign up a throwaway one — it's your
own project, safe to make test data.

## Auth & routing

- [ ] **P0** — Sign up with a new email → lands in the app (or "check your
      email," depending on your Confirm Email setting)
- [ ] **P1** — Sign up with an email already in use → clear error, not a
      crash
- [ ] **P0** — Sign in with correct credentials → reaches Dashboard
- [ ] **P1** — Sign in with wrong password → clear error, no crash
- [ ] **P0** — Sign out → back at Login, and hitting Back afterward doesn't
      show cached authenticated pages
- [ ] **P0** — Logged out, navigate directly to `/dashboard` or
      `/groups/<id>` by URL → redirected to Login, not a broken page
- [ ] **P0** — Logged in as a non-admin, navigate directly to `/admin` by
      URL → redirected to Dashboard, not an error or a peek at admin data

## Groups

- [ ] **P0** — Create a group → appears on Dashboard, you're its only
      member, invite code is visible under Members
- [ ] **P0** — Second account joins with the correct invite code → shows
      up in both accounts' member lists
- [ ] **P1** — Second account tries an invalid/mistyped code → clear
      error, doesn't join anything
- [ ] **P1** — Belonging to multiple groups → Dashboard lists all of them
      with correct member counts
- [ ] **P0** — Group creator makes another member a manager → that
      member can now rename the group, remove a regular member, and
      archive it
- [ ] **P0** — A manager cannot make someone else a manager, remove
      another manager, or remove/demote the creator — none of those
      controls should even appear for a manager
- [ ] **P1** — Creator removes someone's manager status → they
      immediately lose those powers (Group settings section disappears
      for them)
- [ ] **P1** — A regular (non-manager) member sees no Group settings
      section at all
- [ ] **P0** — Owner or manager duplicates a group (Group settings →
      "Duplicate this group") → a new group appears on their Dashboard
      with the entered name (or "<name> (copy)" if left blank), the same
      home currency, a *different* invite code, and every source-group
      member present with their manager roles intact — except the person
      who did the duplicating, who is the new group's owner regardless of
      their role in the source
- [ ] **P0** — The duplicated group has zero expenses, zero settlements,
      and no trip dates carried over — it's a blank ledger
- [ ] **P1** — A regular (non-manager) member sees no "Duplicate this
      group" option in Group settings (the section shouldn't even be
      reachable — they have no settings gear at all)

## Expenses

- [ ] **P0** — Add an expense in the group's home currency → no FX panel
      shown, saves and appears in the ledger correctly
- [ ] **P0** — Add an expense in a *different* currency → live-converted
      amount shown before saving, and both the original and converted
      amounts are correct afterward
- [ ] **P0** — Equal split → each participant's share is correct and the
      shares sum to the total (test with an amount that doesn't divide
      evenly, e.g. 100 split 3 ways)
- [ ] **P0** — Percentage split → entering percentages that don't sum to
      100 is blocked with a clear message; a valid split saves correctly
- [ ] **P0** — Exact-amount split → entering amounts that don't sum to the
      total is blocked; a valid split saves correctly
- [ ] **P1** — Deselecting a participant excludes them from that expense's
      split entirely (they owe nothing for it)
- [ ] **P1** — Category is saved and shows up correctly (colored dot +
      label) in the ledger row
- [ ] **P1** — Expanding an expense row shows the correct per-person split
      breakdown
- [ ] **P0** — Deleting an expense removes it from the ledger *and*
      correctly updates Balances afterward
- [ ] **P0** — "Edit" only appears for an expense you entered or paid
      for, never someone else's — same as "Delete this expense" already
      works
- [ ] **P0** — Edit an expense's split (e.g. switch equal → exact, or
      reassign who's included) without touching amount/currency → saves
      correctly, Balances reflects the new split, and the original
      exchange_rate/amount_in_home are unchanged (check via the group's
      home-currency figure not shifting for an expense in a foreign
      currency)
- [x] **P0** — Edit an expense's amount or currency → a fresh exchange
      rate is fetched and amount_in_home updates correctly. Verified in
      prod 2026-09-04: edited an equal-split expense's amount to 12.90 —
      recalculated correctly to 6.45/6.45 between two people.
- [ ] **P1** — Edit each split type once (equal, percentage, exact,
      itemized) → every field pre-fills exactly as it was saved,
      including itemized's per-item assignments and tax/tip
- [ ] **P1** — Edit an itemized expense's items/tax/tip → the live
      per-person totals shown while editing match what actually saves
- [ ] **P1** — Scan a receipt (needs `GEMINI_API_KEY` and/or
      `OPENROUTER_API_KEY` set) → description, amount, currency, date, and
      category pre-fill correctly; a clearly unreadable photo fails with a
      message rather than silently filling in wrong data
- [ ] **P1** — Scan an itemized receipt (e.g. a restaurant check) → line
      items pre-fill and the form switches to Itemized mode automatically
- [ ] **P0** — Itemized split: assign different items to different people,
      enter tax and tip in their own fields → each person's share reflects
      only what they were assigned, plus their proportional share of both
      tax and tip (someone who ordered more of the bill owes more of each)
- [ ] **P0** — Itemized split: an item assigned to nobody (or everyone
      unassigned from a member who's then unchecked from the expense) is
      blocked from saving with a clear message
- [ ] **P1** — Itemized split: remove/add item rows, retoggle which people
      are on an item — the live per-person total at the bottom updates
      correctly and the computed total stays in sync
- [ ] **P1** — Expanding an itemized expense's row shows the per-item
      breakdown (who it was assigned to) alongside the final per-person
      totals
- [ ] **P0** — "Duplicate" on an expense (any group member, not just
      whoever entered/paid for it) opens the add-expense form pre-filled
      with the same description, category, amount, currency, payer,
      split type, and participants/shares — but today's date, not the
      original's, and no receipt attached
- [ ] **P1** — Saving a duplicated expense creates a brand-new row (the
      original is untouched) with its own fresh exchange rate for today,
      not the original's locked-in rate
- [ ] **P1** — Duplicating an itemized expense carries over every item,
      its assignments, and tax/tip correctly
- [x] **P0** — "Attach receipt" appears on an expense you created/paid for
      that has no receipt; picking a photo uploads it and shows "View
      receipt" immediately, no page reload needed. Verified 2026-09-04 —
      shown in gold/accent (not the same green as Edit/Duplicate) so it
      stands out as worth noticing.
- [ ] **P1** — "Attach receipt" doesn't appear for an expense someone else
      entered/paid for, nor for one that already has a receipt
- [x] **P0** — "+ Attach a receipt" also appears inside the Edit modal
      itself (same plain upload, no re-scanning), for anyone who clicks
      "Edit" expecting to find it there rather than on the collapsed row.
      Verified 2026-09-04. Shows "📎 Receipt attached" once done; shows
      "Attach a receipt once this syncs" instead, with no button, for a
      still-pending offline expense.
- [ ] **P1** — Switching split mode to Itemized on an expense that already
      has a total (a fresh entry, or editing one saved as equal/percentage/
      exact) seeds one starting item with that amount and the expense's
      description, plus a hint explaining it's the full original amount —
      rather than silently dropping the total to 0.00. Adding a second
      item, or removing the seeded one, clears the hint.

## Balances & settling up

- [ ] **P0** — Balances tab shows the correct net position for every
      member after a mix of expenses
- [ ] **P0** — Suggested settle-up produces a sensible, correct set of
      payments (cross-check the math by hand for a 3+ person case)
- [ ] **P0** — Recording a payment in the home currency updates balances
      correctly
- [ ] **P0** — Recording a payment in a *different* currency shows the
      live-converted equivalent and both amounts are stored correctly
- [ ] **P1** — Undoing a settlement reverts the balance exactly back
- [ ] **P2** — A fully-settled group shows "nothing to settle," not an
      empty or confusing state
- [ ] **P1** — Set a trip's end date in the past (Members → Group
      settings) → within a day, everyone who still owes money there gets
      a reminder (email and/or push, whichever's configured); a fully
      settled group with a past end date gets no reminder
- [ ] **P1** — The manual "Remind" button on a suggested settle-up row
      only shows for whoever's owed money on that row, and actually
      delivers (check both the recipient's email and their device, if
      push is set up)
- [ ] **P2** — Two reminders in a row for the same overdue trip, less
      than 3 days apart → the second one doesn't fire (cooldown)
- [ ] **P1** — Profile → Notifications → Enable → browser's own
      permission prompt appears; once granted, the button flips to
      "Disable on this device"; disabling removes that device's
      subscription (a reminder afterward shouldn't reach it)

## Reports

- [ ] **P1** — Category chart and totals match what you'd get adding the
      expenses up by hand
- [ ] **P1** — "By who paid" chart matches actual amounts paid (not
      shares — this is deliberate, see README)
- [ ] **P1** — Category × person table numbers are internally consistent
      with the two charts above
- [ ] **P2** — A group with no expenses shows an empty state, not a
      broken chart

## Admin — Users

- [ ] **P0** — Non-admin account: no "Admin" link anywhere in the nav
- [ ] **P0** — Admin → Users lists every account on the platform, not
      just your own groups' members
- [ ] **P0** — Suspending a user immediately prevents them from signing in
- [ ] **P1** — Unsuspending restores their ability to sign in
- [ ] **P0** — Deleting a user with **no** expense/settlement history
      succeeds
- [ ] **P0** — Deleting a user **with** expense history anywhere is
      blocked, with a clear explanation (not a raw database error)
- [ ] **P0** — You cannot suspend or delete your own admin account from this
      screen (button shouldn't even appear for your own row)
- [ ] **P0** — Only a super admin sees the promote/demote controls; a
      regular admin doesn't see them at all
- [ ] **P0** — Promote/demote buttons never appear on your own row, even
      as a super admin
- [ ] **P1** — Promoting a member to admin, then to super admin, then
      demoting back down, works at each step
- [ ] **P1** — The very first super admin (oldest admin account) shows
      the "SU" badge; anyone promoted after shows "admin" until also
      made super admin
- [ ] **P0** — Only a super admin sees "Add to group" on a user's row; a
      regular admin doesn't see it at all
- [ ] **P0** — Super admin picks a user with zero groups and a target
      group, clicks Add → that user now has that group on their own
      Dashboard next time they load it, with no invite code ever
      exchanged
- [ ] **P1** — Picking a user already in the target group and adding
      them again is a harmless no-op (no duplicate row, no error)
- [ ] **P1** — A non-super-admin calling `admin_add_user_to_group`
      directly (e.g. via the Network tab / SQL, replaying the RPC) gets
      rejected with "Only a super admin can add a user to a group
      directly," not actual data
- [ ] **P0** — "Manage groups" on a user's row lists every group they're
      currently in with its own Remove button; clicking Remove takes
      them out of that group immediately (check their own Dashboard next
      load) without touching any other membership
- [ ] **P1** — Removing a user from a group they have expense history in
      leaves those expenses in the ledger untouched — only their roster
      membership disappears
- [ ] **P1** — A non-super-admin calling `admin_remove_user_from_group`
      directly gets rejected the same way as the add RPC

## Admin — Groups

- [ ] **P0** — Admin → Groups lists every group platform-wide with
      accurate member counts
- [ ] **P1** — Each group (active and archived) shows an accurate
      "Created &lt;date&gt; by &lt;name&gt;" line matching who actually created it
      and when
- [ ] **P0** — Every Overview stat tile is clickable and lands on the
      right tab (Groups/Users/Active users/Expenses logged/Settlements
      recorded)
- [ ] **P0** — Admin → Settlements lists every settlement platform-wide
      with correct from/to names, group, date, and amount (including the
      home-currency equivalent when the settlement currency differs from
      the group's)
- [ ] **P1** — Renaming a group updates immediately, and the new name
      shows correctly on that group's own page too
- [ ] **P0** — Deleting a group archives it (check the Supabase table
      editor: the row and its expenses/splits/settlements are all still
      there, just `archived_at` is set) — it disappears from every
      member's dashboard immediately
- [ ] **P0** — An archived group shows under "Archived" with a day count
      and 30-days-left message; Restore brings it back to normal
- [ ] **P0** — "Permanently delete" on an archived group actually removes
      the row and its expenses/splits/settlements (only appears/succeeds
      once 30+ days have passed)
- [ ] **P1** — Clicking into a group from Admin lands on its real
      Ledger/Balances/Reports/Members, shows a "Viewing as admin" note,
      and hides the add-expense button

## Admin — Trash

- [ ] **P0** — Deleting an expense from a group's Ledger removes it from
      that ledger and from balance calculations immediately, but the row
      still exists (check the table editor: `deleted_at` is set, not
      actually gone)
- [ ] **P0** — That expense shows up in Admin → Trash with the right
      group name, amount, and day count
- [ ] **P0** — Restoring it from Trash brings it back to the group's
      Ledger and balances exactly as before
- [ ] **P0** — "Delete permanently" on a trashed expense actually removes
      the row (only appears/succeeds once 30+ days have passed)
- [ ] **P1** — A regular (non-admin) member never sees deleted expenses
      anywhere, including if they know the group is theirs — deleting is
      still self-service, only recovery is admin-only

## Security boundaries (do these even though they're awkward to test)

- [ ] **P0** — Using a second account that is *not* a member of a group,
      confirm they cannot see that group anywhere in their own UI
- [ ] **P0** — With browser dev tools open, try editing your own profile
      via a direct Supabase call to set `is_admin: true` while signed in
      as a non-admin — confirm it does *not* take effect (the database
      trigger should silently block it)
- [ ] **P1** — A non-admin calling the `admin-users` function directly
      (e.g. via the Network tab, replaying the request) gets rejected
      with "Admins only," not actual data

## Cross-device & responsive

- [ ] **P0** — Full flow (sign in → create group → add expense → view
      balances) works on an actual phone, not just a resized browser
      window
- [ ] **P1** — No horizontal scrolling anywhere on a small screen
- [ ] **P1** — The floating add-expense button never overlaps content or
      becomes unreachable
- [ ] **P2** — Layout looks intentional (not just "not broken") on a
      laptop-width screen too

## Dark / light mode

- [ ] **P1** — Toggling is instant, no flash of the wrong theme on a
      fresh page load in either mode
- [ ] **P1** — Your choice persists after closing and reopening the
      browser
- [ ] **P2** — First visit with no saved preference matches your system's
      light/dark setting
- [ ] **P1** — Spot-check Login, Dashboard, a group's Ledger/Balances/
      Reports, and Admin in dark mode — everything should stay readable,
      not just "not broken"

## Offline mode

- [x] **P0** — Load a group online once, go offline (airplane mode or
      devtools "Offline"), reload the page → the group renders fully from
      cache with a "Showing saved data from…" note, not a spinner.
      Verified 2026-09-04.
- [x] **P0** — While offline, add a same-currency expense → appears
      instantly in the ledger tagged "Pending sync," the Save button isn't
      stuck disabled, no error shown. Verified 2026-09-04 in production
      testing (two real accounts, real airplane-mode conditions).
- [x] **P0** — Reconnecting after an offline add syncs automatically and
      the ledger updates on its own — no manual page refresh needed.
      Fixed 2026-09-04 after initial testing found the synced row wasn't
      appearing until a hard refresh: `GroupView` now reloads the moment a
      sync run finishes (watches the syncing→idle transition), since the
      queue entry disappearing on success doesn't by itself put the real
      row into the page's own state.
- [ ] **P0** — While offline, add a foreign-currency expense with no
      cached rate for that pair at all → still saves (queued), shows an
      estimate clearly marked pending rather than blocking on "still
      fetching the exchange rate." Reconnect → sync fills in the real
      exchange rate and home-currency amount, not a guess
- [ ] **P0** — Simulated conflicting edit: edit an expense's description
      on one session while online (succeeds), then edit its amount on a
      second, offline session, then reconnect the second → the offline
      edit applies (last-write-wins) and a conflict warning names what
      was overwritten; reloading the first session confirms the new
      amount, not a silently reverted one. Needs migration 020
      (`expenses.updated_at` + trigger) applied before this is meaningful
      to test — without it, the sync engine's conflict-detection query
      fails and the edit lands in the failed-ops list instead.
- [x] **P1** — Delete an expense while offline that was itself added
      while offline and never synced → both the create and delete vanish
      from the queue, nothing ever reaches the server. Covered by the
      `offlineQueue.test.js` unit tests; not separately hand-verified in
      the browser yet.
- [ ] **P1** — Edit an expense that was deleted by someone else while you
      were offline → the edit is discarded on sync with a clear message,
      not silently applied to a soft-deleted row
- [ ] **P0** — Recording a settlement while offline → same queued/pending
      treatment as an expense, appears immediately, syncs on reconnect
- [ ] **P0** — `/admin` as a non-admin, offline, direct URL → shows a
      clear connection-error/retry state, never hangs forever on
      "Checking access…"
- [ ] **P1** — First-ever offline visit to a group never opened on this
      device (or the Dashboard on a fresh device with no cache) → a clear
      "reconnect to load this the first time" message, not an infinite
      skeleton
- [x] **P0** — A genuine network failure that resolves as a query *error*
      rather than a rejected request (confirmed on Safari/WebKit, message
      text "TypeError: Load failed") is still treated as offline, not
      shown as a raw error — `GroupView.load()` checks `navigator.onLine`
      alongside any query error before deciding whether to fall back to
      cache. Fixed 2026-09-04 after real Safari testing surfaced the raw
      error message on an offline reload.
- [x] **P2** — Scanning a receipt while offline shows a clear red warning
      ("Receipts need a connection…") instead of the scan button, and
      attaching one to a still-pending expense shows "Attach a receipt
      once this syncs" rather than silently doing nothing. Verified
      2026-09-04.
- [x] **P1** — The sync banner at the top of the app reflects reality at
      each stage, each with its own icon: offline (red, wifi-off icon),
      syncing (green, spinning refresh icon), waiting to sync (neutral,
      clock icon, with a manual "Retry now"), and a failed op after
      repeated retries (red, warning icon) showing Retry/Discard rather
      than disappearing on its own. Verified 2026-09-04, including a
      round of feedback on font size and color contrast.

## Resilience

- [ ] **P1** — Turn off wifi mid-save on an expense form → a clear error,
      not a half-saved expense with no split rows
- [ ] **P2** — If Frankfurter's API is slow or down, the amount field
      shows "Rate unavailable" rather than hanging forever or crashing
