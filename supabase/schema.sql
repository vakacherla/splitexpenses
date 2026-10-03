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
    or public.is_group_manager(id)
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
-- The `deleted_at is null` branch only governs what a regular member sees
-- in normal browsing (the app also filters deleted_at itself when loading
-- the ledger, so this isn't the only thing hiding deleted rows). The second
-- branch exists because Postgres enforces this SELECT policy against the
-- *post-update* row during an UPDATE too, even with no RETURNING clause:
-- live testing found a member's own soft-delete of their own expense
-- (literally just setting deleted_at) rejected with "new row violates row-
-- level security policy", despite the "members can edit" USING/WITH CHECK
-- both plainly passing. Root cause, confirmed by reproducing it directly in
-- SQL: once deleted_at is set, the row falls out of the first branch and
-- out of is_platform_admin() too (for a non-admin), so Postgres treats the
-- update itself as producing a row the actor isn't allowed to see — and
-- blocks it, independent of the UPDATE policy's own WITH CHECK. Letting the
-- same people who can edit the row also still "see" it after deletion
-- removes that trap.
create policy "expenses: members can view" on public.expenses
  for select using (
    (
      public.is_group_member(group_id)
      and (
        deleted_at is null
        or created_by = auth.uid()
        or paid_by = auth.uid()
        or public.is_group_manager(group_id)
      )
    )
    or public.is_platform_admin()
  );

create policy "expenses: members can add" on public.expenses
  for insert with check (public.is_group_member(group_id) and auth.uid() = created_by);

-- WITH CHECK spelled out explicitly (identical to USING) rather than
-- relying on Postgres defaulting it when omitted — not the actual fix for
-- the soft-delete bug above (see "members can view"), but harmless and
-- removes one source of ambiguity while we were in here.
create policy "expenses: members can edit" on public.expenses
  for update using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or paid_by = auth.uid() or public.is_group_manager(group_id))
  )
  with check (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or paid_by = auth.uid() or public.is_group_manager(group_id))
  );

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

-- Migration 046: refuse to remove a member who still has an unsettled
-- balance, for every removal path (manager, admin RPC, leaving).
create or replace function public.group_member_net_balance(gid uuid, uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(e.amount_in_home) from public.expenses e
              where e.group_id = gid and e.deleted_at is null and e.paid_by = uid), 0)
    - coalesce((select sum(s.share_in_home) from public.expense_splits s
                join public.expenses e on e.id = s.expense_id
                where e.group_id = gid and e.deleted_at is null and s.user_id = uid), 0)
    + coalesce((select sum(st.amount_in_home) from public.settlements st
                where st.group_id = gid and st.from_user = uid), 0)
    - coalesce((select sum(st.amount_in_home) from public.settlements st
                where st.group_id = gid and st.to_user = uid), 0);
$$;

create or replace function public.block_member_removal_with_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.groups g where g.id = old.group_id) then
    return old;
  end if;

  if abs(public.group_member_net_balance(old.group_id, old.user_id)) > 0.01 then
    raise exception 'Can''t remove this person — they still have an unsettled balance in this trip. Settle up first.';
  end if;

  return old;
end;
$$;

drop trigger if exists group_members_block_removal_with_balance on public.group_members;
create trigger group_members_block_removal_with_balance
  before delete on public.group_members
  for each row execute function public.block_member_removal_with_balance();


-- Migration 047: suspended users are blocked at the database (AU-04).
create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.banned_until is not null and u.banned_until > now()
     from auth.users u
     where u.id = auth.uid()),
    false
  );
$$;

create or replace function public.block_suspended_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_suspended() then
    raise exception 'Your account is suspended. Contact the administrator.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.protect_table_from_suspended(tbl regclass)
returns void
language plpgsql
as $$
declare
  rel text := tbl::text;
begin
  execute format('drop policy if exists "suspended: deny all" on %s', rel);
  execute format(
    'create policy "suspended: deny all" on %s as restrictive for all
       using (not (select public.is_suspended()))
       with check (not (select public.is_suspended()))',
    rel
  );
  execute format('drop trigger if exists block_suspended_writes on %s', rel);
  execute format(
    'create trigger block_suspended_writes before insert or update or delete on %s
       for each row execute function public.block_suspended_writes()',
    rel
  );
end;
$$;

-- Apply to every table in public.
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    perform public.protect_table_from_suspended(format('public.%I', t.tablename)::regclass);
  end loop;
end $$;

-- Storage (avatars, banners, receipts): deny access while suspended.
drop policy if exists "suspended: deny all" on storage.objects;
create policy "suspended: deny all" on storage.objects
  as restrictive for all
  using (not (select public.is_suspended()))
  with check (not (select public.is_suspended()));

