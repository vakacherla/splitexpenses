-- Same class of gap trip dates had (027/028): expenses.expense_date is
-- only ever touched via a plain supabase.from('expenses').insert()/
-- .update() — no RPC in front of it — so a client-side-only fix
-- (validateDateInRange() in src/lib/tripDates.js, now used by
-- AddExpenseForm and csvImport.js) doesn't stop a different code path
-- (or direct API access) from writing an expense dated year 1 or 9999.
--
-- Run this once in the SQL Editor of your existing project.

-- Unlike groups.start_date/end_date (nullable, so a bad value could just
-- be cleared), expense_date is `not null` — there's no safe value to
-- swap in for an existing out-of-range row without knowing what it
-- actually should be, and this migration can't inspect your data. Added
-- as NOT VALID: Postgres skips checking existing rows at ALTER TABLE
-- time (so this can't fail or need a data fix-up here), while still
-- enforcing the rule on every INSERT/UPDATE from this point forward —
-- exactly what's needed given the client-side bug is already fixed and
-- this is closing the gap for anything else that writes to this table.
--
-- If you want existing rows checked too, run this afterward once you've
-- confirmed none violate it:
--   alter table public.expenses validate constraint expenses_date_year_range;

alter table public.expenses
  add constraint expenses_date_year_range
  check (expense_date >= '2000-01-01' and expense_date <= '2100-12-31')
  not valid;
