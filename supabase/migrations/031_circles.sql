-- A "Circle" is a new, optional parent above a Group ("Trip" in UI copy
-- scoped to Circle screens): join a family/friend circle once, then
-- create as many Trips inside it as you want without re-inviting anyone
-- each time. Deliberately fully backward-compatible — every existing
-- group gets circle_id = null and keeps working exactly as it does
-- today; nothing here is a forced migration.
--
-- Run this once in the SQL Editor of your existing project.

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default public.generate_invite_code(),
  created_by uuid not null references public.profiles (id),
  -- Soft-delete, same reasoning as groups.archived_at — but note archiving
  -- a circle does NOT hide its Trips; a Trip's own archived_at (on
  -- `groups`) is what controls that independently. This only affects
  -- whether the circle itself still shows up as joinable/browsable.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- Identity only for v1 — no nickname, no appointed-manager flag. A
-- circle's creator is its only manager (see is_circle_manager below).
create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

-- Nullable: a standalone Trip (the overwhelming majority of existing
-- rows, and every Trip ever created outside a Circle going forward) has
-- circle_id = null and is completely unaffected by anything in this
-- migration. `on delete set null`, never cascade — a Trip's expenses
-- must never be destroyed by anything happening to its parent Circle.
alter table public.groups add column if not exists circle_id uuid references public.circles (id) on delete set null;

-- Nothing is mutable on circle_members yet (no nickname/manager flag),
-- so this trigger is inert today — added now anyway, matching
-- prevent_group_membership_tampering()'s defense-in-depth convention,
-- so a future mutable column doesn't reopen the identity-rewrite hole
-- group_members already had to guard against.
create or replace function public.prevent_circle_membership_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.circle_id := old.circle_id;
  new.user_id := old.user_id;
  new.joined_at := old.joined_at;
  return new;
end;
$$;

drop trigger if exists circle_members_guard_identity on public.circle_members;
create trigger circle_members_guard_identity
  before update on public.circle_members
  for each row execute procedure public.prevent_circle_membership_tampering();

-- security definer + stable, same reasoning as is_group_member/
-- is_group_manager: avoids RLS recursion when used inside a policy on
-- the same table.
create or replace function public.is_circle_member(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = cid and user_id = auth.uid()
  );
$$;

-- Creator-only in v1 — no appointed circle managers (unlike groups,
-- which support both an owner and appointed managers). Revisit if that
-- turns out to matter in practice.
create or replace function public.is_circle_manager(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.circles c where c.id = cid and c.created_by = auth.uid()
  );
$$;

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;

create policy "circles: members can view" on public.circles
  for select using (
    (archived_at is null and (public.is_circle_member(id) or created_by = auth.uid()))
    or public.is_platform_admin()
  );

create policy "circles: authenticated users can create" on public.circles
  for insert with check (auth.uid() = created_by);

create policy "circles: creator can update" on public.circles
  for update using (public.is_circle_manager(id));

create policy "circles: admin can update" on public.circles
  for update using (public.is_platform_admin());

create policy "circles: admin can delete" on public.circles
  for delete using (public.is_platform_admin());

create policy "circle_members: members can view roster" on public.circle_members
  for select using (public.is_circle_member(circle_id) or public.is_platform_admin());

create policy "circle_members: creator adds self on circle creation" on public.circle_members
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.circles c where c.id = circle_id and c.created_by = auth.uid())
  );

create policy "circle_members: leave a circle" on public.circle_members
  for delete using (auth.uid() = user_id);

create policy "circle_members: creator can remove a member" on public.circle_members
  for delete using (
    exists (select 1 from public.circles c where c.id = circle_id and c.created_by = auth.uid())
  );

-- Companion policies on groups/group_members, added alongside the
-- existing ones (Postgres OR's multiple permissive policies together) —
-- these never narrow anything that already worked, they only add new
-- ways in for a Circle member.
--
-- Lets a Circle member browse the *existence* of every Trip in their
-- Circle (to decide whether to ask to join one) without automatically
-- granting roster/expense access — that stays keyed to an actual
-- group_members row, same as it is today for every other Trip.
create policy "groups: circle members can view sibling trips" on public.groups
  for select using (
    archived_at is null and circle_id is not null and public.is_circle_member(circle_id)
  );

-- Lets a Circle member add themself to a sibling Trip directly (a plain
-- insert from the client, no RPC needed) once they've decided to join
-- one they can see via the policy above.
create policy "group_members: circle member can join a sibling trip" on public.group_members
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.circle_id is not null and public.is_circle_member(g.circle_id)
    )
  );
