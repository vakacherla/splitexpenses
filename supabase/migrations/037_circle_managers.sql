-- Circles had no appointed-manager concept in v1 (migration 031's own
-- comment: "no nickname, no appointed-manager flag... a circle's
-- creator is its only manager"). Needed now to support a real Circle
-- Settings page: a circle's creator should be able to deputize other
-- members the same way a Trip's creator can, so day-to-day membership
-- upkeep doesn't bottleneck on one person. Near-literal copy of
-- 013_group_managers.sql's pattern, applied to circles.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.circle_members
  add column if not exists is_manager boolean not null default false;

-- No change needed to prevent_circle_membership_tampering() (031) — it
-- only pins circle_id/user_id/joined_at, exactly so a future mutable
-- column like this one wouldn't need to reopen it.

create or replace function public.is_circle_manager(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.circles c where c.id = cid and c.created_by = auth.uid()
  ) or exists (
    select 1 from public.circle_members cm
    where cm.circle_id = cid and cm.user_id = auth.uid() and cm.is_manager
  );
$$;

-- Every existing policy already keyed off is_circle_manager
-- ("circles: creator can update") picks up appointed managers
-- automatically — no policy edit needed there.

create policy "circle_members: creator can appoint managers" on public.circle_members
  for update using (
    exists (select 1 from public.circles c where c.id = circle_id and c.created_by = auth.uid())
  );

create policy "circle_members: manager can remove a regular member" on public.circle_members
  for delete using (
    exists (
      select 1 from public.circle_members cm
      where cm.circle_id = circle_members.circle_id and cm.user_id = auth.uid() and cm.is_manager
    )
    and not circle_members.is_manager
    and circle_members.user_id <> (select created_by from public.circles c where c.id = circle_members.circle_id)
  );
