-- Behaviour tests for migration 061 (per-user timeline, REQ-USE-12).
-- Needs the scratch database from the other test scripts with migrations 049,
-- 050 and 061 applied. Fixture rows live in a transaction that is rolled back.
-- Prints one NOTICE per passing check and raises on the first failure. Never run
-- this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/061_usage_user_timeline.test.sql
--
-- Cast: adm (platform admin), u1 (the person whose timeline we read), u2 (a trip
-- owner u1 joins), u3 (an ordinary user, to prove access is refused).
-- Times are UTC; at(d, h) = hour h of the day d days ago.
--
-- u1 events (all inside 30 days unless noted):
--   signed up 10 days ago; app_open d-3; page_view /rates d-3; feature_used
--   receipt_scan d-2; member_invited d-2; invite_shared d-2; created a trip
--   ("SECRET TRIP") d-4 with an expense ("SECRET LUNCH") d-4; joined u2's trip
--   d-1; settled up d-1; app_open 60 days ago (outside the window);
--   and app_events trip_created / expense_added / settled_up that must NOT repeat
--   what the ledger already shows.

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('f5000000-0000-0000-0000-0000000000a0', 'adm@test.invalid'),
  ('f5000000-0000-0000-0000-0000000000a1', 'u1@test.invalid'),
  ('f5000000-0000-0000-0000-0000000000a2', 'u2@test.invalid'),
  ('f5000000-0000-0000-0000-0000000000a3', 'u3@test.invalid');
update public.profiles set is_admin = true where id = 'f5000000-0000-0000-0000-0000000000a0';
update public.profiles set display_name = 'Una One', created_at = now() - interval '10 days'
  where id = 'f5000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Owen Two' where id = 'f5000000-0000-0000-0000-0000000000a2';

create or replace function pg_temp.at(d int, h numeric) returns timestamptz language sql as $$
  select (((now() at time zone 'UTC')::date - d)::timestamp + (h || ' hours')::interval) at time zone 'UTC'
$$;

create or replace function pg_temp.ev(nm text, props jsonb, d int, h numeric) returns void language sql as $$
  insert into public.app_events (user_id, name, props, created_at)
  values ('f5000000-0000-0000-0000-0000000000a1', nm, props, pg_temp.at(d, h))
$$;

select pg_temp.ev('app_open', '{"form_factor":"phone"}', 3, 9);
select pg_temp.ev('page_view', '{"route":"/rates"}', 3, 9.5);
select pg_temp.ev('feature_used', '{"feature":"receipt_scan"}', 2, 10);
select pg_temp.ev('member_invited', '{}', 2, 11);
select pg_temp.ev('invite_shared', '{}', 2, 12);
select pg_temp.ev('app_open', '{}', 60, 9);
-- already shown from the ledger, so left out of the timeline
select pg_temp.ev('trip_created', '{}', 4, 8);
select pg_temp.ev('expense_added', '{}', 4, 8.5);
select pg_temp.ev('settled_up', '{}', 1, 8);

insert into public.groups (id, name, home_currency, created_by, created_at) values
  ('f5100000-0000-0000-0000-000000000001', 'SECRET TRIP', 'USD', 'f5000000-0000-0000-0000-0000000000a1', pg_temp.at(4, 8)),
  ('f5100000-0000-0000-0000-000000000002', 'Owens trip', 'USD', 'f5000000-0000-0000-0000-0000000000a2', pg_temp.at(5, 8));
-- the creator's own membership row (made at creation) must not show as "joined"
insert into public.group_members (group_id, user_id, joined_at) values
  ('f5100000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-0000000000a1', pg_temp.at(4, 8)),
  ('f5100000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-0000000000a2', pg_temp.at(5, 8)),
  ('f5100000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-0000000000a1', pg_temp.at(1, 7))
on conflict (group_id, user_id) do update set joined_at = excluded.joined_at;
insert into public.expenses (group_id, description, paid_by, currency, amount, exchange_rate, amount_in_home, created_by, created_at)
values ('f5100000-0000-0000-0000-000000000001', 'SECRET LUNCH', 'f5000000-0000-0000-0000-0000000000a1', 'USD', 7777.77, 1, 7777.77,
        'f5000000-0000-0000-0000-0000000000a1', pg_temp.at(4, 9));
insert into public.settlements (group_id, from_user, to_user, currency, amount, exchange_rate, amount_in_home, created_by, created_at)
values ('f5100000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-0000000000a1', 'f5000000-0000-0000-0000-0000000000a2', 'USD', 4321.09, 1, 4321.09,
        'f5000000-0000-0000-0000-0000000000a1', pg_temp.at(1, 9));

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- event keys of a result, newest first
create or replace function pg_temp.keys(res jsonb) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'event' order by ord), '{}')
  from jsonb_array_elements(res -> 'events') with ordinality as t(x, ord)
$$;

