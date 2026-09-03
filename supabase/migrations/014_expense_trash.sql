-- Makes deleting an expense recoverable, same pattern as archiving a
-- group: "delete" from the Ledger now sets deleted_at instead of
-- actually removing the row, so it stops counting toward anyone's
-- balance and disappears from the ledger, but the platform admin can
-- restore it or permanently purge it (Admin → Trash) — nothing is
-- truly gone until that admin action.
--
-- This also removes the ability for a regular group member to
-- permanently delete an expense outright, which was the actual gap:
-- previously *any* member could hard-delete *any* expense in a group
-- they belonged to, with zero recovery path.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.expenses
  add column if not exists deleted_at timestamptz;

drop policy if exists "expenses: members can view" on public.expenses;
create policy "expenses: members can view" on public.expenses
  for select using (
    (deleted_at is null and public.is_group_member(group_id)) or public.is_platform_admin()
  );

drop policy if exists "expenses: members can delete" on public.expenses;

drop policy if exists "expenses: admin can update" on public.expenses;
create policy "expenses: admin can update" on public.expenses
  for update using (public.is_platform_admin());

drop policy if exists "expenses: admin can delete" on public.expenses;
create policy "expenses: admin can delete" on public.expenses
  for delete using (public.is_platform_admin());
