-- Usage insights phase 2: device filter (REQ-USE-24).
--
-- The filter bar on Admin > Usage gets two dropdowns, device type (phone, tablet,
-- desktop) and installed app or browser. They narrow the funnel, time to first
-- expense, stuck users and feature adoption to people on that kind of device,
-- for example "the funnel for phone users only". The Overview, Top events, Live
-- now and Devices views are not filtered: Devices already breaks everything down
-- by device, and the other three describe everyone in the app.
--
-- Who matches. A person's device labels come from their app_open events. A person
-- matches a filter if ANY of their app opens in the window carries that label, so
-- someone on a phone and a laptop appears under both (the screen says so). Someone
-- with no app open at all, for example an account made before tracking began or one
-- that never signed in, counts as "unknown" and is found with the Unknown choice.
-- The window is the report's period for feature adoption, and all time for the
-- funnel (the people who signed up in the period) and stuck users (no period).
--
-- How it works. One helper, usage_eligible_device(), returns the same people as
-- usage_eligible() narrowed by the filter, and the reports that take a filter use
-- it in place of usage_eligible(). With no filter it returns exactly the same
-- people, so nothing changes for the existing screens or for the old app: every
-- new parameter defaults to null (no filter). Unknown filter values are refused.
--
-- A function's parameter list cannot be changed in place, and keeping the old
-- versions next to the new ones would make calls ambiguous, so the affected
-- functions are dropped and recreated with the two extra parameters. The whole
-- script runs in one transaction.
--
-- Plain assignments and no "select ... into", because the Supabase SQL editor
-- mangles that form inside function bodies.

begin;

create or replace function public.usage_check_device_filter(p_form_factor text, p_install_mode text)
returns void
language plpgsql
immutable
as $$
begin
  if p_form_factor is not null and p_form_factor not in ('phone', 'tablet', 'desktop', 'unknown') then
    raise exception 'Unknown device type %', p_form_factor using errcode = '22023';
  end if;
  if p_install_mode is not null and p_install_mode not in ('pwa', 'browser', 'unknown') then
    raise exception 'Unknown install mode %', p_install_mode using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.usage_check_device_filter(text, text) from public, anon, authenticated;

