-- Lets an existing Trip be organized into a Circle after the fact, and
-- back out again — no forced choice at creation time, no migration of
-- anything already in use. Attaching is purely organizational: it never
-- touches that Trip's existing group_members rows. The Circle's other
-- members just gain the ability to see the Trip exists (per migration
-- 031's "circle members can view sibling trips" policy) and ask to join
-- it, same as a Trip created inside the Circle from scratch.
--
-- Two self-service RPCs (gated on being that Trip's own owner/manager,
-- same bar as renaming or duplicating it) plus one super-admin twin —
-- admin_attach_group_to_circle mirrors admin_add_user_to_group
-- (018_admin_add_to_group_and_duplicate_group.sql) exactly: a super
-- admin can organize *any* existing group into *any* circle centrally,
-- without needing to individually be a manager of each one or a member
-- of each target circle first — useful for reorganizing a backlog of
-- pre-existing groups in one sitting.
--
-- Run this once in the SQL Editor of your existing project.

create or replace function public.attach_trip_to_circle(target_group_id uuid, target_circle_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_group public.groups;
begin
  if not public.is_group_manager(target_group_id) then
    raise exception 'Only this trip''s owner or a manager can attach it to a circle.';
  end if;

  if not public.is_circle_member(target_circle_id) then
    raise exception 'You must be a member of this circle to attach a trip to it.';
  end if;

  update public.groups set circle_id = target_circle_id where id = target_group_id
  returning * into updated_group;

  return updated_group;
end;
$$;

create or replace function public.detach_trip_from_circle(target_group_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_group public.groups;
begin
  if not public.is_group_manager(target_group_id) then
    raise exception 'Only this trip''s owner or a manager can detach it from its circle.';
  end if;

  update public.groups set circle_id = null where id = target_group_id
  returning * into updated_group;

  return updated_group;
end;
$$;

create or replace function public.admin_attach_group_to_circle(target_group_id uuid, target_circle_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_group public.groups;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can do this.';
  end if;

  update public.groups set circle_id = target_circle_id where id = target_group_id
  returning * into updated_group;

  if not found then
    raise exception 'Group not found.';
  end if;

  return updated_group;
end;
$$;
