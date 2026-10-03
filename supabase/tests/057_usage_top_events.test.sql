-- Behaviour tests for migration 057 (top events this week, REQ-USE-11).
-- Needs the scratch database from the other test scripts with migrations 049,
-- 050 and 057 applied. Fixture rows live in a transaction that is rolled back.
-- Prints one NOTICE per passing check and raises on the first failure. Never run
-- this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/057_usage_top_events.test.sql
--
-- Cast: adm (platform admin), u1, u2, u3 (normal users), tst (E2E-TEST account).
-- Every time is UTC. at(d, h) = hour h of the day d days ago. The window is the
-- 7 days ending today, so d = 1..5 is inside it and d = 7, 8 is outside.
--
--   app_open               u1 (twice, two days), u2, u3        -> 3 people
--   page_view /rates       u1, u2                              -> 2
--   feature_used receipt   u1, u2 (and tst, excluded)          -> 2
--   one person each        expense_added (u1), invite_shared (u1), member_invited (u2),
--                          page_view /dashboard (u1), page_view /help (u3),
--                          settled_up (u3), trip_created (u2)  -> 7 events, 1 person
--   outside the window     feature_used tour (u2) 7 days ago, app_open (u3) 8 days ago
--
-- 10 distinct events in all, so the top 8 cuts the last two of the one-person
-- group (alphabetically: settled_up, trip_created).

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-0000000000a0', 'adm@test.invalid'),
  ('f1000000-0000-0000-0000-0000000000a1', 'u1@test.invalid'),
  ('f1000000-0000-0000-0000-0000000000a2', 'u2@test.invalid'),
  ('f1000000-0000-0000-0000-0000000000a3', 'u3@test.invalid'),
  ('f1000000-0000-0000-0000-0000000000a4', 'tst@test.invalid');
update public.profiles set is_admin = true where id = 'f1000000-0000-0000-0000-0000000000a0';
update public.profiles set display_name = 'E2E-TEST Tester' where id = 'f1000000-0000-0000-0000-0000000000a4';

create or replace function pg_temp.at(d int, h numeric) returns timestamptz language sql as $$
  select (((now() at time zone 'UTC')::date - d)::timestamp + (h || ' hours')::interval) at time zone 'UTC'
$$;

create or replace function pg_temp.ev(uid text, nm text, props jsonb, d int, h numeric) returns void language sql as $$
  insert into public.app_events (user_id, name, props, created_at)
  values (('f1000000-0000-0000-0000-0000000000' || uid)::uuid, nm, props, pg_temp.at(d, h))
$$;

select pg_temp.ev('a1', 'app_open', '{}', 1, 12);
select pg_temp.ev('a1', 'app_open', '{}', 2, 12);
select pg_temp.ev('a1', 'app_open', '{}', 2, 13);
select pg_temp.ev('a2', 'app_open', '{}', 1, 12);
select pg_temp.ev('a3', 'app_open', '{}', 1, 12);
select pg_temp.ev('a1', 'page_view', '{"route":"/rates"}', 1, 12);
select pg_temp.ev('a2', 'page_view', '{"route":"/rates"}', 1, 12);
select pg_temp.ev('a1', 'feature_used', '{"feature":"receipt_scan"}', 1, 12);
select pg_temp.ev('a2', 'feature_used', '{"feature":"receipt_scan"}', 1, 12);
select pg_temp.ev('a4', 'feature_used', '{"feature":"receipt_scan"}', 1, 12);
select pg_temp.ev('a1', 'expense_added', '{"split_type":"equal"}', 1, 12);
select pg_temp.ev('a1', 'invite_shared', '{}', 1, 12);
select pg_temp.ev('a2', 'member_invited', '{}', 1, 12);
select pg_temp.ev('a1', 'page_view', '{"route":"/dashboard"}', 1, 12);
select pg_temp.ev('a3', 'page_view', '{"route":"/help"}', 1, 12);
select pg_temp.ev('a3', 'settled_up', '{}', 1, 12);
select pg_temp.ev('a2', 'trip_created', '{}', 1, 12);
select pg_temp.ev('a2', 'feature_used', '{"feature":"tour"}', 7, 12);
select pg_temp.ev('a3', 'app_open', '{}', 8, 12);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- "event=users" pairs in order, e.g. {app_open=3,...}.
create or replace function pg_temp.pairs(res jsonb) returns text[] language sql as $$
  select coalesce(array_agg((x ->> 'event') || '=' || (x ->> 'users') order by ord), '{}')
  from jsonb_array_elements(res -> 'events') with ordinality as t(x, ord)
