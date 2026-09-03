-- Grants a group's own creator (its de facto "owner") the ability to
-- delete their own group and remove a member from it — rename already
-- worked (an existing policy), it just had no UI yet. Nothing here
-- touches the platform-admin layer, which still sees and can do
-- everything regardless of group ownership.
--
-- Run this once in the SQL Editor of your existing project.

drop policy if exists "groups: creator can delete" on public.groups;
create policy "groups: creator can delete" on public.groups
  for delete using (auth.uid() = created_by);

drop policy if exists "group_members: creator can remove a member" on public.group_members;
create policy "group_members: creator can remove a member" on public.group_members
  for delete using (
    exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );
