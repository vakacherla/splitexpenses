-- Behaviour tests for migration 058 (live users now, REQ-USE-26).
-- Needs the scratch database from the other test scripts with migrations 049,
-- 050 and 058 applied. Fixture rows live in a transaction that is rolled back.
-- Prints one NOTICE per passing check and raises on the first failure. Never run
-- this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/058_usage_live_now.test.sql
--
-- Cast (heartbeat = user_activity.last_seen_at):
--   u1   seen 1 min ago; page_view /rates then, later, /trips/:id; app_open on an
--        installed iPhone                              -> live, newest, route /trips/:id
--   u2   seen 4 min ago, no events                     -> live, no route, no device
--   u3   seen 6 min ago                                -> NOT live (outside 5 minutes)
--   adm  platform admin seen 3 min ago                 -> only when exclusion is off
--   tst  E2E-TEST account seen 1 min ago               -> only when exclusion is off
--   u4   seen 2 min ago, but page_view is 2 days old   -> live, route null (older than 24 h)
--   plus 52 bulk users seen 2 minutes ago to check the cap of 50 people.

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('f2000000-0000-0000-0000-0000000000a0', 'adm@test.invalid'),
  ('f2000000-0000-0000-0000-0000000000a1', 'u1@test.invalid'),
  ('f2000000-0000-0000-0000-0000000000a2', 'u2@test.invalid'),
  ('f2000000-0000-0000-0000-0000000000a3', 'u3@test.invalid'),
  ('f2000000-0000-0000-0000-0000000000a4', 'tst@test.invalid'),
  ('f2000000-0000-0000-0000-0000000000a5', 'u4@test.invalid');
update public.profiles set is_admin = true where id = 'f2000000-0000-0000-0000-0000000000a0';
update public.profiles set display_name = 'E2E-TEST Tester' where id = 'f2000000-0000-0000-0000-0000000000a4';
update public.profiles set display_name = 'Una One' where id = 'f2000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Ben Two' where id = 'f2000000-0000-0000-0000-0000000000a2';

insert into public.user_activity (user_id, last_seen_at) values
  ('f2000000-0000-0000-0000-0000000000a1', now() - interval '1 minute'),
  ('f2000000-0000-0000-0000-0000000000a2', now() - interval '4 minutes'),
  ('f2000000-0000-0000-0000-0000000000a3', now() - interval '6 minutes'),
  ('f2000000-0000-0000-0000-0000000000a0', now() - interval '3 minutes'),
  ('f2000000-0000-0000-0000-0000000000a4', now() - interval '1 minute'),
  ('f2000000-0000-0000-0000-0000000000a5', now() - interval '2 minutes');

insert into public.app_events (user_id, name, props, created_at) values
  ('f2000000-0000-0000-0000-0000000000a1', 'app_open', '{"form_factor":"phone","install_mode":"pwa","os":"ios"}', now() - interval '30 minutes'),
  ('f2000000-0000-0000-0000-0000000000a1', 'page_view', '{"route":"/rates"}', now() - interval '20 minutes'),
  ('f2000000-0000-0000-0000-0000000000a1', 'page_view', '{"route":"/trips/:id"}', now() - interval '10 minutes'),
  ('f2000000-0000-0000-0000-0000000000a5', 'page_view', '{"route":"/help"}', now() - interval '2 days');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- 1. Who is live, newest first, with route and device; the 6-minute-old person is out.
