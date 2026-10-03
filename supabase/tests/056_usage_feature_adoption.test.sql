-- Behaviour tests for migration 056 (feature adoption, REQ-USE-10).
-- Needs the scratch database from the other test scripts with migrations 049,
-- 050 and 056 applied. Fixture rows live in a transaction that is rolled back.
-- Prints one NOTICE per passing check and raises on the first failure. Never run
-- this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/056_usage_feature_adoption.test.sql
--
-- Cast: adm (platform admin, excluded by default), u1, u2, u3 (normal users),
-- tst (test account, display name starts with E2E-TEST, excluded by default).
-- Every time below is UTC. at(d, h) = hour h of the day d days ago.
--
--   u1  receipt_scan on d-2 and d-1          -> repeated
--       settled_up d-1, page_view /help d-1
--       tour at d-3 23:30 and d-2 00:30      -> two UTC days, but ONE day in Auckland
--   u2  receipt_scan twice on d-1            -> same day, not repeated
--       invite_shared d-1
--   u3  receipt_scan once d-1
--       page_view /rates on d-3 and d-2      -> repeated
--       csv_import 60 days ago               -> outside a 30 day window
--   tst receipt_scan d-1                     -> only counted when exclusion is off

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-0000000000a0', 'adm@test.invalid'),
  ('f0000000-0000-0000-0000-0000000000a1', 'u1@test.invalid'),
  ('f0000000-0000-0000-0000-0000000000a2', 'u2@test.invalid'),
  ('f0000000-0000-0000-0000-0000000000a3', 'u3@test.invalid'),
  ('f0000000-0000-0000-0000-0000000000a4', 'tst@test.invalid');
update public.profiles set is_admin = true where id = 'f0000000-0000-0000-0000-0000000000a0';
update public.profiles set display_name = 'E2E-TEST Tester' where id = 'f0000000-0000-0000-0000-0000000000a4';

create or replace function pg_temp.at(d int, h numeric) returns timestamptz language sql as $$
  select (((now() at time zone 'UTC')::date - d)::timestamp + (h || ' hours')::interval) at time zone 'UTC'
$$;

create or replace function pg_temp.ev(uid text, nm text, props jsonb, d int, h numeric) returns void language sql as $$
  insert into public.app_events (user_id, name, props, created_at)
  values (('f0000000-0000-0000-0000-0000000000' || uid)::uuid, nm, props, pg_temp.at(d, h))
$$;

select pg_temp.ev('a1', 'feature_used', '{"feature":"receipt_scan"}', 2, 12);
select pg_temp.ev('a1', 'feature_used', '{"feature":"receipt_scan"}', 1, 12);
select pg_temp.ev('a1', 'settled_up', '{}', 1, 12);
select pg_temp.ev('a1', 'page_view', '{"route":"/help"}', 1, 12);
select pg_temp.ev('a1', 'feature_used', '{"feature":"tour"}', 3, 23.5);
select pg_temp.ev('a1', 'feature_used', '{"feature":"tour"}', 2, 0.5);
select pg_temp.ev('a2', 'feature_used', '{"feature":"receipt_scan"}', 1, 12);
select pg_temp.ev('a2', 'feature_used', '{"feature":"receipt_scan"}', 1, 13);
select pg_temp.ev('a2', 'invite_shared', '{}', 1, 12);
select pg_temp.ev('a3', 'feature_used', '{"feature":"receipt_scan"}', 1, 12);
select pg_temp.ev('a3', 'page_view', '{"route":"/rates"}', 3, 12);
select pg_temp.ev('a3', 'page_view', '{"route":"/rates"}', 2, 12);
select pg_temp.ev('a3', 'feature_used', '{"feature":"csv_import"}', 60, 12);
select pg_temp.ev('a4', 'feature_used', '{"feature":"receipt_scan"}', 1, 12);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- Reads one feature out of a result: [tried, repeated].
create or replace function pg_temp.f(res jsonb, feature text) returns int[] language sql as $$
  select array[(x ->> 'tried')::int, (x ->> 'repeated')::int]
  from jsonb_array_elements(res -> 'features') x where x ->> 'feature' = feature
$$;

-- 1. Counts per feature, defaults (admins and test accounts excluded).
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f0000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_feature_adoption(30, 'UTC', true);
  perform pg_temp.as_owner();
  if pg_temp.f(r, 'receipt_scan') <> array[3, 1] then raise exception 'FAIL 1a: receipt_scan %', pg_temp.f(r, 'receipt_scan'); end if;
  if pg_temp.f(r, 'settle_up') <> array[1, 0] then raise exception 'FAIL 1b: settle_up %', pg_temp.f(r, 'settle_up'); end if;
  if pg_temp.f(r, 'invite_link') <> array[1, 0] then raise exception 'FAIL 1c: invite_link %', pg_temp.f(r, 'invite_link'); end if;
  if pg_temp.f(r, 'rates') <> array[1, 1] then raise exception 'FAIL 1d: rates %', pg_temp.f(r, 'rates'); end if;
  if pg_temp.f(r, 'help') <> array[1, 0] then raise exception 'FAIL 1e: help %', pg_temp.f(r, 'help'); end if;
  if pg_temp.f(r, 'csv_import') <> array[0, 0] then raise exception 'FAIL 1f: csv_import outside window %', pg_temp.f(r, 'csv_import'); end if;
  if (r ->> 'active_users')::int <> 3 or (r ->> 'total_users')::int <> 3 then
    raise exception 'FAIL 1g: active=% total=%', r ->> 'active_users', r ->> 'total_users';
  end if;
  raise notice 'PASS 1: counts per feature, derived events, window and exclusion';
