-- Usage insights phase 2: per-user activity timeline (REQ-USE-12).
--
-- An admin can open one person from Admin > Usage > Stuck users or from the Users
-- tab and see what they have been doing in the last 30 days, newest first, to
-- understand where they stalled. Name and avatar only, never an email.
--
-- What the timeline holds. It is built only from things that carry no content:
--   from app_events   app_open, page_view (as a route pattern such as /trips/:id),
--                     feature_used (as the feature name), member_invited, invite_shared
--   from the ledger   signed_up, trip_created, trip_joined (a trip someone else made),
--                     expense_added, settled_up
-- The ledger rows give the real actions for people whose usage tracking is off or
-- who joined before tracking began. app_events trip_created, expense_added and
-- settled_up are left out so an action is never listed twice.
-- Trip names, expense descriptions, amounts, notes and other people's names are
-- never read, so none of them can appear (app_events props are already limited to a
-- short allowlist, and only the route and feature values are used).
--
-- At most 200 events are returned (newest first); total is the true count. The user
-- block says whether usage tracking is on for them, so the screen can explain a
-- timeline that has only ledger actions. Viewing is not logged in this phase (the
-- admin audit log is REQ-USE-22, parked). Admins only.
--
-- Plain assignments and no "select ... into", because the Supabase SQL editor
-- mangles that form inside function bodies. Safe to run more than once.

create or replace function public.admin_usage_user_timeline(p_user uuid, p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz text;
  from_ts timestamptz;
  res jsonb;
begin
  perform public.usage_guard();
  tz := public.usage_tz(p_tz);
  from_ts := now() - interval '30 days';

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  res := (with ev as (
    select a.created_at as at,
      case a.name
        when 'feature_used' then 'feature_used:' || coalesce(a.props ->> 'feature', 'other')
        when 'page_view' then 'page_view:' || coalesce(a.props ->> 'route', 'other')
        else a.name
      end as event
    from public.app_events a
    where a.user_id = p_user and a.created_at >= from_ts
      and a.name in ('app_open', 'page_view', 'feature_used', 'member_invited', 'invite_shared')
    union all
    select p.created_at, 'signed_up' from public.profiles p where p.id = p_user and p.created_at >= from_ts
    union all
    select g.created_at, 'trip_created' from public.groups g where g.created_by = p_user and g.created_at >= from_ts
    union all
    select gm.joined_at, 'trip_joined'
    from public.group_members gm
    where gm.user_id = p_user and gm.joined_at >= from_ts
      and not exists (select 1 from public.groups g where g.id = gm.group_id and g.created_by = p_user)
    union all
    select x.created_at, 'expense_added' from public.expenses x where x.created_by = p_user and x.created_at >= from_ts
    union all
    select s.created_at, 'settled_up' from public.settlements s where s.created_by = p_user and s.created_at >= from_ts
  ),
  newest as (
    select at, event from ev order by at desc, event asc limit 200
  )
  select jsonb_build_object(
    'tz', tz,
    'days', 30,
    'user', jsonb_build_object(
      'id', pr.id,
      'display_name', pr.display_name,
      'avatar_path', pr.avatar_path,
      'signed_up_at', pr.created_at,
      'last_seen_at', public.usage_last_seen(pr.id),
      'share_usage', pr.share_usage
    ),
    'total', (select count(*) from ev),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object('at', n.at, 'event', n.event) order by n.at desc, n.event asc), '[]'::jsonb)
      from newest n)
  )
  from public.profiles pr
  where pr.id = p_user);

  return res;
end;
$$;

revoke all on function public.admin_usage_user_timeline(uuid, text) from public, anon;
grant execute on function public.admin_usage_user_timeline(uuid, text) to authenticated;

notify pgrst, 'reload schema';
