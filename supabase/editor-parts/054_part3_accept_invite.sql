-- Part 3 of the invite-links migration (054), for pasting into the Supabase SQL editor
-- one piece at a time if the editor stops partway through the whole file. Run the parts in
-- order. Each part is safe to run more than once. This part: accept_invite.

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

  -- Already in: nothing to do, and no use of the link is consumed.
  if is_member then
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
  else
    insert into public.circle_members (circle_id, user_id)
    values (inv_circle, uid)
    on conflict (circle_id, user_id) do nothing;
  end if;

  is_new := coalesce((select p.created_at > now() - interval '1 day' from public.profiles p where p.id = uid), false);
  insert into public.invite_accepts (invite_id, user_id, new_account)
  values (inv_id, uid, is_new)
  on conflict (invite_id, user_id) do nothing;

  return jsonb_build_object('kind', inv_kind, 'target_id', target_id, 'name', target_name, 'already_member', false);
end;
$$;


revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

notify pgrst, 'reload schema';