do $$
declare r jsonb; names text[];
begin
  perform pg_temp.as_user('f2000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_live(true);
  perform pg_temp.as_owner();
  names := array(select x ->> 'display_name' from jsonb_array_elements(r -> 'users') x);
  if (r ->> 'count')::int <> 3 then raise exception 'FAIL 1a: count %', r ->> 'count'; end if;
  if names[1] <> 'Una One' or names[2] <> (select display_name from public.profiles where id = 'f2000000-0000-0000-0000-0000000000a5')
     or names[3] <> 'Ben Two' then
    raise exception 'FAIL 1b: order/people %', names;
  end if;
  if (r -> 'users' -> 0 ->> 'route') <> '/trips/:id' then raise exception 'FAIL 1c: newest page_view should win, got %', r -> 'users' -> 0 ->> 'route'; end if;
  if (r -> 'users' -> 0 ->> 'form_factor') <> 'phone' or (r -> 'users' -> 0 ->> 'install_mode') <> 'pwa' or (r -> 'users' -> 0 ->> 'os') <> 'ios' then
    raise exception 'FAIL 1d: device %', r -> 'users' -> 0;
  end if;
  raise notice 'PASS 1: live people, newest first, with route and device';
end $$;

-- 2. No events means no route and no device; an old page view is not shown.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f2000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_live(true);
  perform pg_temp.as_owner();
  if (r -> 'users' -> 2 ->> 'route') is not null or (r -> 'users' -> 2 ->> 'form_factor') is not null then
    raise exception 'FAIL 2a: no events should mean no route or device, got %', r -> 'users' -> 2;
  end if;
  if (r -> 'users' -> 1 ->> 'route') is not null then
    raise exception 'FAIL 2b: a 2-day-old page view must not be shown, got %', r -> 'users' -> 1 ->> 'route';
  end if;
  raise notice 'PASS 2: missing or old events give no route or device';
end $$;

-- 3. Admins and test accounts only appear when the exclusion is off.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f2000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_live(false);
  perform pg_temp.as_owner();
  if (r ->> 'count')::int <> 5 then raise exception 'FAIL 3: expected 5 with exclusion off, got %', r ->> 'count'; end if;
  raise notice 'PASS 3: exclusion off includes the admin and the test account';
end $$;

-- 4. It agrees with the Overview's "active now" number.
do $$
declare live jsonb; ov jsonb;
begin
  perform pg_temp.as_user('f2000000-0000-0000-0000-0000000000a0');
  live := public.admin_usage_live(true);
  ov := public.admin_usage_overview(30, 'UTC', true);
  perform pg_temp.as_owner();
  if (live ->> 'count')::int <> (ov ->> 'active_now')::int then
    raise exception 'FAIL 4: live count % vs overview active_now %', live ->> 'count', ov ->> 'active_now';
  end if;
  raise notice 'PASS 4: same number as the Overview active now';
end $$;

-- 5. At most 50 people are listed, but the count is the true total.
do $$
declare r jsonb;
begin
  insert into auth.users (id, email)
    select gen_random_uuid(), 'bulk' || g || '@test.invalid' from generate_series(1, 52) g;
  insert into public.user_activity (user_id, last_seen_at)
    select p.id, now() - interval '2 minutes' from public.profiles p where p.email like 'bulk%@test.invalid';
  perform pg_temp.as_user('f2000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_live(true);
  perform pg_temp.as_owner();
  if jsonb_array_length(r -> 'users') <> 50 or (r ->> 'count')::int <> 55 then
    raise exception 'FAIL 5: listed %, count %', jsonb_array_length(r -> 'users'), r ->> 'count';
  end if;
  raise notice 'PASS 5: list capped at 50, count is the true total';
end $$;

-- 6. No email anywhere in the result.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f2000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_live(false);
  perform pg_temp.as_owner();
  if r::text ~ '@' then raise exception 'FAIL 6: result must not contain an email'; end if;
  raise notice 'PASS 6: no email in the result';
end $$;

-- 7. Non-admins are refused, and anon cannot call it.
do $$
declare failed boolean := false;
begin
  perform pg_temp.as_user('f2000000-0000-0000-0000-0000000000a1');
  begin
    perform public.admin_usage_live(true);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 7a: a non-admin must be refused'; end if;

  failed := false;
  begin
    execute 'set local role anon';
    perform public.admin_usage_live(true);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 7b: anon must be refused'; end if;
  raise notice 'PASS 7: non-admins and anon are refused';
end $$;

rollback;
