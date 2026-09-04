-- Closes a real gap: migration 014 replaced "expenses: members can
-- delete" with an admin-only delete policy, but left the original,
-- much broader "expenses: members can edit" UPDATE policy in place
-- (any group member, full stop). Since Postgres OR's multiple policies
-- for the same command together, that meant any group member could
-- already update — and, via the deleted_at soft-delete trick, delete —
-- any expense in the group, not just their own. The Ledger UI only ever
-- showed the delete button for an expense you entered or paid for
-- (ExpenseRow.jsx), but that was cosmetic: the underlying request was
-- never actually restricted to match.
--
-- This tightens it to match the UI's existing rule exactly — created_by
-- or paid_by — which is also the permission "edit an existing expense"
-- (still on the roadmap) should build against, so it's correct before
-- that UI exists rather than after.
--
-- Run this once in the SQL Editor of your existing project.

drop policy if exists "expenses: members can edit" on public.expenses;
create policy "expenses: members can edit" on public.expenses
  for update using (
    public.is_group_member(group_id) and (created_by = auth.uid() or paid_by = auth.uid())
  );
