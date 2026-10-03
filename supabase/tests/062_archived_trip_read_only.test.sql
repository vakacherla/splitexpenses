-- Behaviour tests for migration 062 (archived trips are read-only, DEF-025).
-- Needs the scratch database from the other test scripts with the numbered
-- migrations through 055 and 062 applied. Fixture rows live in a transaction that
-- is rolled back. Prints one NOTICE per passing check and raises on the first
-- failure. Never run this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/062_archived_trip_read_only.test.sql
--
-- Cast: alice (creator of trip A, so she can still SEE it once archived), bob
-- (ordinary member of A, who cannot see it once archived: the case a naive policy
-- gets wrong), cara (outsider), adm (platform admin).
-- Trip A is archived part way through; trip B is never archived.

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('f6000000-0000-0000-0000-0000000000a1', 'alice@test.invalid'),
  ('f6000000-0000-0000-0000-0000000000a2', 'bob@test.invalid'),
  ('f6000000-0000-0000-0000-0000000000a3', 'cara@test.invalid'),
  ('f6000000-0000-0000-0000-0000000000a0', 'adm@test.invalid');
update public.profiles set is_admin = true where id = 'f6000000-0000-0000-0000-0000000000a0';

insert into public.groups (id, name, home_currency, created_by) values
  ('f6100000-0000-0000-0000-00000000000a', 'Trip A', 'USD', 'f6000000-0000-0000-0000-0000000000a1'),
  ('f6100000-0000-0000-0000-00000000000b', 'Trip B', 'USD', 'f6000000-0000-0000-0000-0000000000a1');
insert into public.group_members (group_id, user_id) values
  ('f6100000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000a1'),
  ('f6100000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000a2'),
  ('f6100000-0000-0000-0000-00000000000b', 'f6000000-0000-0000-0000-0000000000a1'),
  ('f6100000-0000-0000-0000-00000000000b', 'f6000000-0000-0000-0000-0000000000a2')
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

create or replace function pg_temp.exp(eid uuid, gid uuid, creator uuid) returns jsonb language sql as $$
  select jsonb_build_object('id', eid, 'group_id', gid, 'description', 'Lunch', 'paid_by', creator,
    'currency', 'USD', 'amount', 10, 'exchange_rate', 1, 'amount_in_home', 10, 'expense_date', '2026-10-01',
    'split_type', 'equal', 'category', 'Food', 'created_by', creator)
$$;

create or replace function pg_temp.one_split(uid uuid) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', uid, 'share_amount', 10, 'share_in_home', 10))
$$;

-- Tries a save through the atomic function; returns true when it was refused.
create or replace function pg_temp.refused(uid uuid, eid uuid, gid uuid) returns boolean language plpgsql as $$
declare failed boolean := false;
begin
  perform pg_temp.as_user(uid);
  begin
    perform public.create_expense_with_splits(pg_temp.exp(eid, gid, uid), pg_temp.one_split(uid));
  exception when others then failed := true;
  end;
  perform pg_temp.as_owner();
  return failed;
end $$;