end $$;

-- 2. Two events on the same day are one day, so not a repeat.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f0000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_feature_adoption(30, 'UTC', true);
  perform pg_temp.as_owner();
  -- receipt_scan: u1 repeated (2 days), u2 same-day twice (not), u3 once (not)
  if (pg_temp.f(r, 'receipt_scan'))[2] <> 1 then raise exception 'FAIL 2: same-day uses must not count as a repeat'; end if;
  raise notice 'PASS 2: a same-day repeat counts as one day';
end $$;

-- 3. Days are counted in the admin's timezone.
do $$
declare utc jsonb; akl jsonb;
begin
  perform pg_temp.as_user('f0000000-0000-0000-0000-0000000000a0');
  utc := public.admin_usage_feature_adoption(30, 'UTC', true);
  akl := public.admin_usage_feature_adoption(30, 'Pacific/Auckland', true);
  perform pg_temp.as_owner();
  if pg_temp.f(utc, 'tour') <> array[1, 1] then raise exception 'FAIL 3a: UTC tour %', pg_temp.f(utc, 'tour'); end if;
  if pg_temp.f(akl, 'tour') <> array[1, 0] then raise exception 'FAIL 3b: Auckland tour %', pg_temp.f(akl, 'tour'); end if;
  if akl ->> 'tz' <> 'Pacific/Auckland' then raise exception 'FAIL 3c: tz %', akl ->> 'tz'; end if;
  raise notice 'PASS 3: days follow the timezone (UTC: repeated, Auckland: one day)';
end $$;

-- 4. Turning the exclusion off includes the admin and the test account.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f0000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_feature_adoption(30, 'UTC', false);
  perform pg_temp.as_owner();
  if pg_temp.f(r, 'receipt_scan') <> array[4, 1] then raise exception 'FAIL 4a: receipt_scan %', pg_temp.f(r, 'receipt_scan'); end if;
  if (r ->> 'total_users')::int <> 5 then raise exception 'FAIL 4b: total %', r ->> 'total_users'; end if;
  raise notice 'PASS 4: exclusion off includes the test account';
end $$;

-- 5. A longer period reaches older events; the period is clamped to 7..90 days.
do $$
declare r90 jsonb; r1 jsonb; r500 jsonb;
begin
  perform pg_temp.as_user('f0000000-0000-0000-0000-0000000000a0');
  r90 := public.admin_usage_feature_adoption(90, 'UTC', true);
  r1 := public.admin_usage_feature_adoption(1, 'UTC', true);
  r500 := public.admin_usage_feature_adoption(500, 'UTC', true);
  perform pg_temp.as_owner();
  if pg_temp.f(r90, 'csv_import') <> array[1, 0] then raise exception 'FAIL 5a: 90 days should include csv_import'; end if;
  if (r1 ->> 'days')::int <> 7 or (r500 ->> 'days')::int <> 90 then raise exception 'FAIL 5b: clamp % %', r1 ->> 'days', r500 ->> 'days'; end if;
  raise notice 'PASS 5: period reaches older events and is clamped';
end $$;

-- 6. Every feature is listed in a fixed order, and no email appears anywhere.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f0000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_feature_adoption(30, 'UTC', true);
  perform pg_temp.as_owner();
  if jsonb_array_length(r -> 'features') <> 15 or r -> 'features' -> 0 ->> 'feature' <> 'receipt_scan'
     or r -> 'features' -> 14 ->> 'feature' <> 'tour' then
    raise exception 'FAIL 6a: feature list wrong';
  end if;
  if r::text ~ '@' then raise exception 'FAIL 6b: result must not contain an email'; end if;
  raise notice 'PASS 6: all 15 features in order, no email in the result';
end $$;

-- 7. Non-admins are refused, and anon cannot call it.
do $$
declare failed boolean := false;
begin
  perform pg_temp.as_user('f0000000-0000-0000-0000-0000000000a1');
  begin
    perform public.admin_usage_feature_adoption(30, 'UTC', true);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 7a: a non-admin must be refused'; end if;

  failed := false;
  begin
    execute 'set local role anon';
    perform public.admin_usage_feature_adoption(30, 'UTC', true);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 7b: anon must be refused'; end if;
  raise notice 'PASS 7: non-admins and anon are refused';
end $$;

rollback;