-- 1. The timeline: app events and ledger actions merged, newest first, nothing twice.
do $$
declare r jsonb; k text[];
begin
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a1', 'UTC');
  perform pg_temp.as_owner();
  k := pg_temp.keys(r);
  -- newest first: settled (d-1 9h), joined (d-1 7h), invite_shared (d-2 12), member_invited (d-2 11),
  -- feature (d-2 10), page_view (d-3 9.5), app_open (d-3 9), expense (d-4 9), trip_created (d-4 8)
  -- and signed up 10 days ago last.
  if k <> array['settled_up', 'trip_joined', 'invite_shared', 'member_invited', 'feature_used:receipt_scan',
                'page_view:/rates', 'app_open', 'expense_added', 'trip_created', 'signed_up'] then
    raise exception 'FAIL 1: got %', k;
  end if;
  if (r ->> 'total')::int <> 10 then raise exception 'FAIL 1b: total %', r ->> 'total'; end if;
  raise notice 'PASS 1: merged, newest first, no duplicates';
end $$;

-- 2. The 30 day window: the 60-day-old open is left out.
do $$
declare r jsonb; n int;
begin
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a1', 'UTC');
  perform pg_temp.as_owner();
  n := (select count(*) from jsonb_array_elements(r -> 'events') x where x ->> 'event' = 'app_open');
  if n <> 1 then raise exception 'FAIL 2: only the recent app_open belongs, got %', n; end if;
  raise notice 'PASS 2: events older than 30 days are left out';
end $$;

-- 3. The creator's own membership is not "joined a trip", and a real join is.
do $$
declare r jsonb; joined int;
begin
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a1', 'UTC');
  perform pg_temp.as_owner();
  joined := (select count(*) from jsonb_array_elements(r -> 'events') x where x ->> 'event' = 'trip_joined');
  if joined <> 1 then raise exception 'FAIL 3: trip_joined should be 1 (Owen''s trip only), got %', joined; end if;
  raise notice 'PASS 3: joining someone else''s trip counts, creating your own does not';
end $$;

-- 4. No content: trip names, expense text, amounts, other people's names, email.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a1', 'UTC');
  perform pg_temp.as_owner();
  if r::text ilike '%SECRET%' or r::text like '%7777.77%' or r::text like '%4321.09%' or r::text like '%Owen%' then
    raise exception 'FAIL 4a: content leaked: %', r;
  end if;
  if r::text ~ '@' then raise exception 'FAIL 4b: result must not contain an email'; end if;
  if r::text like '%form_factor%' or r::text like '%props%' then raise exception 'FAIL 4c: raw props must not be returned'; end if;
  raise notice 'PASS 4: no trip names, expense text, amounts, other names, emails or raw props';
end $$;

-- 5. The user block carries name, avatar, sign-up and tracking status, nothing private.
do $$
declare r jsonb;
begin
  update public.profiles set share_usage = false where id = 'f5000000-0000-0000-0000-0000000000a2';
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a1', 'UTC');
  perform pg_temp.as_owner();
  if (r -> 'user' ->> 'display_name') <> 'Una One' or (r -> 'user' ->> 'share_usage')::boolean is not true then
    raise exception 'FAIL 5a: user block %', r -> 'user';
  end if;
  if (select count(*) from jsonb_object_keys(r -> 'user')) <> 6 then raise exception 'FAIL 5b: unexpected user keys %', r -> 'user'; end if;
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a2', 'UTC');
  perform pg_temp.as_owner();
  if (r -> 'user' ->> 'share_usage')::boolean is not false then raise exception 'FAIL 5c: opted-out status missing'; end if;
  raise notice 'PASS 5: user block is minimal and shows the tracking status';
end $$;

-- 6. Cap of 200 events with the true total.
do $$
declare r jsonb;
begin
  insert into public.app_events (user_id, name, props, created_at)
    select 'f5000000-0000-0000-0000-0000000000a1', 'app_open', '{}', now() - (g || ' minutes')::interval
    from generate_series(1, 250) g;
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a0');
  r := public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a1', 'UTC');
  perform pg_temp.as_owner();
  if jsonb_array_length(r -> 'events') <> 200 or (r ->> 'total')::int <> 260 then
    raise exception 'FAIL 6: listed %, total %', jsonb_array_length(r -> 'events'), r ->> 'total';
  end if;
  raise notice 'PASS 6: capped at 200 with the true total';
end $$;

-- 7. Unknown user is a clear error; non-admins and anon are refused.
do $$
declare failed boolean := false; msg text;
begin
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a0');
  begin
    perform public.admin_usage_user_timeline('00000000-0000-0000-0000-000000000bad', 'UTC');
  exception when others then failed := true; msg := sqlerrm;
  end;
  perform pg_temp.as_owner();
  if not failed or msg <> 'User not found' then raise exception 'FAIL 7a: expected "User not found", got %', msg; end if;

  failed := false;
  perform pg_temp.as_user('f5000000-0000-0000-0000-0000000000a3');
  begin
    perform public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a1', 'UTC');
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 7b: a non-admin must be refused'; end if;

  failed := false;
  begin
    execute 'set local role anon';
    perform public.admin_usage_user_timeline('f5000000-0000-0000-0000-0000000000a1', 'UTC');
  exception when insufficient_privilege then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL 7c: anon must be refused'; end if;
  raise notice 'PASS 7: unknown user is a clear error; non-admins and anon are refused';
end $$;

rollback;
