-- Adds: per-user payment handles (for the settle-up deep link), a
-- per-group saved default split, expense notes, and a private Storage
-- bucket + policies for receipt photos.
--
-- Run this once in the SQL Editor of your existing project.

-- ---------- Payment handles ----------

alter table public.profiles
  add column if not exists payment_provider text,
  add column if not exists payment_handle text;

alter table public.profiles
  drop constraint if exists profiles_payment_provider_check;
alter table public.profiles
  add constraint profiles_payment_provider_check
  check (payment_provider is null or payment_provider in ('upi', 'venmo', 'paypal'));

-- ---------- Saved default split per group ----------

alter table public.groups
  add column if not exists default_split jsonb;

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

-- ---------- Expense notes + receipt photos ----------

alter table public.expenses
  add column if not exists note text,
  add column if not exists receipt_path text;

-- ---------- Storage bucket for receipts ----------

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts: members can view" on storage.objects;
create policy "receipts: members can view" on storage.objects
  for select using (
    bucket_id = 'receipts' and public.is_group_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "receipts: members can upload" on storage.objects;
create policy "receipts: members can upload" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and public.is_group_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "receipts: members can delete" on storage.objects;
create policy "receipts: members can delete" on storage.objects
  for delete using (
    bucket_id = 'receipts' and public.is_group_member((storage.foldername(name))[1]::uuid)
  );
