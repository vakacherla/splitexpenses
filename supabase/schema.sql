-- Split Expenses: shared expenses in multiple currencies
-- Run this whole file once in your Supabase project's SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run).

create extension if not exists "pgcrypto";

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  is_admin boolean not null default false,
  -- A super admin is also an admin, always — the constraint below makes
  -- that a database-level guarantee, not just something the app code
  -- happens to maintain. The distinction only controls one thing: who
  -- can grant or revoke admin status itself (see is_super_admin() and
  -- the admin-users function). Every other admin action stays available
  -- to any admin, super or not.
  is_super_admin boolean not null default false,
  constraint super_admin_requires_admin check (not is_super_admin or is_admin),
  payment_provider text check (payment_provider is null or payment_provider in ('upi', 'venmo', 'paypal')),
  payment_handle text,
  -- Path within the public "avatars" Storage bucket, e.g. "<user_id>.jpg".
  avatar_path text,
  -- Two numbers on purpose: many people travel on a local SIM that isn't
  -- their regular number, and group-mates need to know which one is live.
  phone_home text,
  phone_travel text,
  created_at timestamptz not null default now()
);

create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  home_currency text not null,
  invite_code text not null unique default public.generate_invite_code(),
  -- { participant_ids: uuid[], split_mode: 'equal'|'percentage', percentages: {user_id: number} | null }
  -- Applied as AddExpenseForm's starting point; never required, never
  -- touched by anything server-side.
  default_split jsonb,
  created_by uuid not null references public.profiles (id),
  -- Soft-delete: set instead of actually removing the row, so a group
  -- (and everything in it — expenses, splits, settlements, receipts) can
  -- come back exactly as it was. Nothing else needs to know this exists;
  -- excluding archived rows from the one "who can see this group" policy
  -- is enough to hide it everywhere the app would otherwise show it.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- Self-set, this group only — e.g. going by "Dad" here but your real
  -- name everywhere else. Null falls back to profiles.display_name.
  nickname text,
  -- Set only by the group's own creator (never by another manager — see
  -- is_group_manager below), never by the platform admin layer. A
  -- manager gets the same operational powers as the creator within this
  -- one group (rename, remove a regular member, archive) but not the
  -- power to appoint or remove other managers, and can't touch the
  -- creator's own membership.
  is_manager boolean not null default false,
  primary key (group_id, user_id)
);

-- The category list is intentionally a fixed, hand-picked set rather than a
-- per-group custom table — keeps reporting clean (no "Taxi" vs "taxi" vs
-- "Cab" fragmentation) and is simple to extend later: add a value here and
-- in src/lib/categories.js.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null,
  paid_by uuid not null references public.profiles (id),
  currency text not null,
  amount numeric not null check (amount > 0),
  exchange_rate numeric not null check (exchange_rate > 0),
  amount_in_home numeric not null check (amount_in_home > 0),
  expense_date date not null default current_date,
  split_type text not null default 'equal' check (split_type in ('equal', 'percentage', 'exact')),
  category text not null default 'Misc' check (
    category in ('Food', 'Lodging', 'Flights', 'Train', 'Taxi/Cab', 'Groceries', 'Shopping', 'Activities', 'Utilities', 'Misc')
  ),
  note text,
  -- Path within the private "receipts" Storage bucket, e.g.
  -- "<group_id>/<expense_id>.jpg". Null until a receipt photo is attached.
  receipt_path text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Soft-delete, same reasoning as groups.archived_at: "delete" from the
  -- Ledger now hides it and stops it counting toward anyone's balance,
  -- but leaves it recoverable — only the platform admin can permanently
  -- purge it (Admin → Trash).
  deleted_at timestamptz
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  share_amount numeric not null check (share_amount >= 0),
  share_in_home numeric not null check (share_in_home >= 0),
  percentage numeric check (percentage is null or (percentage >= 0 and percentage <= 100)),
  unique (expense_id, user_id)
);

-- A settlement can be paid in any currency; it's converted to the group's
-- home currency the same way an expense is, and both figures are kept.
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user uuid not null references public.profiles (id),
  to_user uuid not null references public.profiles (id),
  currency text not null,
  amount numeric not null check (amount > 0),
  exchange_rate numeric not null check (exchange_rate > 0),
  amount_in_home numeric not null check (amount_in_home > 0),
  note text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index if not exists idx_expenses_group on public.expenses (group_id);
create index if not exists idx_expenses_category on public.expenses (category);
create index if not exists idx_splits_expense on public.expense_splits (expense_id);
create index if not exists idx_settlements_group on public.settlements (group_id);
create index if not exists idx_members_user on public.group_members (user_id);

-- Submitted from the Help page. Anyone signed in can leave one; only a
-- platform admin sees the full list (Admin → Feedback) or changes status.
-- A submitter can see their own, so the Help page can show "here's what
-- you've asked for and where it stands" without needing admin access.
create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists idx_feature_requests_user on public.feature_requests (user_id);

