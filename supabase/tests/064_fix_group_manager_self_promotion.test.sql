-- Behaviour tests for migration 064 (fix: a regular member could
-- self-promote to group manager through the "update own nickname" RLS
-- policy, since it never restricted which column changed and the
-- identity-guard trigger never pinned is_manager).
-- Needs the scratch database from the other test scripts with the numbered
-- migrations through 013 and 064 applied. Fixture rows live in a transaction
-- that is rolled back. Prints one NOTICE per passing check and raises on the
-- first failure. Never run this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/064_fix_group_manager_self_promotion.test.sql
--
-- Cast: alice (trip creator), bob (regular member who tries to
-- self-promote), cara (regular member, used to confirm a legitimate
-- creator-driven appointment still works and that an appointed manager's
-- own further self-edits of is_manager are still blocked).

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('c4000000-0000-0000-0000-0000000000a1', 'alice@test.invalid'),
  ('c4000000-0000-0000-0000-0000000000a2', 'bob@test.invalid'),
  ('c4000000-0000-0000-0000-0000000000a3', 'cara@test.invalid');

insert into public.groups (id, name, home_currency, created_by) values
  ('c4100000-0000-0000-0000-00000000000a', 'Fix Test Trip', 'USD', 'c4000000-0000-0000-0000-0000000000a1');
insert into public.group_members (group_id, user_id) values
  ('c4100000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a1'),
  ('c4100000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a2'),
  ('c4100000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a3');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $$ begin execute 'reset role'; end $$;

create or replace function pg_temp.is_mgr(gid uuid, uid uuid) returns boolean language sql as $$
  select is_manager from public.group_members where group_id = gid and user_id = uid
$$;

-- 1. Bob tries to self-promote by updating his own row. The update is
-- allowed through by "update own nickname" (and must not raise, or this
-- would be a regression in the ordinary nickname-update path), but
-- is_manager must come back out false.
do $$
begin
  perform pg_temp.as_user('c4000000-0000-0000-0000-0000000000a2');
  update public.group_members set is_manager = true
    where group_id = 'c4100000-0000-0000-0000-00000000000a' and user_id = 'c4000000-0000-0000-0000-0000000000a2';
  perform pg_temp.as_owner();
  if pg_temp.is_mgr('c4100000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a2') then
    raise exception 'FAIL 1: bob self-promoted to manager';
  end if;
  raise notice 'PASS 1: a member cannot flip their own is_manager flag';
end $$;

-- 2. Bob tries the same thing disguised as a nickname update in the same
-- statement -- still blocked, and the nickname change still goes through
-- (proves the trigger targets is_manager specifically, not the whole row).
do $$
declare nick text;
begin
  perform pg_temp.as_user('c4000000-0000-0000-0000-0000000000a2');
  update public.group_members set is_manager = true, nickname = 'Bobby'
    where group_id = 'c4100000-0000-0000-0000-00000000000a' and user_id = 'c4000000-0000-0000-0000-0000000000a2';
  perform pg_temp.as_owner();
  if pg_temp.is_mgr('c4100000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a2') then
    raise exception 'FAIL 2a: bob self-promoted while also changing his nickname';
  end if;
  nick := (select nickname from public.group_members
    where group_id = 'c4100000-0000-0000-0000-00000000000a' and user_id = 'c4000000-0000-0000-0000-0000000000a2');
  if nick <> 'Bobby' then raise exception 'FAIL 2b: the legitimate nickname change must still go through, got %', nick; end if;
  raise notice 'PASS 2: is_manager is blocked even alongside a legitimate nickname edit';
end $$;

-- 3. Alice (the real creator) appoints Cara as manager -- must still work.
do $$
begin
  perform pg_temp.as_user('c4000000-0000-0000-0000-0000000000a1');
  update public.group_members set is_manager = true
    where group_id = 'c4100000-0000-0000-0000-00000000000a' and user_id = 'c4000000-0000-0000-0000-0000000000a3';
  perform pg_temp.as_owner();
  if not pg_temp.is_mgr('c4100000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a3') then
    raise exception 'FAIL 3: the creator must still be able to appoint a manager';
  end if;
  raise notice 'PASS 3: the creator can still appoint a manager';
end $$;

-- 4. Cara, now an appointed manager, cannot revoke her own manager status
-- either -- appointing/revoking stays creator-only, in either direction.
do $$
begin
  perform pg_temp.as_user('c4000000-0000-0000-0000-0000000000a3');
  update public.group_members set is_manager = false
    where group_id = 'c4100000-0000-0000-0000-00000000000a' and user_id = 'c4000000-0000-0000-0000-0000000000a3';
  perform pg_temp.as_owner();
  if not pg_temp.is_mgr('c4100000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a3') then
    raise exception 'FAIL 4: a manager must not be able to un-manage themselves';
  end if;
  raise notice 'PASS 4: an appointed manager cannot self-revoke either';
end $$;

-- 5. The creator can still revoke it.
do $$
begin
  perform pg_temp.as_user('c4000000-0000-0000-0000-0000000000a1');
  update public.group_members set is_manager = false
    where group_id = 'c4100000-0000-0000-0000-00000000000a' and user_id = 'c4000000-0000-0000-0000-0000000000a3';
  perform pg_temp.as_owner();
  if pg_temp.is_mgr('c4100000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a3') then
    raise exception 'FAIL 5: the creator must still be able to revoke manager status';
  end if;
  raise notice 'PASS 5: the creator can still revoke manager status';
end $$;

rollback;
