-- Behaviour tests for migration 060 (device filter, REQ-USE-24).
-- Needs the scratch database from the other test scripts with migrations 049,
-- 050, 052, 053, 056 and 060 applied. Fixture rows live in a transaction that is
-- rolled back. Prints one NOTICE per passing check and raises on the first
-- failure. Never run this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/060_usage_device_filter.test.sql
--
-- Cast: adm (platform admin), u1..u5 (normal users, all signed up 3 days ago and
-- in no trip), tst (E2E-TEST account, excluded). Times are UTC; at(d, h) = hour h
-- of the day d days ago.
--
--   u1  app_open phone / installed app
--   u2  app_open desktop / browser
--   u3  app_open phone / browser AND desktop / browser      -> two devices
--   u4  no app_open at all                                  -> "unknown"
--   u5  app_open tablet / installed app, but 100 days ago   -> outside a 30 day window
--   everyone (but tst) used receipt_scan yesterday.
--
-- Funnel and stuck users look at all time, so u5 is a tablet there. Feature adoption
-- looks at its own 30 day period, so u5 is unknown there.

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('f4000000-0000-0000-0000-0000000000a0', 'adm@test.invalid'),
  ('f4000000-0000-0000-0000-0000000000a1', 'u1@test.invalid'),
  ('f4000000-0000-0000-0000-0000000000a2', 'u2@test.invalid'),
  ('f4000000-0000-0000-0000-0000000000a3', 'u3@test.invalid'),
  ('f4000000-0000-0000-0000-0000000000a4', 'u4@test.invalid'),
  ('f4000000-0000-0000-0000-0000000000a5', 'u5@test.invalid'),
  ('f4000000-0000-0000-0000-0000000000a6', 'tst@test.invalid');
update public.profiles set is_admin = true where id = 'f4000000-0000-0000-0000-0000000000a0';
update public.profiles set display_name = 'E2E-TEST Tester' where id = 'f4000000-0000-0000-0000-0000000000a6';
update public.profiles set created_at = now() - interval '3 days'
  where id in (select id from public.profiles where email like 'u_@test.invalid');

create or replace function pg_temp.at(d int, h numeric) returns timestamptz language sql as $$
  select (((now() at time zone 'UTC')::date - d)::timestamp + (h || ' hours')::interval) at time zone 'UTC'
$$;

create or replace function pg_temp.ev(uid text, nm text, props jsonb, d int, h numeric) returns void language sql as $$
  insert into public.app_events (user_id, name, props, created_at)
  values (('f4000000-0000-0000-0000-0000000000' || uid)::uuid, nm, props, pg_temp.at(d, h))
$$;

select pg_temp.ev('a1', 'app_open', '{"form_factor":"phone","install_mode":"pwa","os":"ios"}', 1, 9);
select pg_temp.ev('a2', 'app_open', '{"form_factor":"desktop","install_mode":"browser","os":"macos"}', 1, 9);
select pg_temp.ev('a3', 'app_open', '{"form_factor":"phone","install_mode":"browser","os":"android"}', 1, 9);
select pg_temp.ev('a3', 'app_open', '{"form_factor":"desktop","install_mode":"browser","os":"windows"}', 2, 9);
select pg_temp.ev('a5', 'app_open', '{"form_factor":"tablet","install_mode":"pwa","os":"ios"}', 100, 9);
select pg_temp.ev('a1', 'feature_used', '{"feature":"receipt_scan"}', 1, 10);
select pg_temp.ev('a2', 'feature_used', '{"feature":"receipt_scan"}', 1, 10);
select pg_temp.ev('a3', 'feature_used', '{"feature":"receipt_scan"}', 1, 10);
select pg_temp.ev('a4', 'feature_used', '{"feature":"receipt_scan"}', 1, 10);
select pg_temp.ev('a5', 'feature_used', '{"feature":"receipt_scan"}', 1, 10);
select pg_temp.ev('a6', 'feature_used', '{"feature":"receipt_scan"}', 1, 10);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- signed-up count in the funnel for a filter
create or replace function pg_temp.funnel_signups(ff text, im text) returns int language plpgsql as $$
declare r jsonb;
begin
  r := public.admin_usage_funnel(((now() at time zone 'UTC')::date - 10), (now() at time zone 'UTC')::date, 'UTC', true, ff, im);
  return (r -> 'stages' -> 0 ->> 'users')::int;
