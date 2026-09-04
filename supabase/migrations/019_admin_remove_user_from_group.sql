-- Removal counterpart to admin_add_user_to_group (migration 018): the
-- group owner/manager removal path (group_members: creator/manager can
-- remove) doesn't cover it when a *super admin* is the one who put
-- someone in the wrong group by mistake — they need their own way to
-- undo it without needing to also be that group's owner/manager.
--
-- Deliberately skips the balance check the owner/manager path enforces
-- (computeNetBalances is a client-side computation, not a stored fact
-- this function could check) — this is an explicit admin correction
-- tool, not a self-service control surfaced to everyone, so the trust
-- bar is different.
--
-- Run this once in the SQL Editor of your existing project.

create or replace function public.admin_remove_user_from_group(target_user_id uuid, target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can remove a user from a group directly.';
  end if;

  delete from public.group_members
  where group_id = target_group_id and user_id = target_user_id;
end;
$$;

notify pgrst, 'reload schema';
