-- Adds two new split types: "shares" (relative weight, e.g. 2 shares vs.
-- 1, rather than a percentage that must sum to 100) and "adjustment"
-- (start from an equal split, then nudge individual amounts up/down from
-- there). Both still resolve to one exact share_amount per person in
-- expense_splits, same as every other split type — these two new columns
-- only keep the *raw input* around so the form can be reopened for editing
-- without losing the original share counts / deltas the person typed,
-- the same way `percentage` already does for the percentage split type.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.expenses
  drop constraint if exists expenses_split_type_check;
alter table public.expenses
  add constraint expenses_split_type_check
  check (split_type in ('equal', 'percentage', 'exact', 'itemized', 'shares', 'adjustment'));

-- share_units: the raw share weight typed for this person (e.g. 2, 1, 0.5).
-- Only meaningful when the expense's split_type is 'shares'.
-- adjustment: the raw delta-from-equal typed for this person (positive =
-- pays more, negative = pays less). Only meaningful when split_type is
-- 'adjustment'. Both null for every other split type.
alter table public.expense_splits
  add column if not exists share_units numeric check (share_units is null or share_units >= 0),
  add column if not exists adjustment numeric;

-- A new column needs the PostgREST schema cache reloaded, or queries
-- referencing it can fail with "column does not exist" even though this
-- migration ran cleanly.
notify pgrst, 'reload schema';
