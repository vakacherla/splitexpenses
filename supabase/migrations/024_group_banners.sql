-- Custom group cover-photo banner: an owner/manager can upload a real
-- photo (e.g. a trip group shot) to replace the auto-assigned decorative
-- gradient+letter banner shown on the Dashboard card and group page.
--
-- Same shape as the avatars bucket (009_profile_avatars_phone_nicknames.sql),
-- but write access is scoped to group ownership/management instead of a
-- simple "filename starts with my uid" check, since a group has more than
-- one person who might legitimately manage it. Paths are
-- `<group_id>/banner.<ext>` (folder per group, one file, upsert on
-- re-upload) so `storage.foldername(name)` recovers the group id to check
-- against.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.groups
  add column if not exists banner_path text;

insert into storage.buckets (id, name, public)
values ('group-banners', 'group-banners', true)
on conflict (id) do nothing;

drop policy if exists "group-banners: anyone can view" on storage.objects;
create policy "group-banners: anyone can view" on storage.objects
  for select using (bucket_id = 'group-banners');

drop policy if exists "group-banners: owner/manager can upload" on storage.objects;
create policy "group-banners: owner/manager can upload" on storage.objects
  for insert with check (
    bucket_id = 'group-banners' and
    exists (
      select 1 from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.group_id = ((storage.foldername(name))[1])::uuid
        and gm.user_id = auth.uid()
        and (gm.is_manager or g.created_by = auth.uid())
    )
  );

drop policy if exists "group-banners: owner/manager can replace" on storage.objects;
create policy "group-banners: owner/manager can replace" on storage.objects
  for update using (
    bucket_id = 'group-banners' and
    exists (
      select 1 from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.group_id = ((storage.foldername(name))[1])::uuid
        and gm.user_id = auth.uid()
        and (gm.is_manager or g.created_by = auth.uid())
    )
  );

drop policy if exists "group-banners: owner/manager can delete" on storage.objects;
create policy "group-banners: owner/manager can delete" on storage.objects
  for delete using (
    bucket_id = 'group-banners' and
    exists (
      select 1 from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.group_id = ((storage.foldername(name))[1])::uuid
        and gm.user_id = auth.uid()
        and (gm.is_manager or g.created_by = auth.uid())
    )
  );
