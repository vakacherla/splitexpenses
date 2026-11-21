-- Security fix: a regular group member could self-promote to manager.
--
-- "group_members: update own nickname" (migration 009) lets a member
-- update their own group_members row, with no column restriction despite
-- the name -- it was only ever narrowed by the group_members_guard_identity
-- trigger pinning group_id/user_id/joined_at. is_manager (added later, in
-- migration 013) was never added to that pin list. Postgres OR's every
-- permissive policy on a table together, so the separate, correctly
-- creator-only "group_members: creator can appoint managers" policy did
-- NOT narrow this -- a member could run
--   supabase.from('group_members').update({is_manager:true})
--     .eq('group_id', gid).eq('user_id', ownUid)
-- which the "own nickname" policy allows on its own, then use the
-- resulting is_manager=true to edit/delete other members' expenses,
-- remove regular members, and rename/archive/re-banner the trip via
-- is_group_manager().
--
-- Fix: extend the existing identity-guard trigger (same pattern it
-- already uses for group_id/user_id/joined_at) to also pin is_manager
-- back to its old value, UNLESS the caller is the group's actual
-- creator -- the one case that's supposed to be able to change it, via
-- "group_members: creator can appoint managers". This is enforced in
-- the trigger itself rather than in RLS, so it holds regardless of which
-- policy let the UPDATE through.
--
-- Run this once in the SQL Editor of your existing project.

create or replace function public.prevent_group_membership_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.group_id := old.group_id;
  new.user_id := old.user_id;
  new.joined_at := old.joined_at;

  if new.is_manager is distinct from old.is_manager
     and not exists (
       select 1 from public.groups g
       where g.id = new.group_id and g.created_by = auth.uid()
     )
  then
    new.is_manager := old.is_manager;
  end if;

  return new;
end;
$$;
