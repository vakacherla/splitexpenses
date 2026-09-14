-- Custom Circle cover-photo banner, same feature as Trip banners
-- (024_group_banners.sql) applied to circles. A Circle's creator/manager
-- can upload a real photo to replace the accent-gradient + first-letter
-- placeholder shown on CirclePage and the Dashboard card.
--
-- Same shape as group-banners: a dedicated public bucket, paths
-- `<circle_id>/banner.<ext>` (folder per circle, one file, upsert on
-- re-upload), write access scoped to is_circle_manager instead of a
-- simple "filename starts with my uid" check.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.circles
  add column if not exists banner_path text;

insert into storage.buckets (id, name, public)
values ('circle-banners', 'circle-banners', true)
on conflict (id) do nothing;

drop policy if exists "circle-banners: anyone can view" on storage.objects;
create policy "circle-banners: anyone can view" on storage.objects
  for select using (bucket_id = 'circle-banners');

drop policy if exists "circle-banners: creator/manager can upload" on storage.objects;
create policy "circle-banners: creator/manager can upload" on storage.objects
  for insert with check (
    bucket_id = 'circle-banners' and
    public.is_circle_manager(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "circle-banners: creator/manager can replace" on storage.objects;
create policy "circle-banners: creator/manager can replace" on storage.objects
  for update using (
    bucket_id = 'circle-banners' and
    public.is_circle_manager(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "circle-banners: creator/manager can delete" on storage.objects;
create policy "circle-banners: creator/manager can delete" on storage.objects
  for delete using (
    bucket_id = 'circle-banners' and
    public.is_circle_manager(((storage.foldername(name))[1])::uuid)
  );
