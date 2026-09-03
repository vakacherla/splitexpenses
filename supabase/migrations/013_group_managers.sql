-- Lets a group's creator name another member as a "manager" of that one
-- group — same operational powers (rename, remove a regular member,
-- archive), scoped to just that group. Appointing/revoking a manager
-- stays creator-only; a manager can't touch another manager's status or
-- the creator's own membership. None of this touches the platform
-- admin/super-admin layer — it's entirely local to one group.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.group_members
  add column if not exists is_manager boolean not null default false;

create or replace function public.is_group_manager(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.groups g where g.id = gid and g.created_by = auth.uid()
  ) or exists (
    select 1 from public.group_members gm
    where gm.group_id = gid and gm.user_id = auth.uid() and gm.is_manager
  );
$$;

drop policy if exists "groups: creator can update" on public.groups;
drop policy if exists "groups: creator or manager can update" on public.groups;
create policy "groups: creator or manager can update" on public.groups
  for update using (public.is_group_manager(id));

drop policy if exists "group_members: creator can appoint managers" on public.group_members;
create policy "group_members: creator can appoint managers" on public.group_members
  for update using (
    exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

drop policy if exists "group_members: manager can remove a regular member" on public.group_members;
create policy "group_members: manager can remove a regular member" on public.group_members
  for delete using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id and gm.user_id = auth.uid() and gm.is_manager
    )
    and not group_members.is_manager
    and group_members.user_id <> (select created_by from public.groups g where g.id = group_members.group_id)
  );
