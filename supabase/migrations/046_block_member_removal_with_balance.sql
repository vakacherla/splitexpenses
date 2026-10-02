-- ACT-05 follow-up (found 2026-10-02): removing a member who still has an
-- unsettled balance orphans the money. Their name drops out of Balances and
-- the settle-up suggestion reads "You owes $15.00" with no creditor.
--
-- The client already refused this (TripView.handleRemoveMember), but that
-- check runs in the browser against whatever the page last loaded, so it
-- passed when another member had just added an expense (stale data). The
-- admin removal RPC (migration 019) skipped the check on purpose, and
-- "leave a group" never had one. Enforcing it here, on the table itself,
-- covers every path: owner/manager removal, admin removal, and leaving.
--
-- The balance formula is the same as src/lib/balances.js computeNetBalances:
-- + home amount of live expenses they paid, - their split shares of live
-- expenses, + settlements they paid, - settlements they received.
-- Soft-deleted expenses do not count (same as the ledger).
--
-- Deleting the whole trip (admin purge cascades to group_members) must keep
-- working, so the check is skipped when the trip row is already gone.

create or replace function public.group_member_net_balance(gid uuid, uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(e.amount_in_home) from public.expenses e
              where e.group_id = gid and e.deleted_at is null and e.paid_by = uid), 0)
    - coalesce((select sum(s.share_in_home) from public.expense_splits s
                join public.expenses e on e.id = s.expense_id
                where e.group_id = gid and e.deleted_at is null and s.user_id = uid), 0)
    + coalesce((select sum(st.amount_in_home) from public.settlements st
                where st.group_id = gid and st.from_user = uid), 0)
    - coalesce((select sum(st.amount_in_home) from public.settlements st
                where st.group_id = gid and st.to_user = uid), 0);
$$;

create or replace function public.block_member_removal_with_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.groups g where g.id = old.group_id) then
    return old;
  end if;

  if abs(public.group_member_net_balance(old.group_id, old.user_id)) > 0.01 then
    raise exception 'Can''t remove this person — they still have an unsettled balance in this trip. Settle up first.';
  end if;

  return old;
end;
$$;

drop trigger if exists group_members_block_removal_with_balance on public.group_members;
create trigger group_members_block_removal_with_balance
  before delete on public.group_members
  for each row execute function public.block_member_removal_with_balance();

notify pgrst, 'reload schema';
