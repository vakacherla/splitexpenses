-- Every amount column in the schema already enforces a lower bound
-- (`> 0` on expenses.amount/amount_in_home and settlements.amount/
-- amount_in_home, `>= 0` on expense_splits.share_amount/share_in_home)
-- but nothing capped the other direction — a fat-fingered extra zero or
-- two would insert without complaint. Client-side now rejects anything
-- over 10,000,000 (src/lib/amountBounds.js, used by AddExpenseForm,
-- SettleUpModal, and csvImport.js); this closes the same gap at the
-- data layer these tables have for every other rule (percentage's
-- 0-100 check already lives here, for the same reason).
--
-- Run this once in the SQL Editor of your existing project.

-- Added NOT VALID, same reasoning as migration 029: this can't inspect
-- your existing data, and unlike a date typo there's no safe corrected
-- value to guess for a real financial amount, so existing rows are left
-- untouched while every future insert/update is checked. If you want
-- existing rows validated too, confirm none actually exceed 10,000,000
-- first, then run:
--   alter table public.expenses validate constraint expenses_amount_ceiling;
--   alter table public.expenses validate constraint expenses_amount_in_home_ceiling;
--   alter table public.settlements validate constraint settlements_amount_ceiling;
--   alter table public.settlements validate constraint settlements_amount_in_home_ceiling;
--   alter table public.expense_splits validate constraint expense_splits_share_amount_ceiling;
--   alter table public.expense_splits validate constraint expense_splits_share_in_home_ceiling;

alter table public.expenses
  add constraint expenses_amount_ceiling check (amount <= 10000000) not valid;
alter table public.expenses
  add constraint expenses_amount_in_home_ceiling check (amount_in_home <= 10000000) not valid;

alter table public.settlements
  add constraint settlements_amount_ceiling check (amount <= 10000000) not valid;
alter table public.settlements
  add constraint settlements_amount_in_home_ceiling check (amount_in_home <= 10000000) not valid;

alter table public.expense_splits
  add constraint expense_splits_share_amount_ceiling check (share_amount <= 10000000) not valid;
alter table public.expense_splits
  add constraint expense_splits_share_in_home_ceiling check (share_in_home <= 10000000) not valid;
