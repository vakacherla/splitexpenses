-- Usage insights, Track A (REQ-USE-01..04): collect first-party usage data so
-- the admin can see adoption. Nothing here is sent to a third party.
--
--  1. profiles.share_usage   the "Share usage data" switch (default on).
--  2. app_events             one row per tracked event. RLS is on and there are
--                            NO policies, so nobody can read or write it through
--                            the API. Rows arrive only through track_events()
--                            below; admins read aggregates through the
--                            admin_usage_* functions (migration 050).
--  3. user_activity          last_seen_at per user, also closed to the API, so a
--                            trip-mate cannot see when you were last online.
--
-- Privacy rules enforced here, not only in the app:
--  - event names come from a fixed list;
--  - props may only hold allowlisted keys with short, allowlisted-shape values
--    (no amounts, descriptions, names, emails or free text);
--  - nothing is recorded for a user whose share_usage is off, or who is
--    suspended;
--  - rows go when the account goes (on delete cascade).

-- ---------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists share_usage boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Event store
-- ---------------------------------------------------------------------------

-- Validates the jsonb "props" of one event. Immutable so a CHECK can use it.
create or replace function public.app_event_props_valid(p jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p) = 'object'
    and pg_column_size(p) <= 512
    and not exists (
      select 1
      from jsonb_each(p) as kv(k, v)
      where
        jsonb_typeof(v) <> 'string'
        or length(v #>> '{}') > 64
        or case k
          when 'feature' then (v #>> '{}') not in (
            'receipt_scan', 'text_parse', 'csv_import', 'csv_export', 'itemized_split',
            'settle_up', 'invite_link', 'circles', 'trip_reports', 'rates', 'reminders',
            'push_optin', 'offline_queue', 'help', 'tour')
          when 'route' then (v #>> '{}') !~ '^/[a-z0-9/:_-]*$'
          when 'split_type' then (v #>> '{}') !~ '^[a-z_]{1,20}$'
          when 'form_factor' then (v #>> '{}') not in ('phone', 'tablet', 'desktop')
          when 'install_mode' then (v #>> '{}') not in ('pwa', 'browser')
          when 'os' then (v #>> '{}') not in ('ios', 'android', 'windows', 'macos', 'linux', 'other')
          when 'browser' then (v #>> '{}') not in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'other')
          else true  -- unknown key: rejected below
        end
        or k not in ('feature', 'route', 'split_type', 'form_factor', 'install_mode', 'os', 'browser')
    );
$$;

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (name in (
    'app_open', 'page_view', 'feature_used',
    'trip_created', 'expense_added', 'settled_up', 'member_invited', 'invite_shared'
  )),
  props jsonb not null default '{}'::jsonb check (public.app_event_props_valid(props)),
  session_id text check (session_id is null or length(session_id) <= 64),
  created_at timestamptz not null default now()
);

create index if not exists idx_app_events_created on public.app_events (created_at);
create index if not exists idx_app_events_user on public.app_events (user_id, created_at);
create index if not exists idx_app_events_name on public.app_events (name, created_at);

alter table public.app_events enable row level security;
-- No policies on purpose. See the header.

-- Last-seen per user. Same no-policy lockdown.
create table if not exists public.user_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;

-- Same suspension protection every other public table has (migration 047).
select public.protect_table_from_suspended('public.app_events');
select public.protect_table_from_suspended('public.user_activity');

-- ---------------------------------------------------------------------------
-- 3. Writers (the only way in)
-- ---------------------------------------------------------------------------

-- True when the caller is signed in, not suspended, and has the switch on.
create or replace function public.usage_sharing_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and not public.is_suspended()
    and coalesce((select share_usage from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.usage_sharing_enabled() from public, anon;
grant execute on function public.usage_sharing_enabled() to authenticated;

-- Records a batch of events for the caller. Invalid events are skipped
-- silently (tracking must never surface an error to the person using the
-- app). At most 25 per call and 2000 per rolling day per user, so a buggy or
-- hostile client cannot fill the table. created_at is always the server's
-- clock; a client cannot backdate. Returns how many rows were stored.
create or replace function public.track_events(p_events jsonb, p_session text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stored integer := 0;
  recent integer;
  e jsonb;
begin
  if not public.usage_sharing_enabled() then
    return 0;
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  -- Written as a plain assignment on purpose: the Supabase SQL editor misreads
  -- the older assignment form inside function bodies and mangles the script.
  recent := (
    select count(*) from public.app_events
    where user_id = uid and created_at > now() - interval '1 day'
  );
  if recent >= 2000 then
    return 0;
  end if;

  for e in select value from jsonb_array_elements(p_events) limit 25 loop
    begin
      insert into public.app_events (user_id, name, props, session_id)
      values (
        uid,
        e ->> 'name',
        coalesce(e -> 'props', '{}'::jsonb),
        left(p_session, 64)
      );
      stored := stored + 1;
    exception when check_violation or not_null_violation then
      null; -- unknown name or props outside the allowlist: drop it
    end;
  end loop;

  return stored;
end;
$$;

revoke all on function public.track_events(jsonb, text) from public, anon;
grant execute on function public.track_events(jsonb, text) to authenticated;

-- Heartbeat for "active now" and "last seen". Cheap and idempotent: it only
-- writes when the stored time is more than a minute old, so a chatty client
-- cannot cause a write per call. Does nothing when the switch is off.
create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usage_sharing_enabled() then
    return;
  end if;
  insert into public.user_activity as ua (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_seen_at = now()
    where ua.last_seen_at < now() - interval '1 minute';
end;
$$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

notify pgrst, 'reload schema';
