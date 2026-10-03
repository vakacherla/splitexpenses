-- Behaviour tests for migration 050 (usage insights, Track B admin reports).
-- Needs the same scratch database as 049_usage_insights.test.sql, with
-- migrations 049 and 050 applied. All fixture rows are created inside a
-- transaction that is rolled back. Never run this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/050_usage_admin_reports.test.sql
--
-- Fixture (every time is UTC; d0 = today):
--   admin  platform admin, excluded from every count
--   u1     signed up d0-3, did nothing                      -> stopped at "trip"; stuck: no_trip
--   u2     joined trip T3 at d0-2, no expense               -> stopped at "expense"; stuck: trip_no_expense
--   u3     created solo trip T2, expense 30 min later       -> stopped at shared / joined / settled; stuck: never_invited
--   u4     created T3, expense 5 h later, copied the invite code, settled with u5, others joined
--   u5     joined T3 at d0-2, no expense                    -> stopped at "expense"; stuck: trip_no_expense
--   u6     test account (example.com), trip and expense     -> excluded unless asked for
--   u7     signed up d0-20, opted out, no activity          -> stuck: no_trip, quiet
--   u8     signed up two hours ago, nothing                 -> too new to be "stuck"
--   u9     signed up d0-40, JOINED T3 (so is not alone) and added an expense two days ago
--          -> must NOT be "never invited" (found 3 Oct 2026: joiners were wrongly listed)
-- Heartbeats: u4 seen 2 minutes ago, u3 seen 10 minutes ago.

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

create or replace function pg_temp.at(days int, hh int, mm int default 0) returns timestamptz language sql as $$
  select (((now() at time zone 'UTC')::date - days)::timestamp + make_interval(hours => hh, mins => mm)) at time zone 'UTC'
$$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'admin@test.invalid'),
  ('a1000000-0000-0000-0000-000000000001', 'u1@test.invalid'),
  ('a2000000-0000-0000-0000-000000000002', 'u2@test.invalid'),
  ('a3000000-0000-0000-0000-000000000003', 'u3@test.invalid'),
  ('a4000000-0000-0000-0000-000000000004', 'u4@test.invalid'),
  ('a5000000-0000-0000-0000-000000000005', 'u5@test.invalid'),
  ('a6000000-0000-0000-0000-000000000006', 'u6@example.com'),
  ('a7000000-0000-0000-0000-000000000007', 'u7@test.invalid'),
  ('a8000000-0000-0000-0000-000000000008', 'u8@test.invalid'),
  ('a9000000-0000-0000-0000-000000000009', 'u9@test.invalid');

update public.profiles set display_name = 'Admin Person', is_admin = true, created_at = pg_temp.at(30, 9) where id = 'a0000000-0000-0000-0000-000000000000';
update public.profiles set display_name = 'Una One',   created_at = pg_temp.at(3, 12) where id = 'a1000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Dev Two',   created_at = pg_temp.at(3, 12) where id = 'a2000000-0000-0000-0000-000000000002';
update public.profiles set display_name = 'Tia Three', created_at = pg_temp.at(2, 12) where id = 'a3000000-0000-0000-0000-000000000003';
update public.profiles set display_name = 'Omar Four', created_at = pg_temp.at(3, 12) where id = 'a4000000-0000-0000-0000-000000000004';
update public.profiles set display_name = 'Pia Five',  created_at = pg_temp.at(3, 12) where id = 'a5000000-0000-0000-0000-000000000005';
update public.profiles set display_name = 'Test Six',  created_at = pg_temp.at(3, 12) where id = 'a6000000-0000-0000-0000-000000000006';
update public.profiles set display_name = 'Sam Seven', created_at = pg_temp.at(20, 12), share_usage = false where id = 'a7000000-0000-0000-0000-000000000007';
update public.profiles set display_name = 'Eli Eight', created_at = now() - interval '2 hours' where id = 'a8000000-0000-0000-0000-000000000008';
update public.profiles set display_name = 'Vic Nine', created_at = pg_temp.at(40, 12) where id = 'a9000000-0000-0000-0000-000000000009';

-- u1 confirmed their email but never signed in; u7 and u8 never confirmed.
update auth.users set email_confirmed_at = now() - interval '2 days' where id = 'a1000000-0000-0000-0000-000000000001';