-- The people usage_eligible() returns, narrowed to those with an app open (at or
-- after p_from; null means any time) carrying the wanted label. No filter, no
-- narrowing.
create or replace function public.usage_eligible_device(
  p_exclude boolean,
  p_form_factor text,
  p_install_mode text,
  p_from timestamptz
)
returns table (id uuid, display_name text, avatar_path text, created_at timestamptz, share_usage boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.display_name, u.avatar_path, u.created_at, u.share_usage
  from public.usage_eligible(p_exclude) u
  where (p_form_factor is null
         or p_form_factor = any (coalesce(
              (select array_agg(distinct coalesce(a.props ->> 'form_factor', 'unknown'))
                 from public.app_events a
                where a.user_id = u.id and a.name = 'app_open' and (p_from is null or a.created_at >= p_from)),
              array['unknown'])))
    and (p_install_mode is null
         or p_install_mode = any (coalesce(
              (select array_agg(distinct coalesce(a.props ->> 'install_mode', 'unknown'))
                 from public.app_events a
                where a.user_id = u.id and a.name = 'app_open' and (p_from is null or a.created_at >= p_from)),
              array['unknown'])));
$$;

revoke all on function public.usage_eligible_device(boolean, text, text, timestamptz) from public, anon, authenticated;

-- Drop the old versions (their parameter lists change).
drop function if exists public.admin_usage_funnel(date, date, text, boolean);
drop function if exists public.admin_usage_funnel_users(text, date, date, text, boolean, integer, integer);
drop function if exists public.admin_usage_ttfe(date, date, text, boolean);
drop function if exists public.admin_usage_stuck_counts(boolean);
drop function if exists public.admin_usage_stuck(text, boolean, integer, integer);
drop function if exists public.admin_usage_feature_adoption(integer, text, boolean);
drop function if exists public.usage_funnel_rows(date, date, text, boolean);
drop function if exists public.usage_stuck_segment(text, boolean);

-- ---------------------------------------------------------------------------
-- Base populations (internal)
-- ---------------------------------------------------------------------------


create or replace function public.usage_funnel_rows(p_from date, p_to date, p_tz text, p_exclude boolean, p_form_factor text default null, p_install_mode text default null)
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
  from public.usage_eligible_device(p_exclude, p_form_factor, p_install_mode, null) c
  cross join (select public.usage_tz(p_tz) as tz) z
  where (c.created_at at time zone z.tz)::date between p_from and p_to;
$$;

create or replace function public.usage_stuck_segment(p_segment text, p_exclude boolean, p_form_factor text default null, p_install_mode text default null)
returns table (id uuid, display_name text, avatar_path text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.display_name, u.avatar_path, u.created_at
  from public.usage_eligible_device(p_exclude, p_form_factor, p_install_mode, null) u
  where case p_segment
    when 'never_signed_in' then
      u.created_at <= now() - interval '1 hour'
      and public.usage_last_seen(u.id) is null
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
        select 1 from public.group_members mine
        join public.group_members other
          on other.group_id = mine.group_id and other.user_id <> u.id
        where mine.user_id = u.id)
      and not exists (select 1 from public.app_events a where a.user_id = u.id and a.name = 'invite_shared')
    when 'quiet' then
      u.created_at <= now() - interval '14 days'
      and coalesce(public.usage_last_seen(u.id), u.created_at) < now() - interval '14 days'
    else false
  end;
$$;


-- ---------------------------------------------------------------------------
-- Funnel, time to first expense
-- ---------------------------------------------------------------------------


create or replace function public.admin_usage_funnel(
  p_from date,
  p_to date,
  p_tz text default 'UTC',
  p_exclude boolean default true,
  p_form_factor text default null,
  p_install_mode text default null
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
  perform public.usage_check_device_filter(p_form_factor, p_install_mode);

  res := (with f as (select * from public.usage_funnel_rows(p_from, p_to, p_tz, p_exclude, p_form_factor, p_install_mode)),
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



create or replace function public.admin_usage_funnel_users(
  p_stage text,
  p_from date,
  p_to date,
  p_tz text default 'UTC',
  p_exclude boolean default true,
  p_limit integer default 10,
  p_offset integer default 0,
  p_form_factor text default null,
  p_install_mode text default null
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
  perform public.usage_check_device_filter(p_form_factor, p_install_mode);
  if p_stage not in ('trip', 'expense', 'shared', 'joined', 'settled') then
    raise exception 'Unknown stage %', p_stage using errcode = '22023';
  end if;

  return query
  select f.id, f.display_name, f.avatar_path, f.created_at,
         public.usage_last_seen(f.id),
         count(*) over ()
  from public.usage_funnel_rows(p_from, p_to, p_tz, p_exclude, p_form_factor, p_install_mode) f
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



create or replace function public.admin_usage_ttfe(
  p_from date,
  p_to date,
  p_tz text default 'UTC',
  p_exclude boolean default true,
  p_form_factor text default null,
  p_install_mode text default null
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
  perform public.usage_check_device_filter(p_form_factor, p_install_mode);

  res := (with f as (
    select extract(epoch from (t_exp - created_at)) as secs
    from public.usage_funnel_rows(p_from, p_to, p_tz, p_exclude, p_form_factor, p_install_mode)
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


-- Stuck users
-- ---------------------------------------------------------------------------


create or replace function public.admin_usage_stuck_counts(p_exclude boolean default true, p_form_factor text default null, p_install_mode text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.usage_guard();
  perform public.usage_check_device_filter(p_form_factor, p_install_mode);
  return jsonb_build_object(
    'never_signed_in', (select count(*) from public.usage_stuck_segment('never_signed_in', p_exclude, p_form_factor, p_install_mode)),
    'no_trip', (select count(*) from public.usage_stuck_segment('no_trip', p_exclude, p_form_factor, p_install_mode)),
    'trip_no_expense', (select count(*) from public.usage_stuck_segment('trip_no_expense', p_exclude, p_form_factor, p_install_mode)),
    'never_invited', (select count(*) from public.usage_stuck_segment('never_invited', p_exclude, p_form_factor, p_install_mode)),
    'quiet', (select count(*) from public.usage_stuck_segment('quiet', p_exclude, p_form_factor, p_install_mode))
  );
end;
$$;



create or replace function public.admin_usage_stuck(
  p_segment text,
  p_exclude boolean default true,
  p_limit integer default 20,
  p_offset integer default 0,
  p_form_factor text default null,
  p_install_mode text default null
)
returns table (
  user_id uuid, display_name text, avatar_path text,
  signed_up_at timestamptz, last_seen_at timestamptz,
  trips bigint, expenses bigint, total bigint,
  email_confirmed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.usage_guard();
  perform public.usage_check_device_filter(p_form_factor, p_install_mode);
  if p_segment not in ('never_signed_in', 'no_trip', 'trip_no_expense', 'never_invited', 'quiet') then
    raise exception 'Unknown segment %', p_segment using errcode = '22023';
  end if;

  return query
  select s.id, s.display_name, s.avatar_path, s.created_at,
         public.usage_last_seen(s.id),
         (select count(*) from public.group_members gm where gm.user_id = s.id),
         (select count(*) from public.expenses x where x.created_by = s.id),
         count(*) over (),
         (select a.email_confirmed_at is not null from auth.users a where a.id = s.id)
  from public.usage_stuck_segment(p_segment, p_exclude, p_form_factor, p_install_mode) s
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;


-- Feature adoption
-- ---------------------------------------------------------------------------


create or replace function public.admin_usage_feature_adoption(
  p_days integer default 30,
  p_tz text default 'UTC',
  p_exclude boolean default true,
  p_form_factor text default null,
  p_install_mode text default null
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
  from_ts timestamptz;
  res jsonb;
begin
  perform public.usage_guard();
  perform public.usage_check_device_filter(p_form_factor, p_install_mode);
  tz := public.usage_tz(p_tz);
  n := least(greatest(coalesce(p_days, 30), 7), 90);
  today := (now() at time zone tz)::date;
  from_ts := ((today - (n - 1))::timestamp at time zone tz);

  res := (with ev as (
    select
      a.user_id,
      (a.created_at at time zone tz)::date as d,
      case
        when a.name = 'feature_used' then a.props ->> 'feature'
        when a.name = 'settled_up' then 'settle_up'
        when a.name = 'invite_shared' then 'invite_link'
        when a.name = 'page_view' and a.props ->> 'route' = '/rates' then 'rates'
        when a.name = 'page_view' and a.props ->> 'route' = '/help' then 'help'
      end as feature
    from public.app_events a
    join public.usage_eligible_device(p_exclude, p_form_factor, p_install_mode, from_ts) e on e.id = a.user_id
    where a.created_at >= from_ts
  ),
  per_user as (
    select feature, user_id, count(distinct d) as days
    from ev
    where feature is not null
    group by feature, user_id
  ),
  per as (
    select feature, count(*) as tried, count(*) filter (where days >= 2) as repeated
    from per_user
    group by feature
  ),
  feats as (
    select f.feature, f.ord
    from unnest(array[
      'receipt_scan', 'text_parse', 'itemized_split', 'csv_import', 'csv_export',
      'settle_up', 'invite_link', 'circles', 'trip_reports', 'rates', 'reminders',
      'push_optin', 'offline_queue', 'help', 'tour'
    ]) with ordinality as f(feature, ord)
  )
  select jsonb_build_object(
    'tz', tz,
    'from', today - (n - 1),
    'to', today,
    'days', n,
    'total_users', (select count(*) from public.usage_eligible_device(p_exclude, p_form_factor, p_install_mode, from_ts)),
    'active_users', (select count(distinct a.user_id) from public.usage_activity(p_exclude) a where a.ts >= from_ts
        and a.user_id in (select d.id from public.usage_eligible_device(p_exclude, p_form_factor, p_install_mode, from_ts) d)),
    'has_tracking', exists (select 1 from public.app_events),
    'features', (
      select jsonb_agg(
        jsonb_build_object(
          'feature', f.feature,
          'tried', coalesce(per.tried, 0),
          'repeated', coalesce(per.repeated, 0)
        ) order by f.ord)
      from feats f
      left join per on per.feature = f.feature)
  ));

  return res;
end;
$$;




-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on function public.usage_funnel_rows(date, date, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.usage_stuck_segment(text, boolean, text, text) from public, anon, authenticated;

revoke all on function public.admin_usage_funnel(date, date, text, boolean, text, text) from public, anon;
revoke all on function public.admin_usage_funnel_users(text, date, date, text, boolean, integer, integer, text, text) from public, anon;
revoke all on function public.admin_usage_ttfe(date, date, text, boolean, text, text) from public, anon;
revoke all on function public.admin_usage_stuck_counts(boolean, text, text) from public, anon;
revoke all on function public.admin_usage_stuck(text, boolean, integer, integer, text, text) from public, anon;
revoke all on function public.admin_usage_feature_adoption(integer, text, boolean, text, text) from public, anon;

grant execute on function public.admin_usage_funnel(date, date, text, boolean, text, text) to authenticated;
grant execute on function public.admin_usage_funnel_users(text, date, date, text, boolean, integer, integer, text, text) to authenticated;
grant execute on function public.admin_usage_ttfe(date, date, text, boolean, text, text) to authenticated;
grant execute on function public.admin_usage_stuck_counts(boolean, text, text) to authenticated;
grant execute on function public.admin_usage_stuck(text, boolean, integer, integer, text, text) to authenticated;
grant execute on function public.admin_usage_feature_adoption(integer, text, boolean, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
