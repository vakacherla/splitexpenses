-- Fixes a real bug in 024_group_banners.sql, caught live: uploading a
-- banner failed with "new row violates row-level security policy" even
-- as the group's own owner. Root cause: the storage.objects policies did
-- a raw join against public.group_members/public.groups from inside the
-- policy check — but those tables are themselves RLS-protected, and a
-- plain (non-SECURITY DEFINER) query against them inside another table's
-- RLS check is still subject to their own policies, which don't resolve
-- the same way in that nested context. The existing receipts bucket
-- policy (007_payment_links_defaults_notes_receipts.sql) already avoids
-- this by calling is_group_member(), a SECURITY DEFINER function that
-- bypasses RLS entirely — this migration follows the same pattern
-- instead of inlining the join.
--
-- Run this once in the SQL Editor of your existing project.

create or replace function public.can_manage_group(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = gid
      and gm.user_id = auth.uid()
      and (gm.is_manager or g.created_by = auth.uid())
  );
$$;

drop policy if exists "group-banners: owner/manager can upload" on storage.objects;
create policy "group-banners: owner/manager can upload" on storage.objects
  for insert with check (
    bucket_id = 'group-banners' and public.can_manage_group((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "group-banners: owner/manager can replace" on storage.objects;
create policy "group-banners: owner/manager can replace" on storage.objects
  for update using (
    bucket_id = 'group-banners' and public.can_manage_group((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "group-banners: owner/manager can delete" on storage.objects;
create policy "group-banners: owner/manager can delete" on storage.objects
  for delete using (
    bucket_id = 'group-banners' and public.can_manage_group((storage.foldername(name))[1]::uuid)
  );
