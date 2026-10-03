-- Usage insights, Track B (REQ-USE-05..09): admin-only report functions.
--
-- Every admin_usage_* function:
--   - starts by refusing anyone who is not a platform admin;
--   - is SECURITY DEFINER with a fixed search_path;
--   - returns aggregates, or display names and avatar paths for lists, and
--     NEVER an email address;
--   - takes the admin's timezone (falling back to UTC), so "today" matches the
--     admin's clock, and a flag that leaves out admins and test accounts.
--
-- The usage_* helpers underneath are not callable by signed-in users at all
-- (execute is revoked), only by the admin_usage_* functions that wrap them.
--
-- Until app_events has data (REQ-USE-03 rolling out), "active" comes from what
-- we already hold: writes (expenses, settlements, trips, joining a trip, the
-- activity feed), the last-seen heartbeat and the latest sign-in. Once events
-- flow they are included automatically.
--
-- Test accounts: an email at example.com (used by QA accounts, see migration
-- 048) or a display name starting "E2E-TEST".

-- ---------------------------------------------------------------------------
-- Guards and small helpers
-- ---------------------------------------------------------------------------

create or replace function public.usage_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
end;
$$;

-- A timezone name the database knows, else UTC.
create or replace function public.usage_tz(p_tz text)
returns text
language sql
stable
as $$
  select coalesce(
    (select name from pg_timezone_names where name = p_tz limit 1),
    'UTC'
  );
$$;

