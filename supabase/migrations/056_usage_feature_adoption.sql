-- Usage insights phase 2: feature adoption (REQ-USE-10).
--
-- Admin > Usage > Features answers two questions per feature: how many people
-- tried it, and how many came back to it on a second day. The app turns those
-- into a diagnosis (see src/lib/usageStats.js); this function only counts.
--
--   tried     distinct people with at least one use in the period
--   repeated  distinct people who used it on two or more separate days (days
--             are in the admin's timezone, the same rule as every other report)
--
-- Where a "use" comes from, all from app_events:
--   feature_used            the feature named in props (receipt_scan, text_parse,
--                           csv_import, csv_export, itemized_split, circles,
--                           trip_reports, reminders, push_optin, offline_queue, tour)
--   settled_up              settle_up
--   invite_shared           invite_link
--   page_view of /rates     rates
--   page_view of /help      help
--
-- active_users is the number of people with any visible activity in the period
-- (the same definition as the Overview), so percentages in the app agree with
-- the Overview. The function admits admins only and never returns an email.
--
-- Written with plain assignments and no "select ... into" on purpose: the
-- Supabase SQL editor mangles that form inside function bodies.
-- Safe to run more than once.

create or replace function public.admin_usage_feature_adoption(
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
      (a.created_at at time zone tz)::date as d,
      case
        when a.name = 'feature_used' then a.props ->> 'feature'
        when a.name = 'settled_up' then 'settle_up'
        when a.name = 'invite_shared' then 'invite_link'
        when a.name = 'page_view' and a.props ->> 'route' = '/rates' then 'rates'
        when a.name = 'page_view' and a.props ->> 'route' = '/help' then 'help'
      end as feature
    from public.app_events a
    join public.usage_eligible(p_exclude) e on e.id = a.user_id
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
    'total_users', (select count(*) from public.usage_eligible(p_exclude)),
    'active_users', (select count(distinct a.user_id) from public.usage_activity(p_exclude) a where a.ts >= from_ts),
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

revoke all on function public.admin_usage_feature_adoption(integer, text, boolean) from public, anon;
grant execute on function public.admin_usage_feature_adoption(integer, text, boolean) to authenticated;

notify pgrst, 'reload schema';