$$;

-- 1. Distinct people, top 8, ordered by people then name; old events left out.
do $$
declare r jsonb; got text[];
begin
  perform pg_temp.as_user('f1000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_top_events('UTC', true);
  perform pg_temp.as_owner();
  got := pg_temp.pairs(r);
  if got <> array['app_open=3', 'feature_used:receipt_scan=2', 'page_view:/rates=2',
                  'expense_added=1', 'invite_shared=1', 'member_invited=1',
                  'page_view:/dashboard=1', 'page_view:/help=1'] then
    raise exception 'FAIL 1: got %', got;
  end if;
  raise notice 'PASS 1: distinct people, top 8, stable order, window respected';
end $$;

-- 2. Someone opening the app on several days and several times is one person.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f1000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_top_events('UTC', true);
  perform pg_temp.as_owner();
  if (r -> 'events' -> 0 ->> 'event') <> 'app_open' or (r -> 'events' -> 0 ->> 'users')::int <> 3 then
    raise exception 'FAIL 2: app_open should be 3 people, got %', r -> 'events' -> 0;
  end if;
  raise notice 'PASS 2: repeated opens count a person once';
end $$;

-- 3. Events outside the 7 days (the tour 7 days ago, the open 8 days ago) never appear.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f1000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_top_events('UTC', true);
  perform pg_temp.as_owner();
  if r::text like '%feature_used:tour%' then raise exception 'FAIL 3: an event outside the window appeared'; end if;
  if (r ->> 'from')::date <> (now() at time zone 'UTC')::date - 6 then raise exception 'FAIL 3b: window start %', r ->> 'from'; end if;
  raise notice 'PASS 3: the window is the last 7 days';
end $$;

-- 4. Exclusion: the test account only counts when asked for.
do $$
declare on_ text[]; off_ text[];
begin
  perform pg_temp.as_user('f1000000-0000-0000-0000-0000000000a0');
  on_ := pg_temp.pairs(public.admin_usage_top_events('UTC', true));
  off_ := pg_temp.pairs(public.admin_usage_top_events('UTC', false));
  perform pg_temp.as_owner();
  if not ('feature_used:receipt_scan=2' = any(on_)) then raise exception 'FAIL 4a: %', on_; end if;
  if not ('feature_used:receipt_scan=3' = any(off_)) then raise exception 'FAIL 4b: %', off_; end if;
  raise notice 'PASS 4: the test account is excluded unless asked for';
end $$;

-- 5. Active people use the Overview definition; no email in the output.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f1000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_top_events('UTC', true);
  perform pg_temp.as_owner();
  if (r ->> 'active_users')::int <> 3 then raise exception 'FAIL 5a: active %', r ->> 'active_users'; end if;
  if r::text ~ '@' then raise exception 'FAIL 5b: result must not contain an email'; end if;
  raise notice 'PASS 5: active people counted, no email';
end $$;

-- 6. Non-admins are refused, and anon cannot call it.
do $$
declare failed boolean := false;
begin
  perform pg_temp.as_user('f1000000-0000-0000-0000-0000000000a1');
  begin
    perform public.admin_usage_top_events('UTC', true);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 6a: a non-admin must be refused'; end if;

  failed := false;
  begin
    execute 'set local role anon';
    perform public.admin_usage_top_events('UTC', true);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 6b: anon must be refused'; end if;
  raise notice 'PASS 6: non-admins and anon are refused';
end $$;

rollback;