-- Users who count: everyone, or (default) everyone except admins and test
-- accounts.
create or replace function public.usage_eligible(p_exclude boolean)
returns table (id uuid, display_name text, avatar_path text, created_at timestamptz, share_usage boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_path, p.created_at, p.share_usage
  from public.profiles p
  where not coalesce(p_exclude, true)
     or (not p.is_admin
         and p.email not ilike '%@example.com'
         and p.display_name not ilike 'E2E-TEST%');
$$;

-- Every timestamp at which an eligible user did something we can see.
create or replace function public.usage_activity(p_exclude boolean)
returns table (user_id uuid, ts timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with e as (select id from public.usage_eligible(p_exclude)),
  raw as (
    select user_id, created_at as ts from public.app_events
    union all select created_by, created_at from public.expenses
    union all select created_by, created_at from public.settlements
    union all select created_by, created_at from public.groups
    union all select user_id, joined_at from public.group_members
    union all select actor_id, created_at from public.activity_events where actor_id is not null
    union all select user_id, last_seen_at from public.user_activity
    union all select id, last_sign_in_at from auth.users where last_sign_in_at is not null
  )
  select raw.user_id, raw.ts from raw join e on e.id = raw.user_id where raw.ts is not null;
$$;

-- Latest time we saw this user do anything.
create or replace function public.usage_last_seen(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    (select last_seen_at from public.user_activity where user_id = p_user),
    (select last_sign_in_at from auth.users where id = p_user),
    (select max(created_at) from public.app_events where user_id = p_user),
    (select max(created_at) from public.expenses where created_by = p_user),
    (select max(created_at) from public.settlements where created_by = p_user),
    (select max(created_at) from public.groups where created_by = p_user),
    (select max(joined_at) from public.group_members where user_id = p_user),
    (select max(created_at) from public.activity_events where actor_id = p_user)
  );
$$;

-- One row per eligible user who signed up in [p_from, p_to] (in the admin's
-- timezone), with the first time they reached each funnel step.
--   t_trip    first time they created or joined a trip
--   t_exp     first expense they added
--   t_shared  first time they copied a trip or circle invite code (app_events)
--   t_joined  first time someone else joined a trip they created
--   t_settled first settlement they recorded or were part of
create or replace function public.usage_funnel_rows(p_from date, p_to date, p_tz text, p_exclude boolean)
returns table (
  id uuid, display_name text, avatar_path text, created_at timestamptz,
  t_trip timestamptz, t_exp timestamptz, t_shared timestamptz, t_joined timestamptz, t_settled timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.display_name, c.avatar_path, c.created_at,
    (select min(t) from (
        select joined_at as t from public.group_members where user_id = c.id
        union all select created_at from public.groups where created_by = c.id) x),
    (select min(created_at) from public.expenses where created_by = c.id),
    (select min(created_at) from public.app_events where user_id = c.id and name = 'invite_shared'),
    (select min(gm.joined_at)
       from public.groups g
       join public.group_members gm on gm.group_id = g.id
      where g.created_by = c.id and gm.user_id <> c.id),
    (select min(created_at) from public.settlements
      where created_by = c.id or from_user = c.id or to_user = c.id)
  from public.usage_eligible(p_exclude) c
  where (c.created_at at time zone public.usage_tz(p_tz))::date between p_from and p_to;
$$;

revoke all on function public.usage_guard() from public, anon, authenticated;
revoke all on function public.usage_tz(text) from public, anon, authenticated;
revoke all on function public.usage_eligible(boolean) from public, anon, authenticated;
revoke all on function public.usage_activity(boolean) from public, anon, authenticated;
revoke all on function public.usage_last_seen(uuid) from public, anon, authenticated;
revoke all on function public.usage_funnel_rows(date, date, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- REQ-USE-06: Overview
-- ---------------------------------------------------------------------------

create or replace function public.admin_usage_overview(
  p_days integer default 30,
  p_tz text default 'UTC',
  p_exclude boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz text;
  today date;
  n integer;
  lookback integer;
  res jsonb;
begin
  perform public.usage_guard();
  tz := public.usage_tz(p_tz);
  n := least(greatest(coalesce(p_days, 30), 7), 90);
  today := (now() at time zone tz)::date;
  lookback := greatest(n + 6, 59);

  -- Written as plain assignments on purpose: the Supabase SQL editor misreads
  -- the older assignment form inside function bodies and mangles the script.
  res := (with ud as (
    select distinct a.user_id, (a.ts at time zone tz)::date as d
    from public.usage_activity(p_exclude) a
    where a.ts >= ((today - lookback)::timestamp at time zone tz)
  ),
  series as (
    select g.d,
      (select count(*) from ud where ud.d = g.d) as dau,
      (select count(distinct ud.user_id) from ud where ud.d between g.d - 6 and g.d) as wau
    from (select generate_series(today - (n - 1), today, interval '1 day')::date as d) g
  )
  select jsonb_build_object(
    'tz', tz,
    'today', today,
    'active_now', (
      select count(*) from public.user_activity ua
      join public.usage_eligible(p_exclude) e on e.id = ua.user_id
      where ua.last_seen_at > now() - interval '5 minutes'),
    'dau', (select count(*) from ud where d = today),
    'dau_prev', (select count(*) from ud where d = today - 1),
    'wau', (select count(distinct user_id) from ud where d between today - 6 and today),
    'wau_prev', (select count(distinct user_id) from ud where d between today - 13 and today - 7),
    'mau', (select count(distinct user_id) from ud where d between today - 29 and today),
    'mau_prev', (select count(distinct user_id) from ud where d between today - 59 and today - 30),
    'avg_dau_30', (select round(count(*)::numeric / 30, 1) from ud where d between today - 29 and today),
    'stickiness', (
      select case when count(distinct user_id) = 0 then null
        else round(100 * (select count(*)::numeric / 30 from ud where d between today - 29 and today)
                   / count(distinct user_id), 1) end
      from ud where d between today - 29 and today),
    'total_users', (select count(*) from public.usage_eligible(p_exclude)),
    'opted_out', (select count(*) from public.usage_eligible(p_exclude) where not share_usage),
    'has_tracking', exists (select 1 from public.app_events),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'dau', dau, 'wau', wau) order by d), '[]'::jsonb) from series)
  ));

  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- REQ-USE-07: Activation funnel
-- ---------------------------------------------------------------------------
-- Stages 1 to 3 are sequential. Stages 4 to 6 are measured among users who
-- added an expense (they can happen in any order, and someone can join a trip
-- through a code shared outside the app), so they are not chained to each other.

create or replace function public.admin_usage_funnel(
  p_from date,
  p_to date,
  p_tz text default 'UTC',
  p_exclude boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  res jsonb;
begin
  perform public.usage_guard();

  res := (with f as (select * from public.usage_funnel_rows(p_from, p_to, p_tz, p_exclude)),
  c as (
    select
      count(*) as signed,
      count(*) filter (where t_trip is not null) as trip,
      count(*) filter (where t_trip is not null and t_exp is not null) as expense,
      count(*) filter (where t_trip is not null and t_exp is not null and t_shared is not null) as shared,
      count(*) filter (where t_trip is not null and t_exp is not null and t_joined is not null) as joined,
      count(*) filter (where t_trip is not null and t_exp is not null and t_settled is not null) as settled,
      percentile_cont(0.5) within group (order by greatest(0, extract(epoch from t_trip - created_at)))
        filter (where t_trip is not null) as m_trip,
      percentile_cont(0.5) within group (order by greatest(0, extract(epoch from t_exp - t_trip)))
        filter (where t_trip is not null and t_exp is not null) as m_exp,
      percentile_cont(0.5) within group (order by greatest(0, extract(epoch from t_shared - t_exp)))
        filter (where t_trip is not null and t_exp is not null and t_shared is not null) as m_shared,
      percentile_cont(0.5) within group (order by greatest(0, extract(epoch from t_joined - t_exp)))
        filter (where t_trip is not null and t_exp is not null and t_joined is not null) as m_joined,
      percentile_cont(0.5) within group (order by greatest(0, extract(epoch from t_settled - t_exp)))
        filter (where t_trip is not null and t_exp is not null and t_settled is not null) as m_settled
    from f
  ),
  share_data as (select exists (select 1 from public.app_events where name = 'invite_shared') as has)
  select jsonb_build_object(
    'has_share_data', (select has from share_data),
    'stages', jsonb_build_array(
      jsonb_build_object('key', 'signed_up', 'label', 'Signed up', 'users', c.signed, 'basis', null, 'median_seconds', null),
      jsonb_build_object('key', 'trip', 'label', 'Created or joined a trip', 'users', c.trip, 'basis', 'signed_up', 'basis_users', c.signed, 'median_seconds', c.m_trip),
      jsonb_build_object('key', 'expense', 'label', 'Added an expense', 'users', c.expense, 'basis', 'trip', 'basis_users', c.trip, 'median_seconds', c.m_exp),
      jsonb_build_object('key', 'shared', 'label', 'Shared an invite', 'users', case when (select has from share_data) then c.shared end, 'basis', 'expense', 'basis_users', c.expense, 'median_seconds', c.m_shared),
      jsonb_build_object('key', 'joined', 'label', 'Someone joined their trip', 'users', c.joined, 'basis', 'expense', 'basis_users', c.expense, 'median_seconds', c.m_joined),
      jsonb_build_object('key', 'settled', 'label', 'Settled up', 'users', c.settled, 'basis', 'expense', 'basis_users', c.expense, 'median_seconds', c.m_settled)
    )
  )
  from c);

  return res;
end;
$$;

-- Who stopped at a stage: reached the stage before it (its basis), did not
-- reach this one. p_stage is the stage they did NOT reach:
-- trip, expense, shared, joined or settled.
create or replace function public.admin_usage_funnel_users(
  p_stage text,
  p_from date,
  p_to date,
  p_tz text default 'UTC',
  p_exclude boolean default true,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  user_id uuid, display_name text, avatar_path text,
  signed_up_at timestamptz, last_seen_at timestamptz, total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.usage_guard();
  if p_stage not in ('trip', 'expense', 'shared', 'joined', 'settled') then
    raise exception 'Unknown stage %', p_stage using errcode = '22023';
  end if;

  return query
  select f.id, f.display_name, f.avatar_path, f.created_at,
         public.usage_last_seen(f.id),
         count(*) over ()
  from public.usage_funnel_rows(p_from, p_to, p_tz, p_exclude) f
  where case p_stage
    when 'trip' then f.t_trip is null
    when 'expense' then f.t_trip is not null and f.t_exp is null
    when 'shared' then f.t_trip is not null and f.t_exp is not null and f.t_shared is null
    when 'joined' then f.t_trip is not null and f.t_exp is not null and f.t_joined is null
    when 'settled' then f.t_trip is not null and f.t_exp is not null and f.t_settled is null
  end
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- REQ-USE-08: Time to first expense
-- ---------------------------------------------------------------------------

create or replace function public.admin_usage_ttfe(
  p_from date,
  p_to date,
  p_tz text default 'UTC',
  p_exclude boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  res jsonb;
begin
  perform public.usage_guard();

  res := (with f as (
    select extract(epoch from (t_exp - created_at)) as secs
    from public.usage_funnel_rows(p_from, p_to, p_tz, p_exclude)
  ),
  s as (
    select
      count(*) as signups,
      count(secs) as converted,
      percentile_cont(0.5) within group (order by greatest(secs, 0)) filter (where secs is not null) as median_s,
      percentile_cont(0.9) within group (order by greatest(secs, 0)) filter (where secs is not null) as p90_s,
      count(*) filter (where secs is not null and secs < 3600) as b_hour,
      count(*) filter (where secs >= 3600 and secs < 86400) as b_day,
      count(*) filter (where secs >= 86400 and secs < 259200) as b_3days,
      count(*) filter (where secs >= 259200) as b_more,
      count(*) filter (where secs is null) as b_never
    from f
  )
  select jsonb_build_object(
    'signups', signups,
    'converted', converted,
    'median_seconds', median_s,
    'p90_seconds', p90_s,
    'buckets', jsonb_build_array(
      jsonb_build_object('key', 'hour', 'label', 'Under 1 hour', 'users', b_hour),
      jsonb_build_object('key', 'day', 'label', '1 to 24 hours', 'users', b_day),
      jsonb_build_object('key', '3days', 'label', '1 to 3 days', 'users', b_3days),
      jsonb_build_object('key', 'more', 'label', 'Over 3 days', 'users', b_more),
      jsonb_build_object('key', 'never', 'label', 'Never', 'users', b_never)
    )
  )
  from s);

  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- REQ-USE-09: Stuck users
-- ---------------------------------------------------------------------------
-- Segments (a user can be in more than one):
--   no_trip           signed up over a day ago, never created or joined a trip
--   trip_no_expense   in a trip, never added an expense
--   never_invited     added expenses, but nobody else is in any trip they
--                     created and they never copied an invite code
--   quiet             signed up over 14 days ago and not seen for 14 days

create or replace function public.usage_stuck_segment(p_segment text, p_exclude boolean)
returns table (id uuid, display_name text, avatar_path text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.display_name, u.avatar_path, u.created_at
  from public.usage_eligible(p_exclude) u
  where case p_segment
    when 'no_trip' then
      u.created_at <= now() - interval '1 day'
      and not exists (select 1 from public.group_members gm where gm.user_id = u.id)
      and not exists (select 1 from public.groups g where g.created_by = u.id)
    when 'trip_no_expense' then
      u.created_at <= now() - interval '1 day'
      and exists (select 1 from public.group_members gm where gm.user_id = u.id)
      and not exists (select 1 from public.expenses x where x.created_by = u.id)
    when 'never_invited' then
      exists (select 1 from public.expenses x where x.created_by = u.id)
      and not exists (
        select 1 from public.groups g
        join public.group_members gm on gm.group_id = g.id
        where g.created_by = u.id and gm.user_id <> u.id)
      and not exists (select 1 from public.app_events a where a.user_id = u.id and a.name = 'invite_shared')
    when 'quiet' then
      u.created_at <= now() - interval '14 days'
      and coalesce(public.usage_last_seen(u.id), u.created_at) < now() - interval '14 days'
    else false
  end;
$$;

revoke all on function public.usage_stuck_segment(text, boolean) from public, anon, authenticated;

create or replace function public.admin_usage_stuck_counts(p_exclude boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.usage_guard();
  return jsonb_build_object(
    'no_trip', (select count(*) from public.usage_stuck_segment('no_trip', p_exclude)),
    'trip_no_expense', (select count(*) from public.usage_stuck_segment('trip_no_expense', p_exclude)),
    'never_invited', (select count(*) from public.usage_stuck_segment('never_invited', p_exclude)),
    'quiet', (select count(*) from public.usage_stuck_segment('quiet', p_exclude))
  );
end;
$$;

create or replace function public.admin_usage_stuck(
  p_segment text,
  p_exclude boolean default true,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid, display_name text, avatar_path text,
  signed_up_at timestamptz, last_seen_at timestamptz,
  trips bigint, expenses bigint, total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.usage_guard();
  if p_segment not in ('no_trip', 'trip_no_expense', 'never_invited', 'quiet') then
    raise exception 'Unknown segment %', p_segment using errcode = '22023';
  end if;

  return query
  select s.id, s.display_name, s.avatar_path, s.created_at,
         public.usage_last_seen(s.id),
         (select count(*) from public.group_members gm where gm.user_id = s.id),
         (select count(*) from public.expenses x where x.created_by = s.id),
         count(*) over ()
  from public.usage_stuck_segment(p_segment, p_exclude) s
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
-- Signed-in users may call the admin_usage_* functions; each refuses anyone
-- who is not a platform admin. Signed-out callers cannot call them at all.

revoke all on function public.admin_usage_overview(integer, text, boolean) from public, anon;
revoke all on function public.admin_usage_funnel(date, date, text, boolean) from public, anon;
revoke all on function public.admin_usage_funnel_users(text, date, date, text, boolean, integer, integer) from public, anon;
revoke all on function public.admin_usage_ttfe(date, date, text, boolean) from public, anon;
revoke all on function public.admin_usage_stuck_counts(boolean) from public, anon;
revoke all on function public.admin_usage_stuck(text, boolean, integer, integer) from public, anon;

grant execute on function public.admin_usage_overview(integer, text, boolean) to authenticated;
grant execute on function public.admin_usage_funnel(date, date, text, boolean) to authenticated;
grant execute on function public.admin_usage_funnel_users(text, date, date, text, boolean, integer, integer) to authenticated;
grant execute on function public.admin_usage_ttfe(date, date, text, boolean) to authenticated;
grant execute on function public.admin_usage_stuck_counts(boolean) to authenticated;
grant execute on function public.admin_usage_stuck(text, boolean, integer, integer) to authenticated;

notify pgrst, 'reload schema';
