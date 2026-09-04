-- Two roadmap items from the "Now" list:
--
-- 1. admin_add_user_to_group — closes a real gap: creating an account and
--    joining a group are two separate steps (self-service
--    join_group_by_code only). Someone who signs up and never gets/uses an
--    invite code sits with zero groups indefinitely, and no admin action
--    could place them into one. Super-admin-only, bypasses the invite code
--    entirely. (Its removal counterpart, admin_remove_user_from_group,
--    followed shortly after in migration 019 — see that file.)
--
-- 2. duplicate_group — "same people, next trip" without re-inviting
--    everyone from scratch. Copies membership (including manager roles)
--    and home currency into a fresh group with its own new invite code;
--    deliberately leaves expenses, settlements, and trip dates behind —
--    it's a new trip, not a continuation. Same permission bar as renaming
--    or archiving a group (creator or manager), not admin-only.
--
-- Run this once in the SQL Editor of your existing project.

create or replace function public.admin_add_user_to_group(target_user_id uuid, target_group_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
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

  return g;
end;
$$;

create or replace function public.duplicate_group(source_group_id uuid, new_name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  src public.groups;
  new_group public.groups;
begin
  select * into src from public.groups where id = source_group_id;
  if not found then
    raise exception 'Group not found.';
  end if;

  if not public.is_group_manager(source_group_id) then
    raise exception 'Only this group''s owner or a manager can duplicate it.';
  end if;

  insert into public.groups (name, home_currency, created_by)
  values (coalesce(nullif(trim(new_name), ''), src.name || ' (copy)'), src.home_currency, auth.uid())
  returning * into new_group;

  -- The caller ends up the new group's owner via created_by above no
  -- matter what role they held on the source group — copying their
  -- source-group is_manager flag here too would be redundant at best and
  -- confusing at worst, so it's forced false for their own row while
  -- every other member's role (including manager) carries over exactly.
  insert into public.group_members (group_id, user_id, nickname, is_manager)
  select new_group.id, gm.user_id, gm.nickname,
    case when gm.user_id = auth.uid() then false else gm.is_manager end
  from public.group_members gm
  where gm.group_id = source_group_id;

  return new_group;
end;
$$;

notify pgrst, 'reload schema';
