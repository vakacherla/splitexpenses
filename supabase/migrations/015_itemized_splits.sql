-- Adds itemized bill splitting: assigning individual receipt line items
-- (rather than the whole expense) to specific people, with tax and tip
-- each split proportionally by each person's item subtotal. The balance
-- math itself doesn't change — this still produces one exact
-- share_amount per person in expense_splits, same as the existing
-- "exact" mode — but the per-item breakdown is kept on the expense
-- itself so it can be shown back to the group later.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.expenses
  drop constraint if exists expenses_split_type_check;
alter table public.expenses
  add constraint expenses_split_type_check
  check (split_type in ('equal', 'percentage', 'exact', 'itemized'));

-- [{ description text, amount numeric, participant_ids uuid[] }], plus tax
-- and tip, each split proportionally across participants by item
-- subtotal and kept as separate figures (rather than one lump sum) so
-- they can be shown back to the group as distinct lines. Null for every
-- non-itemized expense.
alter table public.expenses
  add column if not exists items jsonb,
  add column if not exists tax numeric check (tax is null or tax >= 0),
  add column if not exists tip numeric check (tip is null or tip >= 0);

-- A new column needs the PostgREST schema cache reloaded, or queries
-- referencing it can fail with "column does not exist" even though this
-- migration ran cleanly.
notify pgrst, 'reload schema';
