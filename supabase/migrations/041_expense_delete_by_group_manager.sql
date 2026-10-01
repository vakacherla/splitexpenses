-- Migration 017 tightened expense soft-delete to created_by/paid_by only,
-- which is correct as the default rule but leaves no self-service path
-- for a trip organizer to clean up someone else's mistake (e.g. a
-- duplicate entry) — the only way to fix it was a platform admin
-- reaching into Admin → Trash. Since a group creator/manager can already
-- rename or archive the group (013_group_managers.sql), let them also
-- soft-delete any expense within it.
--
-- Run this once in the SQL Editor of your existing project.

drop policy if exists "expenses: members can edit" on public.expenses;
create policy "expenses: members can edit" on public.expenses
  for update using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or paid_by = auth.uid() or public.is_group_manager(group_id))
  );