-- ============================================================
-- Membership + admin helpers (SECURITY DEFINER avoids recursive RLS checks)
-- ============================================================

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- True for the group's creator OR anyone they've designated as a
-- manager. Used for the operational powers (rename, remove a regular
-- member, archive) that both share — appointing/revoking manager status
-- itself stays creator-only and is checked separately, not through this
-- function.
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

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  -- No need to also check is_admin here — the table constraint already
  -- guarantees is_super_admin never lands true without it.
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Blocks privilege escalation through the ordinary "update your own
-- profile" path: a non-admin who includes is_admin in a client-side update
-- (whether by accident or on purpose) has that part of the change silently
-- reverted rather than applied. Only an existing admin's own update can
-- flip this flag through the app.
--
-- The `auth.uid() is not null` guard matters: it's what lets this same
-- statement work when run directly in the SQL Editor (no JWT/session
-- there, so auth.uid() is null) — vs. through the app, where a real
-- session is always attached. Direct SQL access already means full
-- database control, so this isn't a gap; it's just recognizing that a
-- SQL-Editor request and an app request aren't the same threat.
create or replace function public.prevent_admin_self_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if auth.uid() is not null and not public.is_platform_admin() then
      new.is_admin := old.is_admin;
    end if;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin then
    -- Same shape as the is_admin guard above: a directly-authenticated
    -- session (auth.uid() is not null) needs to already be a super admin
    -- to change this at all — the admin-users function's own actions run
    -- as the service role, which has no auth.uid(), so this doesn't
    -- block those.
    if auth.uid() is not null and not public.is_super_admin() then
      new.is_super_admin := old.is_super_admin;
    -- This part applies no matter who's asking, service role included:
    -- removing the very last super admin is never allowed. The
    -- admin-users function already refuses to let anyone target their
    -- own account for this, which is what would actually cause this —
    -- this is the backstop underneath that, not a substitute for it.
    elsif old.is_super_admin and not new.is_super_admin then
      if (select count(*) from public.profiles where is_super_admin and id <> old.id) = 0 then
        new.is_super_admin := old.is_super_admin;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute procedure public.prevent_admin_self_promotion();

-- Lets a member update their own group_members row (for nickname) without
-- opening a way to rewrite group_id/user_id through that same door — which
-- would otherwise let someone "move" their membership into a group they
-- were never invited to. Same shape as the admin-promotion guard above:
-- silently reverts the columns that must never change, leaves the rest
-- (nickname) alone.
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
  return new;
end;
$$;

drop trigger if exists group_members_guard_identity on public.group_members;
create trigger group_members_guard_identity
  before update on public.group_members
  for each row execute procedure public.prevent_group_membership_tampering();

-- ============================================================
-- New-user profile provisioning
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Join-by-invite-code (SECURITY DEFINER so a not-yet-member can
-- redeem a code without a broader "anyone can insert" policy)
-- ============================================================

create or replace function public.join_group_by_code(code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
begin
  select * into g from public.groups where invite_code = upper(trim(code));
  if not found then
    raise exception 'That invite code doesn''t match any group.';
  end if;

  insert into public.group_members (group_id, user_id)
  values (g.id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  return g;
end;
$$;

-- ============================================================
-- Save a group's default split (member-only, scoped to one column so
-- this doesn't need a broader "any member can update the group row"
-- policy — which would also open up renaming/currency changes)
-- ============================================================

create or replace function public.update_default_split(gid uuid, config jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(gid) then
    raise exception 'Not a member of this group.';
  end if;
  update public.groups set default_split = config where id = gid;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;
alter table public.feature_requests enable row level security;

-- profiles: see your own row, rows of anyone you share a group with, and
-- (for a platform admin) everyone's
create policy "profiles: self" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: group co-members" on public.profiles
  for select using (
    exists (
      select 1 from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = profiles.id and gm2.user_id = auth.uid()
    )
  );

create policy "profiles: admin can view all" on public.profiles
  for select using (public.is_platform_admin());

create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- groups
-- `or created_by = auth.uid()` matters here specifically: right after a
-- group is created, the creator's group_members row doesn't exist yet (it's
-- inserted in a second call from the client), but the insert itself asks
-- Postgres to return the new row — and a RETURNING clause is gated by this
-- same SELECT policy. Without this clause, creating a group fails with
-- "new row violates row-level security policy" even though the insert was
-- legitimate.
create policy "groups: members can view" on public.groups
  for select using (
    (archived_at is null and (public.is_group_member(id) or created_by = auth.uid()))
    or public.is_platform_admin()
  );

create policy "groups: authenticated users can create" on public.groups
  for insert with check (auth.uid() = created_by);

create policy "groups: creator or manager can update" on public.groups
  for update using (public.is_group_manager(id));

create policy "groups: admin can update" on public.groups
  for update using (public.is_platform_admin());

create policy "groups: admin can delete" on public.groups
  for delete using (public.is_platform_admin());

-- group_members
create policy "group_members: members can view roster" on public.group_members
  for select using (public.is_group_member(group_id) or public.is_platform_admin());

create policy "group_members: creator adds self on group creation" on public.group_members
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

create policy "group_members: leave a group" on public.group_members
  for delete using (auth.uid() = user_id);

create policy "group_members: update own nickname" on public.group_members
  for update using (auth.uid() = user_id);

-- Appointing/revoking a manager is deliberately narrower than the
-- operational powers managers get — only the creator can do this, a
-- manager can't appoint or remove another manager. Reuses this same
-- policy's lack of column restriction (also true of "creator can
-- update" on groups above) rather than a separate, more complex policy
-- just to lock it to the is_manager column specifically.
create policy "group_members: creator can appoint managers" on public.group_members
  for update using (
    exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

-- Deliberately keyed off groups.created_by rather than a separate "is
-- owner" flag — one group has exactly one creator, forever (no ownership
-- transfer), so a second column would just be a second source of truth
-- for the same fact.
create policy "group_members: creator can remove a member" on public.group_members
  for delete using (
    exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

-- A manager gets the same removal power as the creator, except over a
-- regular member only — not the creator's own membership, and not
-- another manager's. Two separate simple policies (this one and the
-- creator-only one above) rather than one policy with nested branches:
-- Postgres evaluates multiple policies for the same action as OR'd
-- together, so the creator's own policy still covers every case this
-- one deliberately excludes.
create policy "group_members: manager can remove a regular member" on public.group_members
  for delete using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id and gm.user_id = auth.uid() and gm.is_manager
    )
    and not group_members.is_manager
    and group_members.user_id <> (select created_by from public.groups g where g.id = group_members.group_id)
  );

