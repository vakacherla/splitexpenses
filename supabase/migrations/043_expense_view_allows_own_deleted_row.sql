-- Root cause of the soft-delete RLS bug fixed in migration 042 wasn't the
-- "members can edit" policy's WITH CHECK after all (that was already
-- correct). Reproducing the failure directly in SQL (impersonating the
-- affected non-admin member in a rolled-back transaction) showed Postgres
-- enforces the "members can view" SELECT policy against the *post-update*
-- row during an UPDATE, even with no RETURNING clause. Once deleted_at is
-- set, a regular member's expense falls out of both branches of that
-- policy (deleted_at is no longer null, and they aren't a platform admin),
-- so Postgres blocks the update as producing a row the actor can't see —
-- independent of "members can edit"'s own USING/WITH CHECK, which was
-- passing the whole time.
--
-- Fix: let whoever can edit an expense (creator, payer, or group manager)
-- also still see it after it's been soft-deleted. The app already filters
-- deleted_at itself when loading the ledger (see TripView.jsx), so this
-- does not make deleted expenses reappear in anyone's normal browsing.
--
-- Run this once in the SQL Editor of your existing project.

drop policy if exists "expenses: members can view" on public.expenses;
create policy "expenses: members can view" on public.expenses
  for select using (
    (
      public.is_group_member(group_id)
      and (
        deleted_at is null
        or created_by = auth.uid()
        or paid_by = auth.uid()
        or public.is_group_manager(group_id)
      )
    )
    or public.is_platform_admin()
  );
