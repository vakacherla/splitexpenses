-- Usage insights phase 2: top events this week (REQ-USE-11).
--
-- Admin > Usage > Overview gets a "What people did this week" card: the eight
-- things the most distinct people did in the last 7 days. People are counted
-- once per event, never events (someone opening the app ten times is one).
--
-- Events are named so the list says something useful:
--   feature_used   becomes feature_used:<feature>   (feature_used:receipt_scan)
--   page_view      becomes page_view:<route>        (page_view:/rates)
--   everything else keeps its own name (app_open, trip_created, expense_added,
--   settled_up, member_invited, invite_shared)
-- Only events the database already allows are stored (app_events has a check
-- on the name and a validator on props), so nothing outside that list can
-- appear here.
--
-- The window is today and the 6 days before it, in the admin's timezone, the
-- same day rule as the other reports. Ties are listed alphabetically so the
-- order is stable. Admins only; no email is ever returned.
--
-- Plain assignments and no "select ... into", because the Supabase SQL editor
-- mangles that form inside function bodies. Safe to run more than once.

create or replace function public.admin_usage_top_events(
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
  from_ts timestamptz;
  res jsonb;
begin
  perform public.usage_guard();
  tz := public.usage_tz(p_tz);
  today := (now() at time zone tz)::date;
  from_ts := ((today - 6)::timestamp at time zone tz);

  res := (with ev as (
    select
      a.user_id,
      case a.name
        when 'feature_used' then 'feature_used:' || coalesce(a.props ->> 'feature', 'other')
        when 'page_view' then 'page_view:' || coalesce(a.props ->> 'route', 'other')
        else a.name
      end as event
    from public.app_events a
    join public.usage_eligible(p_exclude) e on e.id = a.user_id
    where a.created_at >= from_ts
  ),
  per as (
    select event, count(distinct user_id) as users
    from ev
    group by event
    order by count(distinct user_id) desc, event asc
    limit 8
  )
  select jsonb_build_object(
    'tz', tz,
    'from', today - 6,
    'to', today,
    'active_users', (select count(distinct a.user_id) from public.usage_activity(p_exclude) a where a.ts >= from_ts),
    'has_tracking', exists (select 1 from public.app_events),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object('event', per.event, 'users', per.users) order by per.users desc, per.event asc), '[]'::jsonb)
      from per)
  ));

  return res;
end;
$$;

revoke all on function public.admin_usage_top_events(text, boolean) from public, anon;
grant execute on function public.admin_usage_top_events(text, boolean) to authenticated;

notify pgrst, 'reload schema';