end $$;

-- people in a stuck segment for a filter
create or replace function pg_temp.stuck_count(seg text, ff text, im text) returns int language plpgsql as $$
declare r jsonb;
begin
  r := public.admin_usage_stuck_counts(true, ff, im);
  return (r ->> seg)::int;
end $$;

-- receipt_scan tried / active people for a feature adoption filter
create or replace function pg_temp.scan(ff text, im text) returns int[] language plpgsql as $$
declare r jsonb;
begin
  r := public.admin_usage_feature_adoption(30, 'UTC', true, ff, im);
  return array[
    (select (x ->> 'tried')::int from jsonb_array_elements(r -> 'features') x where x ->> 'feature' = 'receipt_scan'),
    (r ->> 'active_users')::int];
end $$;

-- 1. No filter gives the same people as before, and null/null is the same as no arguments.
do $$
declare plain jsonb; nulls jsonb;
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  if pg_temp.funnel_signups(null, null) <> 5 then raise exception 'FAIL 1a: funnel signups %', pg_temp.funnel_signups(null, null); end if;
  if pg_temp.stuck_count('no_trip', null, null) <> 5 then raise exception 'FAIL 1b: stuck no_trip %', pg_temp.stuck_count('no_trip', null, null); end if;
  plain := public.admin_usage_feature_adoption(30, 'UTC', true);
  nulls := public.admin_usage_feature_adoption(30, 'UTC', true, null, null);
  perform pg_temp.as_owner();
  if plain <> nulls then raise exception 'FAIL 1c: null filters must equal no filters'; end if;
  raise notice 'PASS 1: no filter changes nothing';
end $$;

-- 2. Funnel: device type, install mode and the two together.
do $$
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  if pg_temp.funnel_signups('phone', null) <> 2 then raise exception 'FAIL 2a: phone %', pg_temp.funnel_signups('phone', null); end if;
  if pg_temp.funnel_signups('desktop', null) <> 2 then raise exception 'FAIL 2b: desktop %', pg_temp.funnel_signups('desktop', null); end if;
  if pg_temp.funnel_signups('tablet', null) <> 1 then raise exception 'FAIL 2c: tablet (all time) %', pg_temp.funnel_signups('tablet', null); end if;
  if pg_temp.funnel_signups(null, 'pwa') <> 2 then raise exception 'FAIL 2d: pwa %', pg_temp.funnel_signups(null, 'pwa'); end if;
  if pg_temp.funnel_signups(null, 'browser') <> 2 then raise exception 'FAIL 2e: browser %', pg_temp.funnel_signups(null, 'browser'); end if;
  if pg_temp.funnel_signups('phone', 'browser') <> 1 then raise exception 'FAIL 2f: phone + browser %', pg_temp.funnel_signups('phone', 'browser'); end if;
  if pg_temp.funnel_signups('phone', 'pwa') <> 1 then raise exception 'FAIL 2g: phone + pwa %', pg_temp.funnel_signups('phone', 'pwa'); end if;
  perform pg_temp.as_owner();
  raise notice 'PASS 2: funnel filters by device type, install mode and both';
end $$;

-- 3. A person on two devices is in both groups.
do $$
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  -- u3 uses a phone and a desktop: counted in phone (2: u1, u3) and desktop (2: u2, u3).
  if pg_temp.funnel_signups('phone', null) + pg_temp.funnel_signups('desktop', null) <> 4 then
    raise exception 'FAIL 3: u3 should be in both groups';
  end if;
  perform pg_temp.as_owner();
  raise notice 'PASS 3: a two-device person appears under both';
end $$;

-- 4. "Unknown" finds people with no app open at all.
do $$
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  if pg_temp.funnel_signups('unknown', null) <> 1 or pg_temp.funnel_signups(null, 'unknown') <> 1 then
    raise exception 'FAIL 4: unknown should find u4 only';
  end if;
  perform pg_temp.as_owner();
  raise notice 'PASS 4: unknown finds people without device data';
end $$;

