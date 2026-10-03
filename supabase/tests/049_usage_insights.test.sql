-- Behaviour tests for migration 049 (usage insights, Track A).
-- Run against a scratch database that has supabase/schema.sql, migration 026
-- and migration 049 applied, with Supabase-style roles (anon, authenticated)
-- and an auth schema. Prints one NOTICE per passing check and raises on the
-- first failure. Never run this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/049_usage_insights.test.sql

\set ON_ERROR_STOP on

-- Supabase gives signed-in users table privileges by default and relies on RLS
-- to restrict them, so mimic that: if RLS or the missing policies were wrong,
-- these grants would let the checks below see or write rows.
grant select, insert, update, delete on all tables in schema public to authenticated;

begin;

-- Fixtures: A shares usage, B switched it off, C is suspended.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.invalid'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.invalid'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.invalid');
update public.profiles set share_usage = false where id = 'bbbbbbbb-0000-0000-0000-000000000002';
update auth.users set banned_until = now() + interval '1 day' where id = 'cccccccc-0000-0000-0000-000000000003';

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- 1. Valid events are stored; unknown names, off-list keys and malformed
--    values are dropped silently.
do $$
declare stored int; n int;
begin
  perform pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
  select public.track_events($j$[
    {"name":"app_open","props":{"form_factor":"phone","install_mode":"pwa","os":"ios","browser":"safari"}},
    {"name":"bogus"},
    {"name":"page_view","props":{"route":"/trips/:id"}},
    {"name":"feature_used","props":{"feature":"receipt_scan"}},
    {"name":"expense_added","props":{"description":"secret dinner"}},
    {"name":"page_view","props":{"route":"/Trips"}},
    {"name":"app_open","props":{"os":"beos"}},
    {"name":"feature_used","props":{"feature":"not_a_feature"}}
  ]$j$::jsonb, 'sess-1') into stored;
  perform pg_temp.as_owner();
  select count(*) into n from public.app_events where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert stored = 3 and n = 3, format('expected 3 stored, got returned=%s rows=%s', stored, n);
  raise notice 'PASS 1 valid events stored, invalid dropped (3 of 8)';
end $$;

-- 2. No content can be smuggled into props.
do $$
declare bad int;
begin
  select count(*) into bad from public.app_events
   where props ?| array['description','amount','name','email','note','trip'];
  assert bad = 0, 'content keys found in props';
  raise notice 'PASS 2 no content keys stored';
end $$;

-- 3. A signed-in user cannot read or write the tables directly.
do $$
declare seen int; failed boolean := false;
begin
  perform pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
  select count(*) into seen from public.app_events;
  assert seen = 0, 'user can read app_events directly';
  begin
    insert into public.app_events (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'app_open');
  exception when others then failed := true;
  end;
  assert failed, 'user could insert into app_events directly';
  select count(*) into seen from public.user_activity;
  assert seen = 0, 'user can read user_activity directly';
  perform pg_temp.as_owner();
  raise notice 'PASS 3 direct read and write blocked';
end $$;

-- 4. Switch off: nothing recorded, no last seen.
do $$
declare stored int; n int;
begin
  perform pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
  select public.track_events('[{"name":"app_open"}]'::jsonb, 's') into stored;
  perform public.touch_last_seen();
  perform pg_temp.as_owner();
  select count(*) into n from public.user_activity where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert stored = 0 and n = 0, 'opted-out user was recorded';
  raise notice 'PASS 4 opted-out user: no events, no last seen';
end $$;

-- 5. Suspended user: nothing recorded.
do $$
declare stored int; n int;
begin
  perform pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
  select public.track_events('[{"name":"app_open"}]'::jsonb, 's') into stored;
  perform public.touch_last_seen();
  perform pg_temp.as_owner();
  select count(*) into n from public.app_events where user_id = 'cccccccc-0000-0000-0000-000000000003';
  assert stored = 0 and n = 0, 'suspended user was recorded';
  raise notice 'PASS 5 suspended user: nothing recorded';
end $$;

-- 6. Signed-out callers are refused.
do $$
declare failed boolean := false;
begin
  execute 'set local role anon';
  begin
    perform public.track_events('[{"name":"app_open"}]'::jsonb, 's');
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  assert failed, 'anon could call track_events';
  raise notice 'PASS 6 anon cannot call track_events';
end $$;

-- 7. Heartbeat: written once, then throttled for a minute, then refreshed.
do $$
declare t1 timestamptz; t2 timestamptz; t3 timestamptz;
begin
  perform pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
  perform public.touch_last_seen();
  perform pg_temp.as_owner();
  select last_seen_at into t1 from public.user_activity where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert t1 is not null, 'no last_seen row written';

  update public.user_activity set last_seen_at = now() - interval '30 seconds'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
  perform public.touch_last_seen();
  perform pg_temp.as_owner();
  select last_seen_at into t2 from public.user_activity where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert t2 < now() - interval '25 seconds', 'heartbeat was not throttled';

  update public.user_activity set last_seen_at = now() - interval '2 minutes'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
  perform public.touch_last_seen();
  perform pg_temp.as_owner();
  select last_seen_at into t3 from public.user_activity where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert t3 > now() - interval '5 seconds', 'heartbeat did not refresh after a minute';
  raise notice 'PASS 7 heartbeat written, throttled, refreshed';
end $$;

-- 8. Daily cap of 2000 events per user.
do $$
declare stored int;
begin
  insert into public.app_events (user_id, name)
  select 'aaaaaaaa-0000-0000-0000-000000000001', 'page_view' from generate_series(1, 2000);
  perform pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
  select public.track_events('[{"name":"app_open"}]'::jsonb, 's') into stored;
  perform pg_temp.as_owner();
  assert stored = 0, 'cap not enforced';
  raise notice 'PASS 8 daily cap enforced';
end $$;

-- 9. At most 25 events are taken from one call.
do $$
declare stored int;
begin
  delete from public.app_events where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
  select public.track_events((select jsonb_agg(jsonb_build_object('name','page_view')) from generate_series(1,40)), 's') into stored;
  perform pg_temp.as_owner();
  assert stored = 25, format('expected 25, got %s', stored);
  raise notice 'PASS 9 batch capped at 25';
end $$;

-- 10. Deleting the account deletes its usage data.
do $$
declare n int;
begin
  delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into n from public.app_events where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert n = 0, 'events survived account deletion';
  select count(*) into n from public.user_activity where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert n = 0, 'last_seen survived account deletion';
  raise notice 'PASS 10 account deletion cascades';
end $$;

rollback;
