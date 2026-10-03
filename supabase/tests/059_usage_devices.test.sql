-- Behaviour tests for migration 059 (devices and install mode, REQ-USE-23).
-- Needs the scratch database from the other test scripts with migrations 049,
-- 050 and 059 applied. Fixture rows live in a transaction that is rolled back.
-- Prints one NOTICE per passing check and raises on the first failure. Never run
-- this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/059_usage_devices.test.sql
--
-- Cast: adm (platform admin), u1..u4 (normal users), tst (E2E-TEST account).
-- Every time is UTC. at(d, h) = hour h of the day d days ago.
--
--   u1  app_open phone/pwa/ios on d-1 and d-2 (2 sessions), and
--       desktop/browser/macos on d-1 (1 session)   -> TWO devices
--   u2  phone/browser/android d-1
--   u3  tablet/pwa/ios d-1
--   u4  app_open with no device labels d-1          -> "unknown"
--   tst desktop/browser/windows d-1                 -> excluded unless asked for
--   u2  desktop/browser/linux 60 days ago           -> outside a 30 day window
--
-- Expected (30 days, exclusion on): 4 people opened the app, 6 sessions.
--   form factor  phone 2 users/3 sessions, tablet 1/1, desktop 1/1, unknown 1/1
--   install      pwa 2/3, browser 2/2, unknown 1/1
--   os           ios 2/3, android 1/1, macos 1/1, windows 0/0, linux 0/0, unknown 1/1
-- Users add up to 5 against 4 people (u1 is in two device types), as the story says.

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('f3000000-0000-0000-0000-0000000000a0', 'adm@test.invalid'),
  ('f3000000-0000-0000-0000-0000000000a1', 'u1@test.invalid'),
  ('f3000000-0000-0000-0000-0000000000a2', 'u2@test.invalid'),
  ('f3000000-0000-0000-0000-0000000000a3', 'u3@test.invalid'),
  ('f3000000-0000-0000-0000-0000000000a4', 'u4@test.invalid'),
  ('f3000000-0000-0000-0000-0000000000a5', 'tst@test.invalid');
update public.profiles set is_admin = true where id = 'f3000000-0000-0000-0000-0000000000a0';
update public.profiles set display_name = 'E2E-TEST Tester' where id = 'f3000000-0000-0000-0000-0000000000a5';

create or replace function pg_temp.at(d int, h numeric) returns timestamptz language sql as $$
  select (((now() at time zone 'UTC')::date - d)::timestamp + (h || ' hours')::interval) at time zone 'UTC'
$$;

create or replace function pg_temp.open(uid text, props jsonb, d int, h numeric) returns void language sql as $$
  insert into public.app_events (user_id, name, props, created_at)
  values (('f3000000-0000-0000-0000-0000000000' || uid)::uuid, 'app_open', props, pg_temp.at(d, h))
$$;

select pg_temp.open('a1', '{"form_factor":"phone","install_mode":"pwa","os":"ios"}', 1, 9);
select pg_temp.open('a1', '{"form_factor":"phone","install_mode":"pwa","os":"ios"}', 2, 9);
select pg_temp.open('a1', '{"form_factor":"desktop","install_mode":"browser","os":"macos"}', 1, 12);
select pg_temp.open('a2', '{"form_factor":"phone","install_mode":"browser","os":"android"}', 1, 12);
select pg_temp.open('a3', '{"form_factor":"tablet","install_mode":"pwa","os":"ios"}', 1, 12);
select pg_temp.open('a4', '{}', 1, 12);
select pg_temp.open('a5', '{"form_factor":"desktop","install_mode":"browser","os":"windows"}', 1, 12);
select pg_temp.open('a2', '{"form_factor":"desktop","install_mode":"browser","os":"linux"}', 60, 12);
-- Only app_open counts: a page view with device-like props must be ignored.
insert into public.app_events (user_id, name, props, created_at)
values ('f3000000-0000-0000-0000-0000000000a1', 'page_view', '{"route":"/rates"}', now() - interval '1 day');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- "users/sessions" of one value in one group, e.g. '2/3'; null when the value is not listed.
create or replace function pg_temp.us(res jsonb, grp text, val text) returns text language sql as $$
  select (x ->> 'users') || '/' || (x ->> 'sessions')
  from jsonb_array_elements(res -> grp) x where x ->> 'value' = val
$$;

-- 1. Users and sessions per form factor, install mode and OS.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f3000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_devices(30, 'UTC', true);
  perform pg_temp.as_owner();
  if pg_temp.us(r, 'form_factor', 'phone') <> '2/3' or pg_temp.us(r, 'form_factor', 'tablet') <> '1/1'
     or pg_temp.us(r, 'form_factor', 'desktop') <> '1/1' or pg_temp.us(r, 'form_factor', 'unknown') <> '1/1' then
    raise exception 'FAIL 1a: form factor %', r -> 'form_factor';
  end if;
  if pg_temp.us(r, 'install_mode', 'pwa') <> '2/3' or pg_temp.us(r, 'install_mode', 'browser') <> '2/2'
     or pg_temp.us(r, 'install_mode', 'unknown') <> '1/1' then
    raise exception 'FAIL 1b: install mode %', r -> 'install_mode';
  end if;
  if pg_temp.us(r, 'os', 'ios') <> '2/3' or pg_temp.us(r, 'os', 'android') <> '1/1' or pg_temp.us(r, 'os', 'macos') <> '1/1'
     or pg_temp.us(r, 'os', 'windows') <> '0/0' or pg_temp.us(r, 'os', 'linux') <> '0/0' or pg_temp.us(r, 'os', 'unknown') <> '1/1' then
    raise exception 'FAIL 1c: os %', r -> 'os';
  end if;
  raise notice 'PASS 1: users and sessions by form factor, install mode and OS';
