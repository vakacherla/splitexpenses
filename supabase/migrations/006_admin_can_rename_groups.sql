-- Lets a platform admin update any group (currently used for renaming from
-- the Admin page). The existing "creator can update" policy is untouched —
-- this just adds a second path in, gated on is_admin.

drop policy if exists "groups: admin can update" on public.groups;
create policy "groups: admin can update" on public.groups
  for update using (public.is_platform_admin());