-- Trips
insert into public.groups (id, name, home_currency, created_by, created_at) values
  ('b2000000-0000-0000-0000-000000000002', 'T2 solo', 'USD', 'a3000000-0000-0000-0000-000000000003', pg_temp.at(2, 12, 10)),
  ('b3000000-0000-0000-0000-000000000003', 'T3 shared', 'USD', 'a4000000-0000-0000-0000-000000000004', pg_temp.at(3, 12, 10)),
  ('b6000000-0000-0000-0000-000000000006', 'T6 test', 'USD', 'a6000000-0000-0000-0000-000000000006', pg_temp.at(2, 9));
insert into public.group_members (group_id, user_id, joined_at) values
  ('b2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000003', pg_temp.at(2, 12, 10)),
  ('b3000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000004', pg_temp.at(3, 12, 10)),
  ('b3000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', pg_temp.at(2, 14)),
  ('b3000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000005', pg_temp.at(2, 15)),
  ('b3000000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-000000000009', pg_temp.at(2, 16)),
  ('b6000000-0000-0000-0000-000000000006', 'a6000000-0000-0000-0000-000000000006', pg_temp.at(2, 9));

-- Expenses
insert into public.expenses (group_id, description, paid_by, currency, amount, exchange_rate, amount_in_home, created_by, created_at) values
  ('b2000000-0000-0000-0000-000000000002', 'x', 'a3000000-0000-0000-0000-000000000003', 'USD', 10, 1, 10, 'a3000000-0000-0000-0000-000000000003', pg_temp.at(2, 12, 30)),
  ('b3000000-0000-0000-0000-000000000003', 'x', 'a4000000-0000-0000-0000-000000000004', 'USD', 10, 1, 10, 'a4000000-0000-0000-0000-000000000004', pg_temp.at(3, 17)),
  ('b3000000-0000-0000-0000-000000000003', 'x', 'a9000000-0000-0000-0000-000000000009', 'USD', 10, 1, 10, 'a9000000-0000-0000-0000-000000000009', pg_temp.at(2, 17)),
  ('b6000000-0000-0000-0000-000000000006', 'x', 'a6000000-0000-0000-0000-000000000006', 'USD', 10, 1, 10, 'a6000000-0000-0000-0000-000000000006', pg_temp.at(2, 10));

insert into public.settlements (group_id, from_user, to_user, currency, amount, exchange_rate, amount_in_home, created_by, created_at)
values ('b3000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000005', 'USD', 5, 1, 5, 'a4000000-0000-0000-0000-000000000004', pg_temp.at(1, 11));

insert into public.app_events (user_id, name, created_at) values
  ('a4000000-0000-0000-0000-000000000004', 'invite_shared', pg_temp.at(1, 10));

insert into public.user_activity (user_id, last_seen_at) values
  ('a4000000-0000-0000-0000-000000000004', now() - interval '2 minutes'),
  ('a3000000-0000-0000-0000-000000000003', now() - interval '10 minutes');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $$ begin execute 'reset role'; end $$;

-- 1. Overview numbers
do $$
declare r jsonb; today_row jsonb; d2_row jsonb;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  r := public.admin_usage_overview(30, 'UTC', true);
  perform pg_temp.as_owner();
  assert (r->>'active_now')::int = 1, format('active_now %s', r->>'active_now');
  assert (r->>'dau')::int = 2, format('dau %s', r->>'dau');
  assert (r->>'dau_prev')::int = 1, format('dau_prev %s', r->>'dau_prev');
  assert (r->>'wau')::int = 5, format('wau %s', r->>'wau');
  assert (r->>'wau_prev')::int = 0, format('wau_prev %s', r->>'wau_prev');
  assert (r->>'mau')::int = 5, format('mau %s', r->>'mau');
  assert (r->>'avg_dau_30')::numeric = 0.3, format('avg_dau_30 %s', r->>'avg_dau_30');
  assert (r->>'stickiness')::numeric = 5.3, format('stickiness %s', r->>'stickiness');
  assert (r->>'total_users')::int = 8, format('total_users %s', r->>'total_users');
  assert (r->>'opted_out')::int = 1, format('opted_out %s', r->>'opted_out');
  assert (r->>'has_tracking')::boolean, 'has_tracking';
  assert jsonb_array_length(r->'series') = 30, 'series length';
  today_row := r->'series'->29;
  assert (today_row->>'dau')::int = 2, 'series today dau';
  d2_row := r->'series'->27;
  assert (d2_row->>'dau')::int = 4 and (d2_row->>'wau')::int = 5, format('series d-2 %s', d2_row);
  raise notice 'PASS 1 overview: active now, DAU, WAU, MAU, stickiness, opted out, series';
end $$;

-- 2. Excluded accounts: admin and test accounts are left out by default and
--    counted when asked.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  r := public.admin_usage_overview(30, 'UTC', false);
  perform pg_temp.as_owner();
  assert (r->>'total_users')::int = 10, format('all users %s', r->>'total_users');
  assert (r->>'mau')::int > 5, 'mau should include the test account when asked';
  raise notice 'PASS 2 admins and test accounts excluded by default, counted on request';
end $$;

-- 3. Funnel counts and medians
do $$
declare r jsonb; st jsonb;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  r := public.admin_usage_funnel(current_date - 5, current_date, 'UTC', true);
  perform pg_temp.as_owner();
  st := r->'stages';
  assert (st->0->>'users')::int = 6, format('signed %s', st->0->>'users');
  assert (st->1->>'users')::int = 4, format('trip %s', st->1->>'users');
  assert (st->2->>'users')::int = 2, format('expense %s', st->2->>'users');
  assert (st->3->>'users')::int = 1, format('shared %s', st->3->>'users');
  assert (st->4->>'users')::int = 1, format('joined %s', st->4->>'users');
  assert (st->5->>'users')::int = 1, format('settled %s', st->5->>'users');
  assert (r->>'has_share_data')::boolean, 'has_share_data';
  assert (st->2->'basis_users')::int = 4 and st->2->>'basis' = 'trip', 'expense basis is trip';
  assert (st->3->>'basis') = 'expense' and (st->3->'basis_users')::int = 2, 'shared basis is expense';
  -- median time from signup to first trip: u2,u4,u5 joined/created after signup
  assert (st->1->>'median_seconds')::numeric >= 0, 'median trip seconds';
  raise notice 'PASS 3 funnel counts, bases and share-data flag';
end $$;

-- 4. Funnel without invite events shows "shared" as unavailable, not zero
do $$
declare r jsonb; saved int;
begin
  delete from public.app_events where name = 'invite_shared';
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  r := public.admin_usage_funnel(current_date - 5, current_date, 'UTC', true);
  perform pg_temp.as_owner();
  assert not (r->>'has_share_data')::boolean, 'has_share_data should be false';
  assert (r->'stages'->3->'users') = 'null'::jsonb, 'shared users should be null, not 0';
  insert into public.app_events (user_id, name, created_at) values ('a4000000-0000-0000-0000-000000000004', 'invite_shared', pg_temp.at(1, 10));
  raise notice 'PASS 4 shared stage is null until invite events exist';
end $$;

-- 5. Who stopped where
do $$
declare names text;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_funnel_users('trip', current_date - 5, current_date, 'UTC', true);
  assert names = 'Eli Eight,Una One', format('trip: %s', names);
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_funnel_users('expense', current_date - 5, current_date, 'UTC', true);
  assert names = 'Dev Two,Pia Five', format('expense: %s', names);
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_funnel_users('shared', current_date - 5, current_date, 'UTC', true);
  assert names = 'Tia Three', format('shared: %s', names);
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_funnel_users('joined', current_date - 5, current_date, 'UTC', true);
  assert names = 'Tia Three', format('joined: %s', names);
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_funnel_users('settled', current_date - 5, current_date, 'UTC', true);
  assert names = 'Tia Three', format('settled: %s', names);
  perform pg_temp.as_owner();
  raise notice 'PASS 5 drop-off lists name exactly the users who stopped at each stage';
end $$;

-- 6. Paging and total
do $$
declare n int; t bigint;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  select count(*), max(total) into n, t from public.admin_usage_funnel_users('trip', current_date - 5, current_date, 'UTC', true, 1, 0);
  assert n = 1 and t = 2, format('page rows=%s total=%s', n, t);
  select count(*) into n from public.admin_usage_funnel_users('trip', current_date - 5, current_date, 'UTC', true, 1, 1);
  assert n = 1, 'second page';
  select count(*) into n from public.admin_usage_funnel_users('trip', current_date - 5, current_date, 'UTC', true, 1, 2);
  assert n = 0, 'past the end';
  perform pg_temp.as_owner();
  raise notice 'PASS 6 paging and total';
end $$;

