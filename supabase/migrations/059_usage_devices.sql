-- Usage insights phase 2: devices and install mode (REQ-USE-23).
--
-- Admin > Usage > Devices answers "what are people using?": phone, tablet or
-- desktop; installed app or browser; iOS, Android or something else. The device
-- labels are coarse and come from the app's own app_open event (one per browser
-- session), so there is no raw user agent anywhere.
--
-- For each label the function returns two numbers:
--   users     distinct people who opened the app at least once on that device
--             type in the period. Someone who uses a phone and a laptop counts
--             once in "phone" and once in "desktop", so the shares can add up to
--             more than 100% (the screen says so).
--   sessions  how many app opens (browser sessions) had that label
--
-- An app_open with a missing label is counted under "unknown" (listed last, only
-- when there is one). people_opened is the number of distinct people who opened
-- the app in the period, the base for the percentages in the app; sessions is
-- the total number of app opens, so each group's sessions add up to it.
--
-- The period is the last p_days (clamped to 7..90) ending today in the admin's
-- timezone, like the other reports. Excluded accounts and the opted-out rule work
-- as everywhere else (people who switched usage data off have no events). Admins
-- only; no email is returned.
--
-- Plain assignments and no "select ... into", because the Supabase SQL editor
-- mangles that form inside function bodies. Safe to run more than once.

create or replace function public.admin_usage_devices(
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
  from_ts timestamptz;
  res jsonb;
begin
  perform public.usage_guard();
  tz := public.usage_tz(p_tz);
  n := least(greatest(coalesce(p_days, 30), 7), 90);
  today := (now() at time zone tz)::date;
  from_ts := ((today - (n - 1))::timestamp at time zone tz);

  res := (with ev as (
    select
      a.user_id,
      coalesce(a.props ->> 'form_factor', 'unknown') as ff,
      coalesce(a.props ->> 'install_mode', 'unknown') as im,
      coalesce(a.props ->> 'os', 'unknown') as os
    from public.app_events a
    join public.usage_eligible(p_exclude) e on e.id = a.user_id
    where a.name = 'app_open' and a.created_at >= from_ts
  ),
  ffc as (select ff as v, count(distinct user_id) as users, count(*) as sessions from ev group by ff),
  imc as (select im as v, count(distinct user_id) as users, count(*) as sessions from ev group by im),
  osc as (select os as v, count(distinct user_id) as users, count(*) as sessions from ev group by os)
  select jsonb_build_object(
    'tz', tz,
    'from', today - (n - 1),
    'to', today,
    'days', n,
    'total_users', (select count(*) from public.usage_eligible(p_exclude)),
    'people_opened', (select count(distinct user_id) from ev),
    'sessions', (select count(*) from ev),
    'form_factor', (
      select coalesce(jsonb_agg(
        jsonb_build_object('value', k.v, 'users', coalesce(c.users, 0), 'sessions', coalesce(c.sessions, 0))
        order by k.ord), '[]'::jsonb)
      from unnest(array['phone', 'tablet', 'desktop', 'unknown']) with ordinality as k(v, ord)
      left join ffc c on c.v = k.v
      where k.v <> 'unknown' or c.users is not null),
    'install_mode', (
      select coalesce(jsonb_agg(
        jsonb_build_object('value', k.v, 'users', coalesce(c.users, 0), 'sessions', coalesce(c.sessions, 0))
        order by k.ord), '[]'::jsonb)
      from unnest(array['pwa', 'browser', 'unknown']) with ordinality as k(v, ord)
      left join imc c on c.v = k.v
      where k.v <> 'unknown' or c.users is not null),
    'os', (
      select coalesce(jsonb_agg(
        jsonb_build_object('value', k.v, 'users', coalesce(c.users, 0), 'sessions', coalesce(c.sessions, 0))
        order by k.ord), '[]'::jsonb)
      from unnest(array['ios', 'android', 'windows', 'macos', 'linux', 'other', 'unknown']) with ordinality as k(v, ord)
      left join osc c on c.v = k.v
      where k.v <> 'unknown' or c.users is not null)
  ));

  return res;
end;
$$;

revoke all on function public.admin_usage_devices(integer, text, boolean) from public, anon;
grant execute on function public.admin_usage_devices(integer, text, boolean) to authenticated;

notify pgrst, 'reload schema';
