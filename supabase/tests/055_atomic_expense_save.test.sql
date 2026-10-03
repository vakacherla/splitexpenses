-- Behaviour tests for migration 055 (atomic expense save, DEF-026).
-- Run against a scratch database that has supabase/schema.sql and the numbered
-- migrations applied, with Supabase-style roles (anon, authenticated) and an
-- auth schema. Fixture rows live in a transaction that is rolled back. Prints
-- one NOTICE per passing check and raises on the first failure. Never run this
-- against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/055_atomic_expense_save.test.sql
--
-- Cast: Alice (trip creator, member), Bob (member, pays the second expense),
-- Cara (member, neither creator nor payer), Eve (outsider).

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@test.invalid'),
  ('a0000000-0000-0000-0000-00000000000b', 'bob@test.invalid'),
  ('a0000000-0000-0000-0000-00000000000c', 'cara@test.invalid'),
  ('a0000000-0000-0000-0000-00000000000e', 'eve@test.invalid');

insert into public.groups (id, name, home_currency, created_by)
values ('a1000000-0000-0000-0000-000000000001', 'Atomic test trip', 'USD', 'a0000000-0000-0000-0000-00000000000a');
insert into public.group_members (group_id, user_id) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c')
on conflict do nothing;

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

create or replace function pg_temp.expense_json(eid uuid, creator uuid, payer uuid, amt numeric) returns jsonb language sql as $$
  select jsonb_build_object(
    'id', eid, 'group_id', 'a1000000-0000-0000-0000-000000000001', 'description', 'Dinner',
    'paid_by', payer, 'currency', 'USD', 'amount', amt, 'exchange_rate', 1, 'amount_in_home', amt,
    'expense_date', '2026-10-01', 'split_type', 'equal', 'category', 'Food',
    'note', null, 'items', null, 'tax', null, 'tip', null, 'created_by', creator)
$$;