-- 7. Time to first expense
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  r := public.admin_usage_ttfe(current_date - 5, current_date, 'UTC', true);
  perform pg_temp.as_owner();
  assert (r->>'signups')::int = 6 and (r->>'converted')::int = 2, format('signups/converted %s', r);
  assert (r->'buckets'->0->>'users')::int = 1, 'under an hour';
  assert (r->'buckets'->1->>'users')::int = 1, '1 to 24 hours';
  assert (r->'buckets'->4->>'users')::int = 4, 'never';
  assert (r->>'median_seconds')::numeric = 9900, format('median %s', r->>'median_seconds');
  raise notice 'PASS 7 time to first expense: buckets, never, median';
end $$;

-- 8. Stuck segments
do $$
declare c jsonb; names text;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  c := public.admin_usage_stuck_counts(true);
  assert (c->>'no_trip')::int = 2, format('no_trip %s', c);
  assert (c->>'trip_no_expense')::int = 2, format('trip_no_expense %s', c);
  assert (c->>'never_invited')::int = 1, format('never_invited %s', c);
  assert (c->>'quiet')::int = 1, format('quiet %s', c);
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_stuck('no_trip', true);
  assert names = 'Sam Seven,Una One', format('no_trip: %s', names);
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_stuck('trip_no_expense', true);
  assert names = 'Dev Two,Pia Five', format('trip_no_expense: %s', names);
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_stuck('never_invited', true);
  assert names = 'Tia Three', format('never_invited: %s', names);
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_stuck('quiet', true);
  assert names = 'Sam Seven', format('quiet: %s', names);
  perform pg_temp.as_owner();
  raise notice 'PASS 8 stuck segments, counts and members; a user under a day old is not stuck';
end $$;

