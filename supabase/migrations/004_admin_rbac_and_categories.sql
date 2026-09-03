-- Adds: a platform-admin flag on profiles (with a trigger blocking
-- self-promotion), admin visibility across every group/expense/settlement,
-- admin's ability to delete a group outright, and a fixed expense category
-- list for reporting.
--
-- Run this once in the SQL Editor of your existing project.

-- ---------- Admin flag ----------

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

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

create or replace function public.prevent_admin_self_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if not public.is_platform_admin() then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute procedure public.prevent_admin_self_promotion();

-- ---------- Admin read access across every group ----------

drop policy if exists "profiles: admin can view all" on public.profiles;
create policy "profiles: admin can view all" on public.profiles
  for select using (public.is_platform_admin());

drop policy if exists "groups: members can view" on public.groups;
create policy "groups: members can view" on public.groups
  for select using (
    public.is_group_member(id) or created_by = auth.uid() or public.is_platform_admin()
  );

drop policy if exists "groups: admin can delete" on public.groups;
create policy "groups: admin can delete" on public.groups
  for delete using (public.is_platform_admin());

drop policy if exists "group_members: members can view roster" on public.group_members;
create policy "group_members: members can view roster" on public.group_members
  for select using (public.is_group_member(group_id) or public.is_platform_admin());

drop policy if exists "expenses: members can view" on public.expenses;
create policy "expenses: members can view" on public.expenses
  for select using (public.is_group_member(group_id) or public.is_platform_admin());

drop policy if exists "splits: members can view" on public.expense_splits;
create policy "splits: members can view" on public.expense_splits
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and (public.is_group_member(e.group_id) or public.is_platform_admin())
    )
  );

drop policy if exists "settlements: members can view" on public.settlements;
create policy "settlements: members can view" on public.settlements
  for select using (public.is_group_member(group_id) or public.is_platform_admin());

-- ---------- Expense categories ----------

alter table public.expenses
  add column if not exists category text not null default 'Misc';

alter table public.expenses
  drop constraint if exists expenses_category_check;
alter table public.expenses
  add constraint expenses_category_check check (
    category in ('Food', 'Lodging', 'Flights', 'Train', 'Taxi/Cab', 'Groceries', 'Shopping', 'Activities', 'Utilities', 'Misc')
  );

create index if not exists idx_expenses_category on public.expenses (category);

-- ---------- Make yourself the first admin ----------
-- Nobody can self-promote (see the trigger above), so set this by hand,
-- once, for your own account:
--
--   update public.profiles set is_admin = true where email = 'you@example.com';
