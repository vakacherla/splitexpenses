-- Usage insights: fix the "Never invited" stuck-users segment.
--
-- Found on 3 Oct 2026 by the owner: two people who had joined someone else's
-- trip with an invite code were listed as "Never invited, adding expenses
-- alone". The rule only looked at trips the person had created, so anyone who
-- created none passed it by default, including everyone who joined a trip.
--
-- A person is "never invited" when they have added expenses, are not in any
-- trip that has someone else in it (created by them or joined), and have never
-- copied an invite code. People who joined a trip are no longer listed.
--
-- Only usage_stuck_segment changes. Safe to run more than once.

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

revoke all on function public.usage_stuck_segment(text, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
