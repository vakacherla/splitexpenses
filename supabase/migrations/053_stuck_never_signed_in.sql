-- Usage insights: a "Never signed in" group on Admin > Usage > Stuck users.
--
-- Why: an account that was created and never used usually means the person
-- could not get in, for example a confirmation email that never arrived (this
-- happened to two real users in September). The existing groups all start from
-- "signed in at least once", so they cannot show this.
--
-- A person is in this group when their account is over an hour old and we have
-- never seen them do anything: no sign-in, no heartbeat, no events, no writes.
-- The list also says whether their email was ever confirmed (a yes/no only;
-- the address itself is never returned). That tells you whether to look at
-- email delivery or to ask the person what they saw.
--
-- Changes:
--   usage_stuck_segment      new 'never_signed_in' case
--   admin_usage_stuck_counts new 'never_signed_in' count
--   admin_usage_stuck        gains a last column, email_confirmed. Existing
--                            callers ignore the extra column, so the app can
--                            deploy before or after this migration.
-- Safe to run more than once.

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
    'never_signed_in', (select count(*) from public.usage_stuck_segment('never_signed_in', p_exclude)),
    'no_trip', (select count(*) from public.usage_stuck_segment('no_trip', p_exclude)),
    'trip_no_expense', (select count(*) from public.usage_stuck_segment('trip_no_expense', p_exclude)),
    'never_invited', (select count(*) from public.usage_stuck_segment('never_invited', p_exclude)),
    'quiet', (select count(*) from public.usage_stuck_segment('quiet', p_exclude))
  );
end;
$$;

-- The return type changes (one more column), so the function is replaced, not
-- altered.
drop function if exists public.admin_usage_stuck(text, boolean, integer, integer);

create function public.admin_usage_stuck(
  p_segment text,
  p_exclude boolean default true,
  p_limit integer default 20,
  p_offset integer default 0
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
  from public.usage_stuck_segment(p_segment, p_exclude) s
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_usage_stuck(text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_usage_stuck(text, boolean, integer, integer) to authenticated;

notify pgrst, 'reload schema';
