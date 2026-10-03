-- Per-invite links (REQ-INV-01), phase 1: the database side.
--
-- A member makes a link for a trip or a Circle, shares it anywhere, and the
-- person who opens it can join in one tap. Every link records who made it, when
-- it was shared and how, how often it was opened, and who joined with it, so the
-- app can finally tell invited from joined.
--
--   invites          one row per link. RLS on, NO policies: nobody can read or
--                    write it through the API. Everything goes through the
--                    functions below, which check who is asking.
--   invite_accepts   who joined with which link, and whether their account was
--                    brand new. Same lockdown.
--
-- Rules (owner decisions, 3 Oct 2026):
--   - any member of the trip or Circle can make a link;
--   - a link works for up to 20 people and for 14 days;
--   - a person can use a given link once, so someone removed from a trip cannot
--     come back through the same link;
--   - at most 20 new links per person per day;
--   - the six-letter codes keep working exactly as before (join_group_by_code
--     and join_circle_by_code are not touched).
--
-- What a stranger holding a link can learn (preview_invite): the trip's name and
-- cover photo, the inviter's first name and photo, and whether the link still
-- works. No members, no expenses, no emails.
--
-- Written for the Supabase SQL editor: no select-into, no extensions. Safe to run
-- more than once.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  kind text not null check (kind in ('trip', 'circle')),
  group_id uuid references public.groups (id) on delete cascade,
  circle_id uuid references public.circles (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  -- Who the inviter says it is for. A first name or nickname, never an email.
  -- Shown only to the inviter and the trip's creator, never in admin reports.
  label text check (label is null or length(label) <= 40),
  max_uses integer not null default 20 check (max_uses between 1 and 50),
  -- Real page loads of the join screen. Chat apps fetch the page itself to build
  -- a preview card, not this function, so they do not inflate it.
  open_count integer not null default 0,
  shared_at timestamptz,
  shared_via text check (shared_via is null or shared_via in ('share', 'whatsapp', 'email', 'copy')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz,
  constraint invites_one_target check (
    (kind = 'trip' and group_id is not null and circle_id is null)
    or (kind = 'circle' and circle_id is not null and group_id is null)
  )
);

create index if not exists idx_invites_inviter on public.invites (inviter_id, created_at);
create index if not exists idx_invites_group on public.invites (group_id);
create index if not exists idx_invites_circle on public.invites (circle_id);

create table if not exists public.invite_accepts (
  invite_id uuid not null references public.invites (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  -- The account was created within a day before joining: this person arrived
  -- through the invite, as opposed to an existing user being added.
  new_account boolean not null,
  primary key (invite_id, user_id)
);

create index if not exists idx_invite_accepts_user on public.invite_accepts (user_id);

alter table public.invites enable row level security;
alter table public.invite_accepts enable row level security;
-- No policies on purpose. See the header.

-- Same suspension protection every other public table has (migration 047).
select public.protect_table_from_suspended('public.invites');
select public.protect_table_from_suspended('public.invite_accepts');

-- ---------------------------------------------------------------------------
-- create_invite: make a link for a trip or a Circle you belong to
-- ---------------------------------------------------------------------------

create or replace function public.create_invite(p_kind text, p_target uuid, p_label text default null)
returns table (invite_id uuid, invite_token text, invite_expires_at timestamptz, invite_max_uses integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  recent integer;
  new_id uuid := gen_random_uuid();
  new_token text := replace(gen_random_uuid()::text, '-', '');
  clean_label text := left(nullif(btrim(coalesce(p_label, '')), ''), 40);
begin
  if uid is null then
    raise exception 'Sign in to invite people.' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;

  if p_kind = 'trip' then
    if not public.is_group_member(p_target) then
      raise exception 'You are not in that trip.' using errcode = '42501';
    end if;
    if exists (select 1 from public.groups g where g.id = p_target and g.archived_at is not null) then
      raise exception 'That trip is archived.' using errcode = '22023';
    end if;
  elsif p_kind = 'circle' then
    if not public.is_circle_member(p_target) then
      raise exception 'You are not in that circle.' using errcode = '42501';
    end if;
    if exists (select 1 from public.circles c where c.id = p_target and c.archived_at is not null) then
      raise exception 'That circle is archived.' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown invite type.' using errcode = '22023';
  end if;

  recent := (
    select count(*) from public.invites i
    where i.inviter_id = uid and i.created_at > now() - interval '1 day'
  );
  if recent >= 20 then
    raise exception 'You have made a lot of invites today. Try again tomorrow.' using errcode = '54000';
  end if;

  insert into public.invites (id, token, kind, group_id, circle_id, inviter_id, label)
  values (
    new_id, new_token, p_kind,
    case when p_kind = 'trip' then p_target end,
    case when p_kind = 'circle' then p_target end,
    uid, clean_label
  );

  return query
    select i.id, i.token, i.expires_at, i.max_uses
    from public.invites i where i.id = new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- preview_invite: what the join screen shows. Safe for anyone, signed in or not.
-- ---------------------------------------------------------------------------
-- state is one of: ok, already_member, revoked, removed, expired, full, archived,
-- not_found. Counts a real open of the join screen.

create or replace function public.preview_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.invites;
  target_id uuid;
  target_name text;
  target_archived boolean;
  target_banner text;
  is_member boolean := false;
  accepted_before boolean := false;
  used integer;
  inviter_gone boolean;
  result_state text;
begin
  if p_token is null or length(p_token) > 64 then
    return jsonb_build_object('state', 'not_found');
  end if;

  inv := (select i from public.invites i where i.token = p_token);
  if inv.id is null then
    return jsonb_build_object('state', 'not_found');
  end if;

  if inv.kind = 'trip' then
    target_id := inv.group_id;
    target_name := (select g.name from public.groups g where g.id = inv.group_id);
    target_banner := (select g.banner_path from public.groups g where g.id = inv.group_id);
    target_archived := coalesce((select g.archived_at is not null from public.groups g where g.id = inv.group_id), true);
    if uid is not null then
      is_member := exists (select 1 from public.group_members gm where gm.group_id = inv.group_id and gm.user_id = uid);
    end if;
  else
    target_id := inv.circle_id;
    target_name := (select c.name from public.circles c where c.id = inv.circle_id);
    target_banner := (select c.banner_path from public.circles c where c.id = inv.circle_id);
    target_archived := coalesce((select c.archived_at is not null from public.circles c where c.id = inv.circle_id), true);
    if uid is not null then
      is_member := exists (select 1 from public.circle_members cm where cm.circle_id = inv.circle_id and cm.user_id = uid);
    end if;
  end if;

  if uid is not null then
    accepted_before := exists (select 1 from public.invite_accepts a where a.invite_id = inv.id and a.user_id = uid);
  end if;
  used := (select count(*) from public.invite_accepts a where a.invite_id = inv.id);
  -- A suspended inviter's links stop working.
  inviter_gone := coalesce((select u.banned_until is not null and u.banned_until > now() from auth.users u where u.id = inv.inviter_id), false);

  result_state :=
    case
      when is_member then 'already_member'
      when inv.revoked_at is not null or inviter_gone then 'revoked'
      when accepted_before then 'removed'
      when inv.expires_at <= now() then 'expired'
      when used >= inv.max_uses then 'full'
      when target_archived then 'archived'
      else 'ok'
    end;

  update public.invites set open_count = open_count + 1 where id = inv.id;

  return jsonb_build_object(
    'state', result_state,
    'kind', inv.kind,
    'name', target_name,
    'icon_seed', target_id,
    -- The trip's own cover photo, if it has one. The banner storage buckets are
    -- public already, so this reveals nothing new to someone holding the link.
    'banner_path', target_banner,
    'inviter_first_name', (select split_part(p.display_name, ' ', 1) from public.profiles p where p.id = inv.inviter_id),
    'inviter_avatar_path', (select p.avatar_path from public.profiles p where p.id = inv.inviter_id),
    -- Only for someone already in it, so the app can open it for them.
    'target_id', case when is_member then target_id end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invite: join with a link
-- ---------------------------------------------------------------------------

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.invites;
  target_id uuid;
  target_name text;
  target_archived boolean;
  is_member boolean;
  used integer;
  inviter_gone boolean;
  is_new boolean;
begin
  if uid is null then
    raise exception 'Sign in to join.' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) > 64 then
    raise exception 'That invite link is not valid.' using errcode = '22023';
  end if;

  inv := (select i from public.invites i where i.token = p_token);
  if inv.id is null then
    raise exception 'That invite link is not valid.' using errcode = '22023';
  end if;

  -- Serialise acceptances of one link so the limit cannot be passed.
  perform 1 from public.invites i where i.id = inv.id for update;

  if inv.kind = 'trip' then
    target_id := inv.group_id;
    target_name := (select g.name from public.groups g where g.id = inv.group_id);
    target_archived := coalesce((select g.archived_at is not null from public.groups g where g.id = inv.group_id), true);
    is_member := exists (select 1 from public.group_members gm where gm.group_id = inv.group_id and gm.user_id = uid);
  else
    target_id := inv.circle_id;
    target_name := (select c.name from public.circles c where c.id = inv.circle_id);
    target_archived := coalesce((select c.archived_at is not null from public.circles c where c.id = inv.circle_id), true);
    is_member := exists (select 1 from public.circle_members cm where cm.circle_id = inv.circle_id and cm.user_id = uid);
  end if;

  -- Already in: nothing to do, and no use of the link is consumed.
  if is_member then
    return jsonb_build_object('kind', inv.kind, 'target_id', target_id, 'name', target_name, 'already_member', true);
  end if;

  inviter_gone := coalesce((select u.banned_until is not null and u.banned_until > now() from auth.users u where u.id = inv.inviter_id), false);
  if inv.revoked_at is not null or inviter_gone then
    raise exception 'This invite has been turned off.' using errcode = '22023';
  end if;
  if exists (select 1 from public.invite_accepts a where a.invite_id = inv.id and a.user_id = uid) then
    raise exception 'You were removed from this, so this link cannot be used again. Ask the person who runs it.' using errcode = '42501';
  end if;
  if inv.expires_at <= now() then
    raise exception 'This invite has expired.' using errcode = '22023';
  end if;
  used := (select count(*) from public.invite_accepts a where a.invite_id = inv.id);
  if used >= inv.max_uses then
    raise exception 'This invite has already been used by as many people as it allows.' using errcode = '22023';
  end if;
  if target_archived then
    raise exception 'This has been archived.' using errcode = '22023';
  end if;

  if inv.kind = 'trip' then
    insert into public.group_members (group_id, user_id)
    values (inv.group_id, uid)
    on conflict (group_id, user_id) do nothing;
  else
    insert into public.circle_members (circle_id, user_id)
    values (inv.circle_id, uid)
    on conflict (circle_id, user_id) do nothing;
  end if;

  is_new := coalesce((select p.created_at > now() - interval '1 day' from public.profiles p where p.id = uid), false);
  insert into public.invite_accepts (invite_id, user_id, new_account)
  values (inv.id, uid, is_new)
  on conflict (invite_id, user_id) do nothing;

  return jsonb_build_object('kind', inv.kind, 'target_id', target_id, 'name', target_name, 'already_member', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_invite_shared: record when and how the inviter sent the link
-- ---------------------------------------------------------------------------
-- The first value wins. Someone else's link is silently left alone.

create or replace function public.mark_invite_shared(p_id uuid, p_how text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_how is null or p_how not in ('share', 'whatsapp', 'email', 'copy') then
    raise exception 'Unknown way of sharing.' using errcode = '22023';
  end if;
  if auth.uid() is null then
    return;
  end if;
  update public.invites
  set shared_at = coalesce(shared_at, now()),
      shared_via = coalesce(shared_via, p_how)
  where id = p_id and inviter_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on function public.create_invite(text, uuid, text) from public, anon;
revoke all on function public.preview_invite(text) from public;
revoke all on function public.accept_invite(text) from public, anon;
revoke all on function public.mark_invite_shared(uuid, text) from public, anon;

grant execute on function public.create_invite(text, uuid, text) to authenticated;
grant execute on function public.preview_invite(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.mark_invite_shared(uuid, text) to authenticated;

notify pgrst, 'reload schema';
