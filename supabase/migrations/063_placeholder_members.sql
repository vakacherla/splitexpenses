-- Placeholder members (REQ-MOB-06, option A): add someone who has not joined yet.
--
-- A placeholder is a real but passwordless account (created by the add-placeholder
-- Edge Function), flagged profiles.is_placeholder. It is a normal trip member, so
-- expenses, splits and balances need no changes. When the real person accepts an
-- invite made for that placeholder, claim_placeholder() moves everything the
-- placeholder paid, owed and settled to them in one transaction, then removes the
-- placeholder.
--
-- What changes
--   profiles   + is_placeholder, claimed_into, placeholder_group, placeholder_added_by
--              + a guard so only the server can set those flags
--   invites    + placeholder_id (a link "for" one placeholder; one use)
--   create_invite   gains an optional p_placeholder
--   preview_invite  also returns placeholder_name
--   accept_invite   claims the placeholder (also when the person is already in the trip: merge)
--   register_placeholder()  server-only: flags the new account and adds it to the trip
--   claim_placeholder()     internal: the move
--   usage_eligible()        placeholders never count as users in usage reports
--
-- Safe to run more than once. Apply to staging first (owner's OK). Not yet on production.

-- ---------------------------------------------------------------------------
-- 1. Columns and a guard on them
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists is_placeholder boolean not null default false;
alter table public.profiles add column if not exists claimed_into uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists placeholder_group uuid;
alter table public.profiles add column if not exists placeholder_added_by uuid;
create index if not exists idx_profiles_placeholder_group on public.profiles (placeholder_group) where is_placeholder;

alter table public.invites add column if not exists placeholder_id uuid references public.profiles (id) on delete set null;

-- Signed-in people can update their own profile row, so the flags must be locked
-- to the server: a person could otherwise hide themselves from admin counts. Server
-- code (security definer functions, the service role) runs as another database role.
create or replace function public.guard_placeholder_flags()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_placeholder := false;
      new.claimed_into := null;
      new.placeholder_group := null;
      new.placeholder_added_by := null;
    elsif new.is_placeholder is distinct from old.is_placeholder
       or new.claimed_into is distinct from old.claimed_into
       or new.placeholder_group is distinct from old.placeholder_group
       or new.placeholder_added_by is distinct from old.placeholder_added_by then
      raise exception 'Not allowed.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_placeholder_flags on public.profiles;
create trigger guard_placeholder_flags
  before insert or update on public.profiles
  for each row execute function public.guard_placeholder_flags();

-- ---------------------------------------------------------------------------
-- 2. Usage reports never count placeholders
-- ---------------------------------------------------------------------------

create or replace function public.usage_eligible(p_exclude boolean)
returns table (id uuid, display_name text, avatar_path text, created_at timestamptz, share_usage boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_path, p.created_at, p.share_usage
  from public.profiles p
  where not p.is_placeholder
    and (not coalesce(p_exclude, true)
         or (not p.is_admin
             and p.email not ilike '%@example.com'
             and p.display_name not ilike 'E2E-TEST%'));
$$;

-- ---------------------------------------------------------------------------
-- 3. register_placeholder: server only
-- ---------------------------------------------------------------------------
-- Called by the add-placeholder Edge Function with the service role, after it has
-- created the passwordless account. Checks the person adding is in the trip, the
-- trip is open, and the limits (20 placeholders waiting per trip, 20 added per
-- person per day), then flags the account and adds it to the trip.

create or replace function public.register_placeholder(p_user uuid, p_group uuid, p_name text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := left(btrim(coalesce(p_name, '')), 40);
begin
  if clean = '' then
    raise exception 'Give the person a name.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.group_members gm where gm.group_id = p_group and gm.user_id = p_actor) then
    raise exception 'You are not in that trip.' using errcode = '42501';
  end if;
  if exists (select 1 from public.groups g where g.id = p_group and g.archived_at is not null) then
    raise exception 'That trip is archived.' using errcode = '22023';
  end if;
  if (select count(*) from public.profiles p where p.is_placeholder and p.claimed_into is null and p.placeholder_group = p_group) >= 20 then
    raise exception 'This trip already has 20 people waiting to join.' using errcode = '54000';
  end if;
  if (select count(*) from public.profiles p where p.is_placeholder and p.placeholder_added_by = p_actor and p.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have added a lot of people today. Try again tomorrow.' using errcode = '54000';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and not p.is_placeholder) then
    raise exception 'That account is not available.' using errcode = '22023';
  end if;

  update public.profiles
     set is_placeholder = true,
         display_name = clean,
         email = 'not-joined-' || substr(p_user::text, 1, 8) || '@placeholder.invalid',
         placeholder_group = p_group,
         placeholder_added_by = p_actor
   where id = p_user;

  insert into public.group_members (group_id, user_id) values (p_group, p_user)
  on conflict (group_id, user_id) do nothing;

  return jsonb_build_object('id', p_user, 'display_name', clean);
end;
$$;

revoke all on function public.register_placeholder(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.register_placeholder(uuid, uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. claim_placeholder: the move (internal)
-- ---------------------------------------------------------------------------
-- Everything a placeholder paid, owed and settled in one trip becomes the real
-- person's, so every balance is exactly what it was. If the real person is already
-- in the same expense (merge), the two shares are added together. Settlements
-- between the two collapse to nothing (a payment to yourself changes no balance).

create or replace function public.claim_placeholder(p_placeholder uuid, p_real uuid, p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  real_in_config boolean;
begin
  if not exists (
    select 1 from public.profiles p
    join public.group_members gm on gm.user_id = p.id and gm.group_id = p_group
    where p.id = p_placeholder and p.is_placeholder and p.claimed_into is null
  ) then
    raise exception 'That person is not waiting to join this trip.' using errcode = '22023';
  end if;
  if p_placeholder = p_real then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  insert into public.group_members (group_id, user_id) values (p_group, p_real)
  on conflict (group_id, user_id) do nothing;

  -- Expenses they paid or entered.
  update public.expenses set paid_by = p_real where group_id = p_group and paid_by = p_placeholder;
  update public.expenses set created_by = p_real where group_id = p_group and created_by = p_placeholder;

  -- Shares: add into the real person's row where they already share an expense, then move the rest.
  update public.expense_splits r
     set share_amount = r.share_amount + p.share_amount,
         share_in_home = r.share_in_home + p.share_in_home,
         percentage = case when r.percentage is null and p.percentage is null then null else coalesce(r.percentage, 0) + coalesce(p.percentage, 0) end,
         share_units = case when r.share_units is null and p.share_units is null then null else coalesce(r.share_units, 0) + coalesce(p.share_units, 0) end,
         adjustment = case when r.adjustment is null and p.adjustment is null then null else coalesce(r.adjustment, 0) + coalesce(p.adjustment, 0) end
    from public.expense_splits p
    join public.expenses e on e.id = p.expense_id and e.group_id = p_group
   where p.user_id = p_placeholder and r.user_id = p_real and r.expense_id = p.expense_id;

  delete from public.expense_splits p
   using public.expenses e
   where p.user_id = p_placeholder and e.id = p.expense_id and e.group_id = p_group
     and exists (select 1 from public.expense_splits r where r.expense_id = p.expense_id and r.user_id = p_real);

  update public.expense_splits s set user_id = p_real
    from public.expenses e
   where s.user_id = p_placeholder and e.id = s.expense_id and e.group_id = p_group;

  -- Itemized expenses remember who shared each item (a list of ids inside the row).
  update public.expenses e
     set items = (
       select coalesce(jsonb_agg(
         jsonb_set(it, '{participant_ids}', (
           select coalesce(jsonb_agg(distinct case when v = to_jsonb(p_placeholder::text) then to_jsonb(p_real::text) else v end), '[]'::jsonb)
             from jsonb_array_elements(coalesce(it -> 'participant_ids', '[]'::jsonb)) v
         ))
       ), '[]'::jsonb)
       from jsonb_array_elements(e.items) it
     )
   where e.group_id = p_group and e.items is not null and e.items::text like '%' || p_placeholder::text || '%';

  -- A saved default split that names the placeholder is dropped rather than guessed at.
  update public.groups set default_split = null
   where id = p_group and default_split is not null and default_split::text like '%' || p_placeholder::text || '%';

  -- Settlements: any between the two disappear, the rest move.
  delete from public.settlements
   where group_id = p_group
     and ((from_user = p_placeholder and to_user = p_real) or (from_user = p_real and to_user = p_placeholder));
  update public.settlements set from_user = p_real where group_id = p_group and from_user = p_placeholder;
  update public.settlements set to_user = p_real where group_id = p_group and to_user = p_placeholder;
  update public.settlements set created_by = p_real where group_id = p_group and created_by = p_placeholder;

  update public.activity_events set actor_id = p_real where group_id = p_group and actor_id = p_placeholder;

  delete from public.group_members where group_id = p_group and user_id = p_placeholder;

  -- Remove the placeholder account. If anything still points at it, keep it hidden
  -- (claimed_into set) instead of failing the join.
  begin
    delete from auth.users where id = p_placeholder;
  exception when others then
    update public.profiles set claimed_into = p_real where id = p_placeholder;
  end;
end;
$$;

revoke all on function public.claim_placeholder(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Invite functions with placeholder support (054 versions plus the changes)
-- ---------------------------------------------------------------------------

drop function if exists public.create_invite(text, uuid, text);

create or replace function public.create_invite(p_kind text, p_target uuid, p_label text default null, p_placeholder uuid default null)
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
  ph_ok boolean;
begin
  if uid is null then
    raise exception 'Sign in to invite people.' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;

  if p_placeholder is not null and p_kind <> 'trip' then
    raise exception 'A placeholder can only be invited to a trip.' using errcode = '22023';
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

  if p_placeholder is not null then
    -- The person must be a not-yet-claimed placeholder in THIS trip.
    ph_ok := exists (
      select 1 from public.profiles p
      join public.group_members gm on gm.user_id = p.id and gm.group_id = p_target
      where p.id = p_placeholder and p.is_placeholder and p.claimed_into is null
    );
    if not ph_ok then
      raise exception 'That person is not waiting to join this trip.' using errcode = '22023';
    end if;
  end if;

  insert into public.invites (id, token, kind, group_id, circle_id, inviter_id, label, placeholder_id, max_uses)
  values (
    new_id, new_token, p_kind,
    case when p_kind = 'trip' then p_target end,
    case when p_kind = 'circle' then p_target end,
    uid, clean_label, p_placeholder,
    case when p_placeholder is null then 20 else 1 end
  );

  return query
    select i.id, i.token, i.expires_at, i.max_uses
    from public.invites i where i.id = new_id;
end;
$$;

create or replace function public.preview_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv_id uuid;
  inv_kind text;
  inv_group uuid;
  inv_circle uuid;
  inv_inviter uuid;
  inv_revoked timestamptz;
  inv_expires timestamptz;
  inv_max integer;
  target_id uuid;
  target_name text;
  target_archived boolean;
  target_banner text;
  is_member boolean := false;
  accepted_before boolean := false;
  used integer;
  inviter_gone boolean;
  result_state text;
  ph_name text;
  ph_pending boolean := false;
begin
  if p_token is null or length(p_token) > 64 then
    return jsonb_build_object('state', 'not_found');
  end if;

  inv_id := (select i.id from public.invites i where i.token = p_token);
  if inv_id is not null then
    inv_kind := (select i.kind from public.invites i where i.id = inv_id);
    inv_group := (select i.group_id from public.invites i where i.id = inv_id);
    inv_circle := (select i.circle_id from public.invites i where i.id = inv_id);
    inv_inviter := (select i.inviter_id from public.invites i where i.id = inv_id);
    inv_revoked := (select i.revoked_at from public.invites i where i.id = inv_id);
    inv_expires := (select i.expires_at from public.invites i where i.id = inv_id);
    inv_max := (select i.max_uses from public.invites i where i.id = inv_id);
    ph_name := (select p.display_name from public.invites i join public.profiles p on p.id = i.placeholder_id
                where i.id = inv_id and p.is_placeholder and p.claimed_into is null);
  end if;
  if inv_id is null then
    return jsonb_build_object('state', 'not_found');
  end if;

  if inv_kind = 'trip' then
    target_id := inv_group;
    target_name := (select g.name from public.groups g where g.id = inv_group);
    target_banner := (select g.banner_path from public.groups g where g.id = inv_group);
    target_archived := coalesce((select g.archived_at is not null from public.groups g where g.id = inv_group), true);
    if uid is not null then
      is_member := exists (select 1 from public.group_members gm where gm.group_id = inv_group and gm.user_id = uid);
    end if;
  else
    target_id := inv_circle;
    target_name := (select c.name from public.circles c where c.id = inv_circle);
    target_banner := (select c.banner_path from public.circles c where c.id = inv_circle);
    target_archived := coalesce((select c.archived_at is not null from public.circles c where c.id = inv_circle), true);
    if uid is not null then
      is_member := exists (select 1 from public.circle_members cm where cm.circle_id = inv_circle and cm.user_id = uid);
    end if;
  end if;

  if uid is not null then
    accepted_before := exists (select 1 from public.invite_accepts a where a.invite_id = inv_id and a.user_id = uid);
  end if;
  used := (select count(*) from public.invite_accepts a where a.invite_id = inv_id);
  -- A suspended inviter's links stop working.
  inviter_gone := coalesce((select u.banned_until is not null and u.banned_until > now() from auth.users u where u.id = inv_inviter), false);

  -- A placeholder link still offers the claim to someone already in the trip (the merge case).
  if ph_name is not null and uid is not null then
    ph_pending := not accepted_before;
  end if;

  result_state :=
    case
      when is_member and not ph_pending then 'already_member'
      when inv_revoked is not null or inviter_gone then 'revoked'
      when accepted_before then 'removed'
      when inv_expires <= now() then 'expired'
      when used >= inv_max then 'full'
      when target_archived then 'archived'
      else 'ok'
    end;

  update public.invites set open_count = open_count + 1 where id = inv_id;

  return jsonb_build_object(
    'state', result_state,
    'kind', inv_kind,
    'name', target_name,
    'icon_seed', target_id,
    -- The trip's own cover photo, if it has one. The banner storage buckets are
    -- public already, so this reveals nothing new to someone holding the link.
    'banner_path', target_banner,
    'inviter_first_name', (select split_part(p.display_name, ' ', 1) from public.profiles p where p.id = inv_inviter),
    'inviter_avatar_path', (select p.avatar_path from public.profiles p where p.id = inv_inviter),
    -- Only for someone already in it, so the app can open it for them.
    'target_id', case when is_member then target_id end,
    -- Set when this link is for a person who was added to the trip before joining.
    'placeholder_name', ph_name,
    -- True when the person is already in the trip, so the app can word it as a link-up rather than a join.
    'already_member', is_member
  );
end;
$$;

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv_id uuid;
  inv_kind text;
  inv_group uuid;
  inv_circle uuid;
  inv_inviter uuid;
  inv_revoked timestamptz;
  inv_expires timestamptz;
  inv_max integer;
  target_id uuid;
  target_name text;
  target_archived boolean;
  is_member boolean;
  used integer;
  inviter_gone boolean;
  is_new boolean;
  inv_placeholder uuid;
  ph_pending boolean := false;
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

  inv_id := (select i.id from public.invites i where i.token = p_token);
  if inv_id is not null then
    inv_kind := (select i.kind from public.invites i where i.id = inv_id);
    inv_group := (select i.group_id from public.invites i where i.id = inv_id);
    inv_circle := (select i.circle_id from public.invites i where i.id = inv_id);
    inv_inviter := (select i.inviter_id from public.invites i where i.id = inv_id);
    inv_revoked := (select i.revoked_at from public.invites i where i.id = inv_id);
    inv_expires := (select i.expires_at from public.invites i where i.id = inv_id);
    inv_max := (select i.max_uses from public.invites i where i.id = inv_id);
    inv_placeholder := (select i.placeholder_id from public.invites i where i.id = inv_id);
  end if;
  if inv_id is null then
    raise exception 'That invite link is not valid.' using errcode = '22023';
  end if;

  -- Serialise acceptances of one link so the limit cannot be passed.
  perform 1 from public.invites i where i.id = inv_id for update;

  if inv_kind = 'trip' then
    target_id := inv_group;
    target_name := (select g.name from public.groups g where g.id = inv_group);
    target_archived := coalesce((select g.archived_at is not null from public.groups g where g.id = inv_group), true);
    is_member := exists (select 1 from public.group_members gm where gm.group_id = inv_group and gm.user_id = uid);
  else
    target_id := inv_circle;
    target_name := (select c.name from public.circles c where c.id = inv_circle);
    target_archived := coalesce((select c.archived_at is not null from public.circles c where c.id = inv_circle), true);
    is_member := exists (select 1 from public.circle_members cm where cm.circle_id = inv_circle and cm.user_id = uid);
  end if;

  -- A link made for a placeholder is still worth claiming if the person is already in
  -- the trip (the merge case); otherwise "already in" has nothing to do.
  if inv_placeholder is not null and inv_kind = 'trip' then
    ph_pending := exists (
      select 1 from public.profiles p
      where p.id = inv_placeholder and p.is_placeholder and p.claimed_into is null
    ) and not exists (select 1 from public.invite_accepts a where a.invite_id = inv_id and a.user_id = uid);
  end if;

  -- Already in: nothing to do, and no use of the link is consumed.
  if is_member and not ph_pending then
    return jsonb_build_object('kind', inv_kind, 'target_id', target_id, 'name', target_name, 'already_member', true);
  end if;

  inviter_gone := coalesce((select u.banned_until is not null and u.banned_until > now() from auth.users u where u.id = inv_inviter), false);
  if inv_revoked is not null or inviter_gone then
    raise exception 'This invite has been turned off.' using errcode = '22023';
  end if;
  if exists (select 1 from public.invite_accepts a where a.invite_id = inv_id and a.user_id = uid) then
    raise exception 'You were removed from this, so this link cannot be used again. Ask the person who runs it.' using errcode = '42501';
  end if;
  if inv_expires <= now() then
    raise exception 'This invite has expired.' using errcode = '22023';
  end if;
  used := (select count(*) from public.invite_accepts a where a.invite_id = inv_id);
  if used >= inv_max then
    raise exception 'This invite has already been used by as many people as it allows.' using errcode = '22023';
  end if;
  if target_archived then
    raise exception 'This has been archived.' using errcode = '22023';
  end if;

  if inv_kind = 'trip' then
    insert into public.group_members (group_id, user_id)
    values (inv_group, uid)
    on conflict (group_id, user_id) do nothing;
    if ph_pending then
      perform public.claim_placeholder(inv_placeholder, uid, inv_group);
    end if;
  else
    insert into public.circle_members (circle_id, user_id)
    values (inv_circle, uid)
    on conflict (circle_id, user_id) do nothing;
  end if;

  is_new := coalesce((select p.created_at > now() - interval '1 day' from public.profiles p where p.id = uid), false);
  insert into public.invite_accepts (invite_id, user_id, new_account)
  values (inv_id, uid, is_new)
  on conflict (invite_id, user_id) do nothing;

  return jsonb_build_object('kind', inv_kind, 'target_id', target_id, 'name', target_name, 'already_member', false, 'claimed_placeholder', ph_pending);
end;
$$;

revoke all on function public.create_invite(text, uuid, text, uuid) from public, anon;
grant execute on function public.create_invite(text, uuid, text, uuid) to authenticated;
revoke all on function public.preview_invite(text) from public;
grant execute on function public.preview_invite(text) to anon, authenticated;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

notify pgrst, 'reload schema';
