-- Part 2 of the invite-links migration (054), for pasting into the Supabase SQL editor
-- one piece at a time if the editor stops partway through the whole file. Run the parts in
-- order. Each part is safe to run more than once. This part: preview_invite.

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

  result_state :=
    case
      when is_member then 'already_member'
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
    'target_id', case when is_member then target_id end
  );
end;
$$;


revoke all on function public.preview_invite(text) from public;
grant execute on function public.preview_invite(text) to anon, authenticated;

notify pgrst, 'reload schema';
