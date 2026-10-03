-- Atomic expense save (DEF-026 / REQ-EXP-16, found by test RES-09).
--
-- Why: saving an expense was two or three separate requests (insert the
-- expense, delete the old splits when editing, insert the new splits). If the
-- connection dropped between them, the expense row was committed with no
-- splits, which silently corrupts every member's balance. The app tried to
-- clean up afterwards with more requests, but a dropped connection drops those
-- too.
--
-- Fix: do the whole save inside one database transaction. Both functions run
-- with the caller's own rights (not security definer), so the existing row
-- level security rules on expenses and expense_splits apply exactly as they did
-- for the separate requests. They add one rule: an expense must have at least
-- one split, so a phantom row can never be saved this way.
--
--   create_expense_with_splits(p_expense jsonb, p_splits jsonb)
--     Inserts the expense and its splits. If p_expense carries an id that already
--     exists and was created by the caller, that row is returned unchanged. That
--     makes a retry after a lost response (the offline queue replays with a fixed
--     id) harmless instead of an error or a duplicate.
--
--   update_expense_with_splits(p_expense_id uuid, p_expense jsonb, p_splits jsonb)
--     Updates the expense and replaces its splits. exchange_rate and
--     amount_in_home are only changed when the keys are present in p_expense,
--     the same as the app's "rate did not change" case.
--
-- p_splits is an array of objects with user_id, share_amount, share_in_home and
-- optionally percentage, share_units, adjustment. The app keeps computing
-- share_in_home itself so rounding does not change.
--
-- Safe to run more than once. Apply this migration before the app that calls
-- the functions is deployed; the old app keeps working either way.

create or replace function public.create_expense_with_splits(p_expense jsonb, p_splits jsonb)
returns public.expenses
language plpgsql
set search_path = public
as $$
declare
  v public.expenses;
  r public.expenses;
begin
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'An expense needs at least one split' using errcode = '22023';
  end if;

  v := jsonb_populate_record(null::public.expenses, p_expense);

  if v.id is not null then
    r := (select e from public.expenses e where e.id = v.id and e.created_by = auth.uid());
    if r.id is not null then
      return r;
    end if;
  end if;

  insert into public.expenses (
    id, group_id, description, paid_by, currency, amount, exchange_rate, amount_in_home,
    expense_date, split_type, category, note, items, tax, tip, created_by, import_batch_id
  ) values (
    coalesce(v.id, gen_random_uuid()), v.group_id, v.description, v.paid_by, v.currency, v.amount,
    v.exchange_rate, v.amount_in_home, coalesce(v.expense_date, current_date),
    coalesce(v.split_type, 'equal'), coalesce(v.category, 'Misc'), v.note, v.items, v.tax, v.tip,
    v.created_by, v.import_batch_id
  )
  returning * into r;

  insert into public.expense_splits (
    expense_id, user_id, share_amount, share_in_home, percentage, share_units, adjustment
  )
  select r.id, s.user_id, s.share_amount, s.share_in_home, s.percentage, s.share_units, s.adjustment
  from jsonb_to_recordset(p_splits) as s(
    user_id uuid, share_amount numeric, share_in_home numeric,
    percentage numeric, share_units numeric, adjustment numeric
  );

  return r;
end;
$$;

create or replace function public.update_expense_with_splits(p_expense_id uuid, p_expense jsonb, p_splits jsonb)
returns public.expenses
language plpgsql
set search_path = public
as $$
declare
  v public.expenses;
  r public.expenses;
begin
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'An expense needs at least one split' using errcode = '22023';
  end if;

  v := jsonb_populate_record(null::public.expenses, p_expense);

  update public.expenses set
    description = v.description,
    paid_by = v.paid_by,
    currency = v.currency,
    amount = v.amount,
    exchange_rate = case when p_expense ? 'exchange_rate' then v.exchange_rate else exchange_rate end,
    amount_in_home = case when p_expense ? 'amount_in_home' then v.amount_in_home else amount_in_home end,
    expense_date = coalesce(v.expense_date, expense_date),
    split_type = coalesce(v.split_type, split_type),
    category = coalesce(v.category, category),
    note = v.note,
    items = v.items,
    tax = v.tax,
    tip = v.tip
  where id = p_expense_id
  returning * into r;

  -- Row level security hides rows the caller cannot edit, so "no row" covers
  -- both a missing expense and a forbidden one.
  if r.id is null then
    raise exception 'Expense not found or you cannot edit it' using errcode = '42501';
  end if;

  delete from public.expense_splits where expense_id = p_expense_id;

  insert into public.expense_splits (
    expense_id, user_id, share_amount, share_in_home, percentage, share_units, adjustment
  )
  select p_expense_id, s.user_id, s.share_amount, s.share_in_home, s.percentage, s.share_units, s.adjustment
  from jsonb_to_recordset(p_splits) as s(
    user_id uuid, share_amount numeric, share_in_home numeric,
    percentage numeric, share_units numeric, adjustment numeric
  );

  return r;
end;
$$;

revoke all on function public.create_expense_with_splits(jsonb, jsonb) from public, anon;
revoke all on function public.update_expense_with_splits(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_expense_with_splits(jsonb, jsonb) to authenticated;
grant execute on function public.update_expense_with_splits(uuid, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
