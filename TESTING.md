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

## Admin — Groups

- [ ] **P0** — Admin → Groups lists every group platform-wide with
      accurate member counts
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

## Resilience

- [ ] **P1** — Turn off wifi mid-save on an expense form → a clear error,
      not a half-saved expense with no split rows
- [ ] **P2** — If Frankfurter's API is slow or down, the amount field
      shows "Rate unavailable" rather than hanging forever or crashing
