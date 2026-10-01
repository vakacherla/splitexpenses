-- Live testing (2026-10-01) with a real second account found a regular
-- (non-admin, non-creator-of-trip) member's own soft-delete of their own
-- expense rejected with "new row violates row-level security policy for
-- table expenses", even though created_by/paid_by/group_id were all
-- unchanged by the update and plainly satisfied the USING clause moments
-- before. Confirmed via Supabase's own request/Postgres logs: the request
-- genuinely authenticated as that user, her group_members row and the
-- expense's created_by matched exactly, and no other table/trigger was
-- involved. This was the first real exercise of this policy by an actual
-- non-admin member — migration 041 shipped with no second account
-- available to test it against in the original QA pass.
--
-- Rather than rely on Postgres defaulting an unspecified WITH CHECK to
-- the USING expression for UPDATE, make it explicit and identical, in
-- case the managed Postgres version in use handles the implicit default
-- differently than expected.
--
-- Run this once in the SQL Editor of your existing project.

drop policy if exists "expenses: members can edit" on public.expenses;
create policy "expenses: members can edit" on public.expenses
  for update using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or paid_by = auth.uid() or public.is_group_manager(group_id))
  )
  with check (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or paid_by = auth.uid() or public.is_group_manager(group_id))
  );
