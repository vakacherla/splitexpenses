-- Usage insights phase 2: live users now (REQ-USE-26).
--
-- Admin > Usage > Overview gets a "Live now" section: the people in the app right
-- now, with the part of the app they last opened and their device. The Overview
-- already shows how many people are active now; this is the list behind that
-- number, so the two always agree (same rule: last heartbeat within 5 minutes,
-- same eligible-people rule, same opt-out behaviour: a person who switched usage
-- data off sends no heartbeat, so they never appear).
--
-- For each person:
--   route          the route pattern of their most recent page_view in the last 24
--                  hours (for example /trips/:id, never a real trip id or name),
--                  or null when there is none
--   form_factor, install_mode, os
--                  from their most recent app_open in the last 24 hours, or null
--
-- At most 50 people are listed, newest first; count is the true total. Admins only;
-- the result never contains an email.
--
-- Plain assignments and no "select ... into", because the Supabase SQL editor
-- mangles that form inside function bodies. Safe to run more than once.

create or replace function public.admin_usage_live(p_exclude boolean default true)
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

  res := (with live as (
    select e.id as user_id, e.display_name, e.avatar_path, ua.last_seen_at
    from public.user_activity ua
    join public.usage_eligible(p_exclude) e on e.id = ua.user_id
    where ua.last_seen_at > now() - interval '5 minutes'
  ),
  people as (
    select
      l.user_id, l.display_name, l.avatar_path, l.last_seen_at,
      (select a.props ->> 'route' from public.app_events a
        where a.user_id = l.user_id and a.name = 'page_view' and a.created_at > now() - interval '24 hours'
        order by a.created_at desc limit 1) as route,
      (select a.props from public.app_events a
        where a.user_id = l.user_id and a.name = 'app_open' and a.created_at > now() - interval '24 hours'
        order by a.created_at desc limit 1) as device
    from live l
    order by l.last_seen_at desc, l.display_name asc
    limit 50
  )
  select jsonb_build_object(
    'now', now(),
    'window_minutes', 5,
    'count', (select count(*) from live),
    'users', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id', p.user_id,
          'display_name', p.display_name,
          'avatar_path', p.avatar_path,
          'last_seen_at', p.last_seen_at,
          'route', p.route,
          'form_factor', p.device ->> 'form_factor',
          'install_mode', p.device ->> 'install_mode',
          'os', p.device ->> 'os'
        ) order by p.last_seen_at desc, p.display_name asc), '[]'::jsonb)
      from people p)
  ));

  return res;
end;
$$;

revoke all on function public.admin_usage_live(boolean) from public, anon;
grant execute on function public.admin_usage_live(boolean) to authenticated;

notify pgrst, 'reload schema';