-- 1. A create saves the expense and every split together, and returns the row.
do $$
declare r public.expenses; n int;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  r := public.create_expense_with_splits(
    pg_temp.expense_json('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 30),
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_amount":10,"share_in_home":10},
      {"user_id":"a0000000-0000-0000-0000-00000000000b","share_amount":10,"share_in_home":10},
      {"user_id":"a0000000-0000-0000-0000-00000000000c","share_amount":10,"share_in_home":10}]');
  perform pg_temp.as_owner();
  n := (select count(*) from public.expense_splits where expense_id = r.id);
  if r.id <> 'e1000000-0000-0000-0000-000000000001' or r.amount <> 30 or n <> 3 then
    raise exception 'FAIL 1: expected one expense with 3 splits, got id=% amount=% splits=%', r.id, r.amount, n;
  end if;
  raise notice 'PASS 1: create saves the expense and all splits';
end $$;

-- 2. THE BUG: a failure while saving splits leaves no expense behind.
do $$
declare n int; failed boolean := false;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  begin
    perform public.create_expense_with_splits(
      pg_temp.expense_json('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 20),
      '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_amount":10,"share_in_home":10},
        {"user_id":"deadbeef-0000-0000-0000-000000000000","share_amount":10,"share_in_home":10}]');
  exception when others then failed := true;
  end;
  perform pg_temp.as_owner();
  n := (select count(*) from public.expenses where id = 'e1000000-0000-0000-0000-000000000002');
  if not failed or n <> 0 then
    raise exception 'FAIL 2: a bad split must roll the expense back (failed=%, expense rows=%)', failed, n;
  end if;
  raise notice 'PASS 2: a failing split leaves no phantom expense';
end $$;

-- 2b. Same for a split that breaks a check constraint (negative share).
do $$
declare n int; failed boolean := false;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  begin
    perform public.create_expense_with_splits(
      pg_temp.expense_json('e1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 20),
      '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_amount":-5,"share_in_home":-5}]');
  exception when others then failed := true;
  end;
  perform pg_temp.as_owner();
  n := (select count(*) from public.expenses where id = 'e1000000-0000-0000-0000-000000000003');
  if not failed or n <> 0 then raise exception 'FAIL 2b: negative share must roll back (failed=%, rows=%)', failed, n; end if;
  raise notice 'PASS 2b: a check-constraint failure leaves no phantom expense';
end $$;

-- 3. An expense with no splits is refused.
do $$
declare n int; failed boolean := false;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  begin
    perform public.create_expense_with_splits(
      pg_temp.expense_json('e1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 20), '[]');
  exception when others then failed := true;
  end;
  perform pg_temp.as_owner();
  n := (select count(*) from public.expenses where id = 'e1000000-0000-0000-0000-000000000004');
  if not failed or n <> 0 then raise exception 'FAIL 3: empty splits must be refused (failed=%, rows=%)', failed, n; end if;
  raise notice 'PASS 3: an expense with no splits is refused';
end $$;

-- 4. An outsider cannot add an expense to the trip, and nothing is left behind.
do $$
declare n int; failed boolean := false;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000e');
  begin
    perform public.create_expense_with_splits(
      pg_temp.expense_json('e1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-00000000000e', 20),
      '[{"user_id":"a0000000-0000-0000-0000-00000000000e","share_amount":20,"share_in_home":20}]');
  exception when others then failed := true;
  end;
  perform pg_temp.as_owner();
  n := (select count(*) from public.expenses where id = 'e1000000-0000-0000-0000-000000000005');
  if not failed or n <> 0 then raise exception 'FAIL 4: outsider create must be refused (failed=%, rows=%)', failed, n; end if;
  raise notice 'PASS 4: row level security still blocks an outsider';
end $$;

-- 5. A member cannot create an expense in someone else's name.
do $$
declare n int; failed boolean := false;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000b');
  begin
    perform public.create_expense_with_splits(
      pg_temp.expense_json('e1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000b', 20),
      '[{"user_id":"a0000000-0000-0000-0000-00000000000b","share_amount":20,"share_in_home":20}]');
  exception when others then failed := true;
  end;
  perform pg_temp.as_owner();
  n := (select count(*) from public.expenses where id = 'e1000000-0000-0000-0000-000000000006');
  if not failed or n <> 0 then raise exception 'FAIL 5: spoofed created_by must be refused (failed=%, rows=%)', failed, n; end if;
  raise notice 'PASS 5: created_by cannot be spoofed';
end $$;

-- 6. Replaying a create with the same id returns the saved expense: no duplicate,
--    no second set of splits (the offline queue retries after a lost response).
do $$
declare r public.expenses; ne int; ns int;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  r := public.create_expense_with_splits(
    pg_temp.expense_json('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 30),
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_amount":30,"share_in_home":30}]');
  perform pg_temp.as_owner();
  ne := (select count(*) from public.expenses where id = 'e1000000-0000-0000-0000-000000000001');
  ns := (select count(*) from public.expense_splits where expense_id = 'e1000000-0000-0000-0000-000000000001');
  if r.id <> 'e1000000-0000-0000-0000-000000000001' or ne <> 1 or ns <> 3 then
    raise exception 'FAIL 6: replay must change nothing (expenses=%, splits=%)', ne, ns;
  end if;
  raise notice 'PASS 6: replaying a create is harmless';
end $$;

-- 7. An edit replaces the splits and keeps the stored rate when no rate keys are sent.
do $$
declare r public.expenses; n int; before_rate numeric;
begin
  before_rate := (select exchange_rate from public.expenses where id = 'e1000000-0000-0000-0000-000000000001');
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  r := public.update_expense_with_splits(
    'e1000000-0000-0000-0000-000000000001',
    '{"description":"Dinner edited","paid_by":"a0000000-0000-0000-0000-00000000000a","currency":"USD","amount":40,"expense_date":"2026-10-01","split_type":"exact","category":"Food","note":"x","items":null,"tax":null,"tip":null}',
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_amount":25,"share_in_home":25},
      {"user_id":"a0000000-0000-0000-0000-00000000000b","share_amount":15,"share_in_home":15}]');
  perform pg_temp.as_owner();
  n := (select count(*) from public.expense_splits where expense_id = r.id);
  if r.description <> 'Dinner edited' or r.amount <> 40 or r.exchange_rate <> before_rate or n <> 2 then
    raise exception 'FAIL 7: edit result wrong (desc=%, amount=%, rate=%, splits=%)', r.description, r.amount, r.exchange_rate, n;
  end if;
  raise notice 'PASS 7: edit replaces the splits and keeps the rate';
end $$;

-- 7b. Rate keys, when sent, are applied.
do $$
declare r public.expenses;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  r := public.update_expense_with_splits(
    'e1000000-0000-0000-0000-000000000001',
    '{"description":"Dinner edited","paid_by":"a0000000-0000-0000-0000-00000000000a","currency":"EUR","amount":40,"exchange_rate":1.1,"amount_in_home":44,"expense_date":"2026-10-01","split_type":"exact","category":"Food","note":null,"items":null,"tax":null,"tip":null}',
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_amount":40,"share_in_home":44}]');
  perform pg_temp.as_owner();
  if r.exchange_rate <> 1.1 or r.amount_in_home <> 44 or r.currency <> 'EUR' then
    raise exception 'FAIL 7b: rate keys not applied (rate=%, home=%)', r.exchange_rate, r.amount_in_home;
  end if;
  raise notice 'PASS 7b: rate keys are applied when sent';
end $$;

-- 8. A failing edit changes nothing: the old fields and the old splits survive.
do $$
declare failed boolean := false; amt numeric; n int;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  begin
    perform public.update_expense_with_splits(
      'e1000000-0000-0000-0000-000000000001',
      '{"description":"Should not stick","paid_by":"a0000000-0000-0000-0000-00000000000a","currency":"EUR","amount":999,"expense_date":"2026-10-01","split_type":"exact","category":"Food","note":null,"items":null,"tax":null,"tip":null}',
      '[{"user_id":"deadbeef-0000-0000-0000-000000000000","share_amount":999,"share_in_home":999}]');
  exception when others then failed := true;
  end;
  perform pg_temp.as_owner();
  amt := (select amount from public.expenses where id = 'e1000000-0000-0000-0000-000000000001');
  n := (select count(*) from public.expense_splits where expense_id = 'e1000000-0000-0000-0000-000000000001');
  if not failed or amt <> 40 or n <> 1 then
    raise exception 'FAIL 8: failed edit must change nothing (failed=%, amount=%, splits=%)', failed, amt, n;
  end if;
  raise notice 'PASS 8: a failing edit leaves the expense and its splits untouched';
end $$;

-- 9. An outsider and a member who is neither creator, payer nor manager cannot edit.
do $$
declare failed boolean; amt numeric; n int; uid uuid;
begin
  foreach uid in array array['a0000000-0000-0000-0000-00000000000e'::uuid, 'a0000000-0000-0000-0000-00000000000c'::uuid] loop
    failed := false;
    perform pg_temp.as_user(uid);
    begin
      perform public.update_expense_with_splits(
        'e1000000-0000-0000-0000-000000000001',
        '{"description":"Hijacked","paid_by":"a0000000-0000-0000-0000-00000000000a","currency":"EUR","amount":1,"expense_date":"2026-10-01","split_type":"exact","category":"Food","note":null,"items":null,"tax":null,"tip":null}',
        '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_amount":1,"share_in_home":1}]');
    exception when others then failed := true;
    end;
    perform pg_temp.as_owner();
    amt := (select amount from public.expenses where id = 'e1000000-0000-0000-0000-000000000001');
    n := (select count(*) from public.expense_splits where expense_id = 'e1000000-0000-0000-0000-000000000001');
    if not failed or amt <> 40 or n <> 1 then
      raise exception 'FAIL 9: user % must not be able to edit (failed=%, amount=%, splits=%)', uid, failed, amt, n;
    end if;
  end loop;
  raise notice 'PASS 9: only the creator, payer or a manager can edit';
end $$;

-- 10. Editing a missing expense raises a clear error.
do $$
declare failed boolean := false; msg text;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
  begin
    perform public.update_expense_with_splits(
      'e1000000-0000-0000-0000-0000000000ff',
      '{"description":"x","paid_by":"a0000000-0000-0000-0000-00000000000a","currency":"USD","amount":1}',
      '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_amount":1,"share_in_home":1}]');
  exception when others then failed := true; msg := sqlerrm;
  end;
  perform pg_temp.as_owner();
  if not failed or msg not like 'Expense not found%' then raise exception 'FAIL 10: expected not-found error, got %', msg; end if;
  raise notice 'PASS 10: editing a missing expense raises a clear error';
end $$;

-- 11. The functions are not callable by anon.
do $$
declare failed boolean := false;
begin
  begin
    execute 'set local role anon';
    perform public.create_expense_with_splits('{}', '[]');
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 11: anon must not be able to call create_expense_with_splits'; end if;
  raise notice 'PASS 11: anon cannot call the functions';
end $$;

rollback;