-- 5. Stuck users, counts and the list agree with the filter.
do $$
declare lst int;
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  if pg_temp.stuck_count('no_trip', 'phone', null) <> 2 then raise exception 'FAIL 5a: stuck phone'; end if;
  if pg_temp.stuck_count('no_trip', null, 'pwa') <> 2 then raise exception 'FAIL 5b: stuck pwa'; end if;
  if pg_temp.stuck_count('no_trip', 'unknown', null) <> 1 then raise exception 'FAIL 5c: stuck unknown'; end if;
  lst := (select total from public.admin_usage_stuck('no_trip', true, 20, 0, 'phone', null) limit 1);
  if lst <> 2 then raise exception 'FAIL 5d: stuck list total %', lst; end if;
  if (select count(*) from public.admin_usage_stuck('no_trip', true, 20, 0, 'desktop', 'browser')) <> 2 then
    raise exception 'FAIL 5e: stuck desktop + browser';
  end if;
  perform pg_temp.as_owner();
  raise notice 'PASS 5: stuck users follow the filter (counts and list)';
end $$;

-- 6. Funnel user list and time to first expense use the same people.
do $$
declare n int; t jsonb;
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  n := (select count(*) from public.admin_usage_funnel_users('trip', ((now() at time zone 'UTC')::date - 10), (now() at time zone 'UTC')::date, 'UTC', true, 20, 0, 'phone', null));
  t := public.admin_usage_ttfe(((now() at time zone 'UTC')::date - 10), (now() at time zone 'UTC')::date, 'UTC', true, 'phone', null);
  perform pg_temp.as_owner();
  if n <> 2 then raise exception 'FAIL 6a: funnel users % ', n; end if;
  if (t ->> 'signups')::int <> 2 then raise exception 'FAIL 6b: ttfe signups %', t ->> 'signups'; end if;
  raise notice 'PASS 6: funnel list and time to first expense follow the filter';
end $$;

-- 7. Feature adoption filters inside its own period; people and the active count follow.
do $$
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  if pg_temp.scan(null, null) <> array[5, 5] then raise exception 'FAIL 7a: unfiltered %', pg_temp.scan(null, null); end if;
  if pg_temp.scan('phone', null) <> array[2, 2] then raise exception 'FAIL 7b: phone %', pg_temp.scan('phone', null); end if;
  if pg_temp.scan('tablet', null) <> array[0, 0] then raise exception 'FAIL 7c: tablet (u5 tablet open is outside the period) %', pg_temp.scan('tablet', null); end if;
  if pg_temp.scan('unknown', null) <> array[2, 2] then raise exception 'FAIL 7d: unknown (u4, and u5 whose open is too old) %', pg_temp.scan('unknown', null); end if;
  if pg_temp.scan('desktop', 'browser') <> array[2, 2] then raise exception 'FAIL 7e: desktop + browser %', pg_temp.scan('desktop', 'browser'); end if;
  perform pg_temp.as_owner();
  raise notice 'PASS 7: feature adoption follows the filter within its period';
end $$;

-- 8. Unknown filter values are refused (no silent empty report).
do $$
declare bad int := 0;
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  begin perform pg_temp.funnel_signups('laptop', null); exception when others then bad := bad + 1; end;
  begin perform pg_temp.funnel_signups(null, 'app'); exception when others then bad := bad + 1; end;
  begin perform pg_temp.stuck_count('no_trip', 'watch', null); exception when others then bad := bad + 1; end;
  begin perform pg_temp.scan(null, 'native'); exception when others then bad := bad + 1; end;
  perform pg_temp.as_owner();
  if bad <> 4 then raise exception 'FAIL 8: % of 4 bad values were refused', bad; end if;
  raise notice 'PASS 8: unknown filter values are refused';
end $$;

-- 9. Admins only; no email in the output.
do $$
declare failed boolean := false; r jsonb;
begin
  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a1');
  begin
    perform public.admin_usage_feature_adoption(30, 'UTC', true, 'phone', null);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 9a: a non-admin must be refused'; end if;

  failed := false;
  begin
    execute 'set local role anon';
    perform public.admin_usage_stuck_counts(true, 'phone', null);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 9b: anon must be refused'; end if;

  perform pg_temp.as_user('f4000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_feature_adoption(30, 'UTC', true, 'phone', null);
  perform pg_temp.as_owner();
  if r::text ~ '@' then raise exception 'FAIL 9c: result must not contain an email'; end if;
  raise notice 'PASS 9: non-admins and anon refused, no email';
end $$;

rollback;
