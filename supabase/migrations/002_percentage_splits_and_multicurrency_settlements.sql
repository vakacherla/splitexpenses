-- Run this ONLY if you already ran the original schema.sql and have a live
-- project with data in it. If you're setting up a fresh project, skip this
-- file — the current schema.sql already includes everything here.
--
-- Adds: percentage-based expense splits, and settlements paid in any
-- currency (previously settlements were entered only in the group's home
-- currency).

alter table public.expenses
  add column if not exists split_type text not null default 'equal';

alter table public.expenses
  drop constraint if exists expenses_split_type_check;
alter table public.expenses
  add constraint expenses_split_type_check check (split_type in ('equal', 'percentage', 'exact'));

alter table public.expense_splits
  add column if not exists percentage numeric;

alter table public.expense_splits
  drop constraint if exists expense_splits_percentage_check;
alter table public.expense_splits
  add constraint expense_splits_percentage_check check (percentage is null or (percentage >= 0 and percentage <= 100));

-- Backfill existing settlements as if they were entered in the group's own
-- home currency at a 1:1 rate, then make the new columns required.
alter table public.settlements
  add column if not exists currency text;
alter table public.settlements
  add column if not exists amount numeric;
alter table public.settlements
  add column if not exists exchange_rate numeric;

update public.settlements s
set
  currency = coalesce(s.currency, g.home_currency),
  amount = coalesce(s.amount, s.amount_in_home),
  exchange_rate = coalesce(s.exchange_rate, 1)
from public.groups g
where g.id = s.group_id;

alter table public.settlements
  alter column currency set not null,
  alter column amount set not null,
  alter column exchange_rate set not null;

alter table public.settlements
  drop constraint if exists settlements_amount_check;
alter table public.settlements
  add constraint settlements_amount_check check (amount > 0);

alter table public.settlements
  drop constraint if exists settlements_exchange_rate_check;
alter table public.settlements
  add constraint settlements_exchange_rate_check check (exchange_rate > 0);
