-- Push notifications + a persistent, browsable in-app activity feed —
-- roadmap item #3. Nearly all the push plumbing already existed from
-- the settle-up reminder work (push_subscriptions, VAPID keys,
-- src/lib/push.js, the service worker's generic push handler); what's
-- new is this append-only event log, since current schema can't
-- reconstruct a removed member or an expense's edit history, only a
-- live snapshot.
--
-- Logged: expense added/edited/deleted, settlement recorded/undone,
-- member joined/removed, one consolidated row per CSV import (never
-- one per imported row). Deliberately not logged: group rename, trip
-- dates, duplication, banner uploads — not part of the roadmap's
-- motivating examples, easy to add later the same way if it matters.
--
-- Run this once in the SQL Editor of your existing project.

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  event_type text not null check (event_type in (
    'expense_added', 'expense_edited', 'expense_deleted',
    'settlement_added', 'settlement_deleted',
    'member_joined', 'member_removed', 'csv_import'
  )),
  summary text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

alter table public.activity_events enable row level security;

create policy "activity_events: members can view" on public.activity_events
  for select using (public.is_group_member(group_id) or public.is_platform_admin());

create policy "activity_events: members can log their own actions" on public.activity_events
  for insert with check (public.is_group_member(group_id) and actor_id = auth.uid());

create index idx_activity_events_group on public.activity_events (group_id, created_at desc);

-- ---------- Log membership changes from inside the existing
-- SECURITY DEFINER functions that make them, so it works regardless of
-- caller (self-service join, or a super admin acting on someone's
-- behalf) without needing a separate insert grant. ----------

create or replace function public.join_group_by_code(code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
begin
  select * into g from public.groups where invite_code = upper(trim(code));
  if not found then
    raise exception 'That invite code doesn''t match any group.';
  end if;

  insert into public.group_members (group_id, user_id)
  values (g.id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  insert into public.activity_events (group_id, actor_id, actor_name, event_type, summary, entity_id)
  values (
    g.id, auth.uid(),
    coalesce((select display_name from public.profiles where id = auth.uid()), 'Someone'),
    'member_joined',
    coalesce((select display_name from public.profiles where id = auth.uid()), 'Someone'),
    auth.uid()
  );

  return g;
end;
$$;

create or replace function public.admin_add_user_to_group(target_user_id uuid, target_group_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
  target_name text;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can add a user to a group directly.';
  end if;

  select * into g from public.groups where id = target_group_id;
  if not found then
    raise exception 'Group not found.';
  end if;

  insert into public.group_members (group_id, user_id)
  values (target_group_id, target_user_id)
  on conflict (group_id, user_id) do nothing;

  select display_name into target_name from public.profiles where id = target_user_id;
  insert into public.activity_events (group_id, actor_id, actor_name, event_type, summary, entity_id)
  values (
    target_group_id, auth.uid(),
    coalesce((select display_name from public.profiles where id = auth.uid()), 'An admin'),
    'member_joined', coalesce(target_name, 'Someone'), target_user_id
  );

  return g;
end;
$$;

create or replace function public.admin_remove_user_from_group(target_user_id uuid, target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_name text;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can remove a user from a group directly.';
  end if;

  select display_name into target_name from public.profiles where id = target_user_id;

  delete from public.group_members
  where group_id = target_group_id and user_id = target_user_id;

  insert into public.activity_events (group_id, actor_id, actor_name, event_type, summary, entity_id)
  values (
    target_group_id, auth.uid(),
    coalesce((select display_name from public.profiles where id = auth.uid()), 'An admin'),
    'member_removed', coalesce(target_name, 'Someone'), target_user_id
  );
end;
$$;

notify pgrst, 'reload schema';
