-- Adds: profile avatars (public Storage bucket), two phone numbers
-- (home + travel), and a per-group nickname on group_members — plus a
-- trigger that keeps nickname edits from being able to smuggle in a
-- change to which group/user a membership row actually belongs to.
--
-- Run this once in the SQL Editor of your existing project.

-- ---------- Profile fields ----------

alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists phone_home text,
  add column if not exists phone_travel text;

-- ---------- Per-group nickname ----------

alter table public.group_members
  add column if not exists nickname text;

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

drop policy if exists "group_members: update own nickname" on public.group_members;
create policy "group_members: update own nickname" on public.group_members
  for update using (auth.uid() = user_id);

-- ---------- Storage bucket for avatars ----------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: anyone can view" on storage.objects;
create policy "avatars: anyone can view" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars: owner can upload" on storage.objects;
create policy "avatars: owner can upload" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.filename(name))::text like auth.uid()::text || '.%'
  );

drop policy if exists "avatars: owner can replace" on storage.objects;
create policy "avatars: owner can replace" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.filename(name))::text like auth.uid()::text || '.%'
  );

drop policy if exists "avatars: owner can delete" on storage.objects;
create policy "avatars: owner can delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.filename(name))::text like auth.uid()::text || '.%'
  );