-- expenses
create policy "expenses: members can view" on public.expenses
  for select using (
    (deleted_at is null and public.is_group_member(group_id)) or public.is_platform_admin()
  );

create policy "expenses: members can add" on public.expenses
  for insert with check (public.is_group_member(group_id) and auth.uid() = created_by);

create policy "expenses: members can edit" on public.expenses
  for update using (public.is_group_member(group_id));

-- No member-level delete policy anymore — "delete" from the Ledger is
-- now an UPDATE (setting deleted_at), already covered by "members can
-- edit" above. Only the platform admin can actually remove a row.
create policy "expenses: admin can update" on public.expenses
  for update using (public.is_platform_admin());

create policy "expenses: admin can delete" on public.expenses
  for delete using (public.is_platform_admin());

-- expense_splits
create policy "splits: members can view" on public.expense_splits
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and (public.is_group_member(e.group_id) or public.is_platform_admin())
    )
  );

create policy "splits: members can add" on public.expense_splits
  for insert with check (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id))
  );

create policy "splits: members can edit" on public.expense_splits
  for update using (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id))
  );

create policy "splits: members can delete" on public.expense_splits
  for delete using (
    exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id))
  );

-- settlements
create policy "settlements: members can view" on public.settlements
  for select using (public.is_group_member(group_id) or public.is_platform_admin());

create policy "settlements: members can add" on public.settlements
  for insert with check (public.is_group_member(group_id) and auth.uid() = created_by);

create policy "settlements: members can delete" on public.settlements
  for delete using (public.is_group_member(group_id));

-- feature_requests
create policy "feature_requests: submitter can view own" on public.feature_requests
  for select using (auth.uid() = user_id);

create policy "feature_requests: admin can view all" on public.feature_requests
  for select using (public.is_platform_admin());

create policy "feature_requests: signed-in users can submit" on public.feature_requests
  for insert with check (auth.uid() = user_id);

create policy "feature_requests: admin can update status" on public.feature_requests
  for update using (public.is_platform_admin());

create policy "feature_requests: admin can delete" on public.feature_requests
  for delete using (public.is_platform_admin());

-- ============================================================
-- Storage: receipt photos
-- Private bucket — objects are only reachable via a signed URL your own
-- backend/RLS session generates, never a public link. Path convention is
-- "<group_id>/<expense_id>.<ext>", which is what lets these policies scope
-- access to actual group members using nothing but the path itself.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts: members can view" on storage.objects
  for select using (
    bucket_id = 'receipts' and public.is_group_member((storage.foldername(name))[1]::uuid)
  );

create policy "receipts: members can upload" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and public.is_group_member((storage.foldername(name))[1]::uuid)
  );

create policy "receipts: members can delete" on storage.objects
  for delete using (
    bucket_id = 'receipts' and public.is_group_member((storage.foldername(name))[1]::uuid)
  );

-- ============================================================
-- Storage: profile avatars
-- Public bucket (unlike receipts) — an avatar has no reason to need a
-- signed URL, and a public one is far simpler to render everywhere a
-- name shows up. Path convention is "<user_id>.<ext>", which is what
-- lets the write policy be "only your own file" from the path alone.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: anyone can view" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars: owner can upload" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.filename(name))::text like auth.uid()::text || '.%'
  );

create policy "avatars: owner can replace" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.filename(name))::text like auth.uid()::text || '.%'
  );

create policy "avatars: owner can delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.filename(name))::text like auth.uid()::text || '.%'
  );