end $$;

-- 2. A person on two devices counts once per device type, once overall.
do $$
declare r jsonb; phone int; desktop int;
begin
  perform pg_temp.as_user('f3000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_devices(30, 'UTC', true);
  perform pg_temp.as_owner();
  if (r ->> 'people_opened')::int <> 4 then raise exception 'FAIL 2a: people_opened %', r ->> 'people_opened'; end if;
  -- u1 is in both phone and desktop, so form-factor users add up to more than the 4 people.
  if (select sum((x ->> 'users')::int) from jsonb_array_elements(r -> 'form_factor') x) <> 5 then
    raise exception 'FAIL 2b: form factor users should total 5 for 4 people';
  end if;
  raise notice 'PASS 2: a two-device person counts once per device type';
end $$;

-- 3. Sessions: each group adds up to the total, and repeated opens are sessions not people.
do $$
declare r jsonb; g text;
begin
  perform pg_temp.as_user('f3000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_devices(30, 'UTC', true);
  perform pg_temp.as_owner();
  if (r ->> 'sessions')::int <> 6 then raise exception 'FAIL 3a: sessions %', r ->> 'sessions'; end if;
  foreach g in array array['form_factor', 'install_mode', 'os'] loop
    if (select sum((x ->> 'sessions')::int) from jsonb_array_elements(r -> g) x) <> 6 then
      raise exception 'FAIL 3b: % sessions do not add up to the total', g;
    end if;
  end loop;
  raise notice 'PASS 3: sessions add up to the total in every group';
end $$;

-- 4. Only app_open counts, and unknown is listed last and only when present.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f3000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_devices(30, 'UTC', true);
  perform pg_temp.as_owner();
  if (r -> 'form_factor' -> 3 ->> 'value') <> 'unknown' then raise exception 'FAIL 4a: unknown should be last'; end if;
  if (r -> 'install_mode' -> 0 ->> 'value') <> 'pwa' then raise exception 'FAIL 4b: pwa should be first'; end if;
  raise notice 'PASS 4: only app opens count, order is fixed';
end $$;

-- 5. Exclusion off adds the test account; a longer period reaches older opens.
do $$
declare off_ jsonb; r90 jsonb;
begin
  perform pg_temp.as_user('f3000000-0000-0000-0000-0000000000a0');
  off_ := public.admin_usage_devices(30, 'UTC', false);
  r90 := public.admin_usage_devices(90, 'UTC', true);
  perform pg_temp.as_owner();
  if pg_temp.us(off_, 'os', 'windows') <> '1/1' or (off_ ->> 'people_opened')::int <> 5 then
    raise exception 'FAIL 5a: exclusion off % / %', pg_temp.us(off_, 'os', 'windows'), off_ ->> 'people_opened';
  end if;
  if pg_temp.us(r90, 'os', 'linux') <> '1/1' then raise exception 'FAIL 5b: 90 days should include the old open'; end if;
  raise notice 'PASS 5: exclusion toggle and period both change the counts';
end $$;

-- 6. Pure-unknown data: nothing listed as unknown when every open has labels.
do $$
declare r jsonb;
begin
  delete from public.app_events where user_id = 'f3000000-0000-0000-0000-0000000000a4';
  perform pg_temp.as_user('f3000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_devices(30, 'UTC', true);
  perform pg_temp.as_owner();
  if pg_temp.us(r, 'form_factor', 'unknown') is not null then raise exception 'FAIL 6: unknown should not be listed'; end if;
  raise notice 'PASS 6: unknown is left out when there are none';
end $$;

-- 7. No email in the output.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f3000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_devices(30, 'UTC', false);
  perform pg_temp.as_owner();
  if r::text ~ '@' then raise exception 'FAIL 7: result must not contain an email'; end if;
  raise notice 'PASS 7: no email in the result';
end $$;

-- 8. Non-admins are refused, and anon cannot call it.
do $$
declare failed boolean := false;
begin
  perform pg_temp.as_user('f3000000-0000-0000-0000-0000000000a1');
  begin
    perform public.admin_usage_devices(30, 'UTC', true);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 8a: a non-admin must be refused'; end if;

  failed := false;
  begin
    execute 'set local role anon';
    perform public.admin_usage_devices(30, 'UTC', true);
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 8b: anon must be refused'; end if;
  raise notice 'PASS 8: non-admins and anon are refused';
end $$;

rollback;