-- Kill the user's sessions when an admin suspends them. Only the service
-- role (the admin-users Edge Function) may call this.
create or replace function public.revoke_user_sessions(target uuid)
returns void
language sql
security definer
set search_path = auth, public
as $$
  delete from auth.sessions where user_id = target;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

grant execute on function public.is_suspended() to authenticated;


-- Migration 048: AI usage caps + throwaway-email blocklist.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  feature text not null,
  uses integer not null default 0,
  primary key (user_id, day, feature)
);

-- No policies on purpose: with RLS on and nothing granted, only the service
-- role (which bypasses RLS) can touch it, so a user cannot reset their own
-- counter.
alter table public.ai_usage enable row level security;

-- Counts one use for today (UTC). Returns true if it was within the limit,
-- false if the user has already hit it.
create or replace function public.consume_ai_quota(p_user uuid, p_feature text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uses integer;
begin
  insert into public.ai_usage as u (user_id, day, feature, uses)
  values (p_user, (now() at time zone 'utc')::date, p_feature, 1)
  on conflict (user_id, day, feature)
  do update set uses = u.uses + 1
    where u.uses < p_limit
  returning u.uses into v_uses;

  return v_uses is not null;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Throwaway-email blocklist
-- ---------------------------------------------------------------------------

create table if not exists public.blocked_email_domains (
  domain text primary key check (domain = lower(domain))
);
alter table public.blocked_email_domains enable row level security;

insert into public.blocked_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'),
  ('guerrillamail.biz'), ('guerrillamail.de'), ('guerrillamailblock.com'), ('sharklasers.com'),
  ('grr.la'), ('pokemail.net'), ('spam4.me'), ('10minutemail.com'), ('10minutemail.net'),
  ('tempmail.com'), ('temp-mail.org'), ('temp-mail.io'), ('tempmail.net'), ('tempail.com'),
  ('tempmailo.com'), ('tempr.email'), ('tempinbox.com'), ('throwawaymail.com'), ('yopmail.com'),
  ('yopmail.fr'), ('yopmail.net'), ('trashmail.com'), ('trashmail.net'), ('trashmail.de'),
  ('getnada.com'), ('nada.email'), ('maildrop.cc'), ('mohmal.com'), ('dispostable.com'),
  ('fakeinbox.com'), ('mintemail.com'), ('mailnesia.com'), ('mytemp.email'), ('emailondeck.com'),
  ('burnermail.io'), ('discard.email'), ('discardmail.com'), ('spamgourmet.com'), ('mailcatch.com'),
  ('moakt.com'), ('tmpmail.org'), ('tmpmail.net'), ('inboxkitten.com'), ('harakirimail.com'),
  ('getairmail.com'), ('anonbox.net'), ('dropmail.me'), ('mail.tm'), ('emailfake.com'),
  ('fakemailgenerator.com'), ('crazymailing.com'), ('1secmail.com'), ('1secmail.org'),
  ('1secmail.net'), ('spambox.us'), ('mailforspam.com'), ('jetable.org'), ('minuteinbox.com'),
  ('luxusmail.org'), ('byom.de'), ('tempmailaddress.com')
on conflict do nothing;

-- True when the address's domain (or a parent domain) is on the blocklist.
create or replace function public.email_domain_is_blocked(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with d as (select lower(split_part(coalesce(p_email, ''), '@', 2)) as domain)
  select exists (
    select 1
    from public.blocked_email_domains b, d
    where d.domain <> ''
      and (d.domain = b.domain or d.domain like '%.' || b.domain)
  );
$$;

-- For the sign-up form: lets it show a friendly message before submitting.
create or replace function public.signup_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.email_domain_is_blocked(p_email);
$$;

grant execute on function public.signup_email_allowed(text) to anon, authenticated;
revoke all on function public.email_domain_is_blocked(text) from public, anon, authenticated;

-- The real enforcement: refuse the new account itself. (The form's pre-check
-- can be bypassed by calling the Auth API directly; this cannot.)
create or replace function public.block_throwaway_email_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.email_domain_is_blocked(new.email) then
    raise exception 'Please sign up with a permanent email address.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_throwaway_email_signup on auth.users;
create trigger block_throwaway_email_signup
  before insert on auth.users
  for each row execute function public.block_throwaway_email_signup();



-- Migration 049: usage insights, Track A (REQ-USE-01..04).
-- Usage insights, Track A (REQ-USE-01..04): collect first-party usage data so
-- the admin can see adoption. Nothing here is sent to a third party.
--
--  1. profiles.share_usage   the "Share usage data" switch (default on).
--  2. app_events             one row per tracked event. RLS is on and there are
--                            NO policies, so nobody can read or write it through
--                            the API. Rows arrive only through track_events()
--                            below; admins read aggregates through the
--                            admin_usage_* functions (migration 050).
--  3. user_activity          last_seen_at per user, also closed to the API, so a
--                            trip-mate cannot see when you were last online.
--
-- Privacy rules enforced here, not only in the app:
--  - event names come from a fixed list;
--  - props may only hold allowlisted keys with short, allowlisted-shape values
--    (no amounts, descriptions, names, emails or free text);
--  - nothing is recorded for a user whose share_usage is off, or who is
--    suspended;
--  - rows go when the account goes (on delete cascade).

-- ---------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists share_usage boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Event store
-- ---------------------------------------------------------------------------

-- Validates the jsonb "props" of one event. Immutable so a CHECK can use it.
create or replace function public.app_event_props_valid(p jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p) = 'object'
    and pg_column_size(p) <= 512
    and not exists (
      select 1
      from jsonb_each(p) as kv(k, v)
      where
        jsonb_typeof(v) <> 'string'
        or length(v #>> '{}') > 64
        or case k
          when 'feature' then (v #>> '{}') not in (
            'receipt_scan', 'text_parse', 'csv_import', 'csv_export', 'itemized_split',
            'settle_up', 'invite_link', 'circles', 'trip_reports', 'rates', 'reminders',
            'push_optin', 'offline_queue', 'help', 'tour')
          when 'route' then (v #>> '{}') !~ '^/[a-z0-9/:_-]*$'
          when 'split_type' then (v #>> '{}') !~ '^[a-z_]{1,20}$'
          when 'form_factor' then (v #>> '{}') not in ('phone', 'tablet', 'desktop')
          when 'install_mode' then (v #>> '{}') not in ('pwa', 'browser')
          when 'os' then (v #>> '{}') not in ('ios', 'android', 'windows', 'macos', 'linux', 'other')
          when 'browser' then (v #>> '{}') not in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'other')
          else true  -- unknown key: rejected below
        end
        or k not in ('feature', 'route', 'split_type', 'form_factor', 'install_mode', 'os', 'browser')
    );
$$;

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (name in (
    'app_open', 'page_view', 'feature_used',
    'trip_created', 'expense_added', 'settled_up', 'member_invited', 'invite_shared'
  )),
  props jsonb not null default '{}'::jsonb check (public.app_event_props_valid(props)),
  session_id text check (session_id is null or length(session_id) <= 64),
  created_at timestamptz not null default now()
);

create index if not exists idx_app_events_created on public.app_events (created_at);
create index if not exists idx_app_events_user on public.app_events (user_id, created_at);
create index if not exists idx_app_events_name on public.app_events (name, created_at);

alter table public.app_events enable row level security;
-- No policies on purpose. See the header.

-- Last-seen per user. Same no-policy lockdown.
create table if not exists public.user_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;

-- Same suspension protection every other public table has (migration 047).
select public.protect_table_from_suspended('public.app_events');
select public.protect_table_from_suspended('public.user_activity');

-- ---------------------------------------------------------------------------
-- 3. Writers (the only way in)
-- ---------------------------------------------------------------------------

-- True when the caller is signed in, not suspended, and has the switch on.
create or replace function public.usage_sharing_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and not public.is_suspended()
    and coalesce((select share_usage from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.usage_sharing_enabled() from public, anon;
grant execute on function public.usage_sharing_enabled() to authenticated;

-- Records a batch of events for the caller. Invalid events are skipped
-- silently (tracking must never surface an error to the person using the
-- app). At most 25 per call and 2000 per rolling day per user, so a buggy or
-- hostile client cannot fill the table. created_at is always the server's
-- clock; a client cannot backdate. Returns how many rows were stored.
create or replace function public.track_events(p_events jsonb, p_session text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stored integer := 0;
  recent integer;
  e jsonb;
begin
  if not public.usage_sharing_enabled() then
    return 0;
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  select count(*) into recent
  from public.app_events
  where user_id = uid and created_at > now() - interval '1 day';
  if recent >= 2000 then
    return 0;
  end if;

  for e in select value from jsonb_array_elements(p_events) limit 25 loop
    begin
      insert into public.app_events (user_id, name, props, session_id)
      values (
        uid,
        e ->> 'name',
        coalesce(e -> 'props', '{}'::jsonb),
        left(p_session, 64)
      );
      stored := stored + 1;
    exception when check_violation or not_null_violation then
      null; -- unknown name or props outside the allowlist: drop it
    end;
  end loop;

  return stored;
end;
$$;

revoke all on function public.track_events(jsonb, text) from public, anon;
grant execute on function public.track_events(jsonb, text) to authenticated;

-- Heartbeat for "active now" and "last seen". Cheap and idempotent: it only
-- writes when the stored time is more than a minute old, so a chatty client
-- cannot cause a write per call. Does nothing when the switch is off.
create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usage_sharing_enabled() then
    return;
  end if;
  insert into public.user_activity as ua (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_seen_at = now()
    where ua.last_seen_at < now() - interval '1 minute';
end;
$$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

notify pgrst, 'reload schema';
