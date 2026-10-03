-- An archived trip takes no new ledger entries (DEF-025, found by test TRIP-22).
--
-- Why: archiving a trip hides it in the app, and the app refuses to open it
-- (DEF-009), but the database itself still accepted an expense or a settlement for
-- an archived trip from a stale tab, a queued offline write, or a direct call.
-- Anything that slipped in was invisible to everyone yet still counted in balances.
--
-- What changes. The rules that let a member add rows now also require that the
-- trip is not archived:
--   expenses        insert    (also covers create_expense_with_splits, which runs
--                              with the caller's own rights)
--   expense_splits  insert    (also covers update_expense_with_splits, which re-saves
--                              an expense's splits: an existing expense in an archived
--                              trip can no longer be re-saved either, so an archived
--                              trip is read-only for ledger entries)
--   settlements     insert
--
-- Why a helper function. An ordinary member cannot see an archived trip at all
-- (migration 044 lets only the creator, managers and admins see it), so a plain
-- "the trip is not archived" test written inside the policy would find no archived
-- trip for a member and let the insert through. is_group_archived() looks the trip
-- up with elevated rights and returns only true or false, so the rule behaves the
-- same for everyone.
--
-- Left as they are on purpose: archiving and restoring a trip, soft-deleting an
-- existing expense (so the creator can still tidy up), and everything platform
-- admins do. Whether members should also be blocked from editing the fields of an
-- existing expense in an archived trip is a separate decision.
--
-- Safe to run more than once.

create or replace function public.is_group_archived(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.groups where id = gid and archived_at is not null
  );
$$;

revoke all on function public.is_group_archived(uuid) from public, anon;
grant execute on function public.is_group_archived(uuid) to authenticated;

drop policy if exists "expenses: members can add" on public.expenses;
create policy "expenses: members can add" on public.expenses
  for insert with check (
    public.is_group_member(group_id)
    and auth.uid() = created_by
    and not public.is_group_archived(group_id)
  );

drop policy if exists "splits: members can add" on public.expense_splits;
create policy "splits: members can add" on public.expense_splits
  for insert with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and public.is_group_member(e.group_id)
        and not public.is_group_archived(e.group_id)
    )
  );

drop policy if exists "settlements: members can add" on public.settlements;
create policy "settlements: members can add" on public.settlements
  for insert with check (
    public.is_group_member(group_id)
    and auth.uid() = created_by
    and not public.is_group_archived(group_id)
  );

notify pgrst, 'reload schema';
