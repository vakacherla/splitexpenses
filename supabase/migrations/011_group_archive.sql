-- Replaces "a group's creator can permanently delete it" (added in
-- migration 010) with a recoverable archive instead: deleting now sets
-- archived_at rather than removing the row, so a group and everything in
-- it (expenses, splits, settlements, receipts) can come back exactly as
-- it was. Only a platform admin can permanently purge an archived group,
-- as a deliberate separate action — see the Admin → Groups tab.
--
-- Run this once in the SQL Editor of your existing project. Safe to run
-- whether or not you ran migration 010 first.

alter table public.groups
  add column if not exists archived_at timestamptz;

drop policy if exists "groups: members can view" on public.groups;
create policy "groups: members can view" on public.groups
  for select using (
    (archived_at is null and (public.is_group_member(id) or created_by = auth.uid()))
    or public.is_platform_admin()
  );

-- The owner no longer needs a DELETE grant — archiving is an UPDATE
-- (setting archived_at), already covered by the existing
-- "groups: creator can update" policy, which has no column restrictions.
drop policy if exists "groups: creator can delete" on public.groups;