-- 1. Before archiving everything works as it always did.
do $$
declare ne int;
begin
  if pg_temp.refused('f6000000-0000-0000-0000-0000000000a2', 'f6200000-0000-0000-0000-000000000001', 'f6100000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL 1a: a member must be able to add to a live trip';
  end if;
  if pg_temp.refused('f6000000-0000-0000-0000-0000000000a1', 'f6200000-0000-0000-0000-000000000002', 'f6100000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL 1b: the creator must be able to add to a live trip';
  end if;
  perform pg_temp.as_user('f6000000-0000-0000-0000-0000000000a2');
  insert into public.settlements (group_id, from_user, to_user, currency, amount, exchange_rate, amount_in_home, created_by)
  values ('f6100000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000a2', 'f6000000-0000-0000-0000-0000000000a1', 'USD', 5, 1, 5, 'f6000000-0000-0000-0000-0000000000a2');
  perform pg_temp.as_owner();
  ne := (select count(*) from public.expenses where group_id = 'f6100000-0000-0000-0000-00000000000a');
  if ne <> 2 then raise exception 'FAIL 1c: expected 2 expenses, got %', ne; end if;
  raise notice 'PASS 1: live trips are unaffected';
end $$;

-- Archive trip A.
update public.groups set archived_at = now() where id = 'f6100000-0000-0000-0000-00000000000a';

-- 2. The trap: an ordinary member cannot see the archived trip, and is still refused.
do $$
declare can_see int;
begin
  perform pg_temp.as_user('f6000000-0000-0000-0000-0000000000a2');
  can_see := (select count(*) from public.groups where id = 'f6100000-0000-0000-0000-00000000000a');
  perform pg_temp.as_owner();
  if can_see <> 0 then raise exception 'FAIL 2a: this test needs a member who cannot see the archived trip'; end if;
  if not pg_temp.refused('f6000000-0000-0000-0000-0000000000a2', 'f6200000-0000-0000-0000-000000000003', 'f6100000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL 2b: a member who cannot see the archived trip was still allowed to add an expense';
  end if;
  raise notice 'PASS 2: a member who cannot even see the archived trip is refused';
end $$;

-- 3. The creator can see the archived trip and is refused too; nothing is left behind.
do $$
declare ne int;
begin
  if not pg_temp.refused('f6000000-0000-0000-0000-0000000000a1', 'f6200000-0000-0000-0000-000000000004', 'f6100000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL 3a: the creator was allowed to add to an archived trip';
  end if;
  ne := (select count(*) from public.expenses where id in ('f6200000-0000-0000-0000-000000000003', 'f6200000-0000-0000-0000-000000000004'));
  if ne <> 0 then raise exception 'FAIL 3b: refused saves must leave no expense behind, found %', ne; end if;
  raise notice 'PASS 3: the creator is refused as well, and no phantom expense is left';
end $$;

-- 4. Direct inserts are refused too (not only the atomic function).
do $$
declare failed1 boolean := false; failed2 boolean := false; failed3 boolean := false;
begin
  perform pg_temp.as_user('f6000000-0000-0000-0000-0000000000a1');
  begin
    insert into public.expenses (group_id, description, paid_by, currency, amount, exchange_rate, amount_in_home, created_by)
    values ('f6100000-0000-0000-0000-00000000000a', 'Direct', 'f6000000-0000-0000-0000-0000000000a1', 'USD', 1, 1, 1, 'f6000000-0000-0000-0000-0000000000a1');
  exception when others then failed1 := true;
  end;
  begin
    insert into public.settlements (group_id, from_user, to_user, currency, amount, exchange_rate, amount_in_home, created_by)
    values ('f6100000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000a1', 'f6000000-0000-0000-0000-0000000000a2', 'USD', 1, 1, 1, 'f6000000-0000-0000-0000-0000000000a1');
  exception when others then failed2 := true;
  end;
  -- splits on an expense that already exists in the archived trip
  begin
    insert into public.expense_splits (expense_id, user_id, share_amount, share_in_home)
    select id, 'f6000000-0000-0000-0000-0000000000a2', 1, 1 from public.expenses
    where group_id = 'f6100000-0000-0000-0000-00000000000a' limit 1;
  exception when others then failed3 := true;
  end;
  perform pg_temp.as_owner();
  if not failed1 then raise exception 'FAIL 4a: direct expense insert must be refused'; end if;
  if not failed2 then raise exception 'FAIL 4b: settlement insert must be refused'; end if;
  if not failed3 then raise exception 'FAIL 4c: split insert into an archived trip must be refused'; end if;
  raise notice 'PASS 4: direct expense, settlement and split inserts are refused';
end $$;

-- 5. Re-saving an existing expense in the archived trip is refused and changes nothing.
do $$
declare failed boolean := false; amt numeric; n int;
begin
  perform pg_temp.as_user('f6000000-0000-0000-0000-0000000000a1');
  begin
    perform public.update_expense_with_splits(
      'f6200000-0000-0000-0000-000000000002',
      '{"description":"Changed","paid_by":"f6000000-0000-0000-0000-0000000000a1","currency":"USD","amount":99,"expense_date":"2026-10-01","split_type":"equal","category":"Food","note":null,"items":null,"tax":null,"tip":null}',
      pg_temp.one_split('f6000000-0000-0000-0000-0000000000a1'));
  exception when others then failed := true;
  end;
  perform pg_temp.as_owner();
  amt := (select amount from public.expenses where id = 'f6200000-0000-0000-0000-000000000002');
  n := (select count(*) from public.expense_splits where expense_id = 'f6200000-0000-0000-0000-000000000002');
  if not failed or amt <> 10 or n <> 1 then
    raise exception 'FAIL 5: edit must be refused and change nothing (failed=%, amount=%, splits=%)', failed, amt, n;
  end if;
  raise notice 'PASS 5: an existing expense cannot be re-saved while the trip is archived';
end $$;

-- 6. Soft-deleting an existing expense still works for its creator, and admins are unaffected.
do $$
declare del timestamptz;
begin
  perform pg_temp.as_user('f6000000-0000-0000-0000-0000000000a1');
  update public.expenses set deleted_at = now() where id = 'f6200000-0000-0000-0000-000000000002';
  perform pg_temp.as_owner();
  del := (select deleted_at from public.expenses where id = 'f6200000-0000-0000-0000-000000000002');
  if del is null then raise exception 'FAIL 6a: the creator should still be able to soft-delete'; end if;
  perform pg_temp.as_user('f6000000-0000-0000-0000-0000000000a0');
  update public.expenses set deleted_at = null where id = 'f6200000-0000-0000-0000-000000000002';
  perform pg_temp.as_owner();
  del := (select deleted_at from public.expenses where id = 'f6200000-0000-0000-0000-000000000002');
  if del is not null then raise exception 'FAIL 6b: an admin should still be able to restore'; end if;
  raise notice 'PASS 6: soft-delete and admin restore still work';
end $$;

-- 7. Another trip that is not archived is unaffected.
do $$
begin
  if pg_temp.refused('f6000000-0000-0000-0000-0000000000a2', 'f6200000-0000-0000-0000-000000000005', 'f6100000-0000-0000-0000-00000000000b') then
    raise exception 'FAIL 7: a live trip must still accept expenses while another is archived';
  end if;
  raise notice 'PASS 7: other trips are unaffected';
end $$;

-- 8. Restoring the trip lets the ledger take entries again.
do $$
begin
  update public.groups set archived_at = null where id = 'f6100000-0000-0000-0000-00000000000a';
  if pg_temp.refused('f6000000-0000-0000-0000-0000000000a2', 'f6200000-0000-0000-0000-000000000006', 'f6100000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL 8: a restored trip must accept expenses again';
  end if;
  raise notice 'PASS 8: restoring a trip re-opens it';
end $$;

-- 9. The helper: true/false, usable by signed-in people, not by anon.
do $$
declare failed boolean := false; a boolean; b boolean;
begin
  update public.groups set archived_at = now() where id = 'f6100000-0000-0000-0000-00000000000a';
  perform pg_temp.as_user('f6000000-0000-0000-0000-0000000000a2');
  a := public.is_group_archived('f6100000-0000-0000-0000-00000000000a');
  b := public.is_group_archived('f6100000-0000-0000-0000-00000000000b');
  perform pg_temp.as_owner();
  if a is not true or b is not false then raise exception 'FAIL 9a: helper returned % / %', a, b; end if;
  begin
    execute 'set local role anon';
    perform public.is_group_archived('f6100000-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 9b: anon must not be able to call the helper'; end if;
  raise notice 'PASS 9: helper answers true/false for members, refuses anon';
end $$;

rollback;
