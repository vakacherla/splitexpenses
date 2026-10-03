-- Usage insights: make the admin reports fast (follow-up to migration 050).
--
-- Found on 3 Oct 2026: the Funnel view timed out on its first load. usage_tz()
-- looked a timezone up in pg_timezone_names, which costs about 15 ms per call,
-- and usage_funnel_rows() called it twice for every user (once per side of the
-- date range). At 400 users that was about 6 seconds, close to the database's
-- statement limit, and it would only get worse as the user base grows.
--
-- 1. usage_tz() now checks the timezone by using it, which is effectively free.
-- 2. usage_funnel_rows() works the timezone out once, not once per user.
-- 3. Indexes on the columns the report functions look users up by.
--
-- Safe to run more than once. Results are unchanged.

create or replace function public.usage_tz(p_tz text)
returns text
language plpgsql
stable
as $$
begin
  if p_tz is null or p_tz = '' then
    return 'UTC';
  end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end;
$$;

revoke all on function public.usage_tz(text) from public, anon, authenticated;

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
  cross join (select public.usage_tz(p_tz) as tz) z
  where (c.created_at at time zone z.tz)::date between p_from and p_to;
$$;

revoke all on function public.usage_funnel_rows(date, date, text, boolean) from public, anon, authenticated;

create index if not exists idx_groups_created_by on public.groups (created_by);
create index if not exists idx_expenses_created_by on public.expenses (created_by);
create index if not exists idx_settlements_created_by on public.settlements (created_by);
create index if not exists idx_settlements_from_user on public.settlements (from_user);
create index if not exists idx_settlements_to_user on public.settlements (to_user);
create index if not exists idx_activity_events_actor on public.activity_events (actor_id);

notify pgrst, 'reload schema';