-- 9. Admins only. Everyone else is refused; helpers are not callable at all.
do $$
declare failed boolean;
begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
  failed := false;
  begin perform public.admin_usage_overview(30, 'UTC', true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'non-admin could call admin_usage_overview';
  failed := false;
  begin perform * from public.admin_usage_stuck('no_trip', true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'non-admin could call admin_usage_stuck';
  failed := false;
  begin perform * from public.admin_usage_funnel_users('trip', current_date - 5, current_date, 'UTC', true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'non-admin could call admin_usage_funnel_users';
  failed := false;
  begin perform public.admin_usage_funnel(current_date - 5, current_date, 'UTC', true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'non-admin could call admin_usage_funnel';
  failed := false;
  begin perform public.admin_usage_ttfe(current_date - 5, current_date, 'UTC', true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'non-admin could call admin_usage_ttfe';
  failed := false;
  begin perform public.admin_usage_stuck_counts(true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'non-admin could call admin_usage_stuck_counts';
  -- helpers that would leak rows if callable
  failed := false;
  begin perform * from public.usage_eligible(false); exception when insufficient_privilege then failed := true; end;
  assert failed, 'signed-in user could call usage_eligible';
  failed := false;
  begin perform * from public.usage_activity(false); exception when insufficient_privilege then failed := true; end;
  assert failed, 'signed-in user could call usage_activity';
  failed := false;
  begin perform public.usage_last_seen('a4000000-0000-0000-0000-000000000004'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'signed-in user could call usage_last_seen';
  failed := false;
  begin perform * from public.usage_funnel_rows(current_date - 5, current_date, 'UTC', false); exception when insufficient_privilege then failed := true; end;
  assert failed, 'signed-in user could call usage_funnel_rows';
  perform pg_temp.as_owner();
  raise notice 'PASS 9 non-admins refused; internal helpers not callable';
end $$;

do $$
declare failed boolean := false;
begin
  execute 'set local role anon';
  begin perform public.admin_usage_overview(30, 'UTC', true); exception when insufficient_privilege then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'anon could call admin_usage_overview';
  raise notice 'PASS 10 signed-out callers refused';
end $$;

-- 11. No email address ever appears in anything an admin gets back
do $$
declare blob text := '';
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  blob := blob || public.admin_usage_overview(30, 'UTC', false)::text
               || public.admin_usage_funnel(current_date - 5, current_date, 'UTC', false)::text
               || public.admin_usage_ttfe(current_date - 5, current_date, 'UTC', false)::text
               || public.admin_usage_stuck_counts(false)::text;
  blob := blob || (select coalesce(string_agg(t::text, ' '), '') from public.admin_usage_funnel_users('trip', current_date - 5, current_date, 'UTC', false) t);
  blob := blob || (select coalesce(string_agg(t::text, ' '), '') from public.admin_usage_stuck('quiet', false) t);
  blob := blob || (select coalesce(string_agg(t::text, ' '), '') from public.admin_usage_stuck('no_trip', false) t);
  perform pg_temp.as_owner();
  assert blob !~* '@test\.invalid|@example\.com|u[0-9]@', 'an email address leaked into admin output';
  raise notice 'PASS 11 no email address in any admin output';
end $$;

-- 12. Bad inputs and timezones
do $$
declare failed boolean := false; r jsonb;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  begin perform * from public.admin_usage_stuck('nonsense', true); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'unknown segment accepted';
  failed := false;
  begin perform * from public.admin_usage_funnel_users('nonsense', current_date - 5, current_date, 'UTC', true); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'unknown stage accepted';
  r := public.admin_usage_overview(30, 'Not/AZone', true);
  assert r->>'tz' = 'UTC', 'unknown timezone should fall back to UTC';
  r := public.admin_usage_overview(30, 'Asia/Tokyo', true);
  assert r->>'tz' = 'Asia/Tokyo', 'known timezone should be kept';
  r := public.admin_usage_overview(5, 'UTC', true);
  assert jsonb_array_length(r->'series') = 7, 'days clamped to a minimum of 7';
  r := public.admin_usage_overview(500, 'UTC', true);
  assert jsonb_array_length(r->'series') = 90, 'days clamped to a maximum of 90';
  perform pg_temp.as_owner();
  raise notice 'PASS 12 bad segment/stage rejected, timezone fallback, day clamping';
end $$;

-- 13. Never signed in (migration 053): accounts over an hour old that we have
--     never seen do anything. u1, u7 and u8 qualify; everyone else has a
--     sign-in, heartbeat or action. The yes/no email flag is returned, the
--     address is not.
do $$
declare c jsonb; names text; confirmed text;
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  c := public.admin_usage_stuck_counts(true);
  assert (c->>'never_signed_in')::int = 3, format('never_signed_in count %s', c);
  select string_agg(display_name, ',' order by display_name) into names
    from public.admin_usage_stuck('never_signed_in', true);
  assert names = 'Eli Eight,Sam Seven,Una One', format('never_signed_in: %s', names);
  select string_agg(display_name || '=' || email_confirmed::text, ',' order by display_name) into confirmed
    from public.admin_usage_stuck('never_signed_in', true);
  assert confirmed = 'Eli Eight=false,Sam Seven=false,Una One=true', format('email flags: %s', confirmed);
  -- a heartbeat takes someone out of the group
  perform pg_temp.as_owner();
  insert into public.user_activity (user_id, last_seen_at) values ('a1000000-0000-0000-0000-000000000001', now());
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  c := public.admin_usage_stuck_counts(true);
  assert (c->>'never_signed_in')::int = 2, format('after heartbeat %s', c);
  -- the old segments still work through the replaced function
  select string_agg(display_name, ',' order by display_name) into names from public.admin_usage_stuck('trip_no_expense', true);
  assert names = 'Dev Two,Pia Five', format('trip_no_expense after replace: %s', names);
  perform pg_temp.as_owner();
  raise notice 'PASS 13 never signed in: members, email flag, heartbeat removes, other segments intact';
end $$;

-- 14. (runs last: it adds 400 filler users) The reports stay fast with hundreds of users. (Found on 3 Oct 2026: a
--     per-user timezone lookup made the funnel take ~6 s at 400 users and time
--     out in production; migration 051 fixes it.) The limit is generous so the
--     check is stable on a slow machine, but far below the database's limit.
do $$
declare t0 timestamptz; secs numeric; r jsonb;
begin
  insert into auth.users (id, email) select gen_random_uuid(), 'perf' || g || '@test.invalid' from generate_series(1, 400) g;
  update public.profiles set created_at = now() - (random() * 20 || ' days')::interval where email like 'perf%';
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
  t0 := clock_timestamp();
  r := public.admin_usage_funnel(current_date - 29, current_date, 'America/New_York', true);
  perform count(*) from public.admin_usage_funnel_users('trip', current_date - 29, current_date, 'America/New_York', true);
  r := public.admin_usage_ttfe(current_date - 29, current_date, 'America/New_York', true);
  perform count(*) from public.admin_usage_stuck('quiet', true);
  secs := extract(epoch from clock_timestamp() - t0);
  perform pg_temp.as_owner();
  assert secs < 2.5, format('funnel, drop-off, time to first expense and stuck users took %s s with 400 users', round(secs, 2));
  raise notice 'PASS 14 reports stay fast with 400 users (% s)', round(secs, 2);
end $$;

rollback;
