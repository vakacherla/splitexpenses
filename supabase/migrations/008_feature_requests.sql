-- Adds a feature_requests table, submitted from the Help page. Anyone
-- signed in can submit one and see their own; only a platform admin sees
-- every submission (Admin → Feedback) or changes its status.
--
-- Run this once in the SQL Editor of your existing project.

create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists idx_feature_requests_user on public.feature_requests (user_id);

alter table public.feature_requests enable row level security;

drop policy if exists "feature_requests: submitter can view own" on public.feature_requests;
create policy "feature_requests: submitter can view own" on public.feature_requests
  for select using (auth.uid() = user_id);

drop policy if exists "feature_requests: admin can view all" on public.feature_requests;
create policy "feature_requests: admin can view all" on public.feature_requests
  for select using (public.is_platform_admin());

drop policy if exists "feature_requests: signed-in users can submit" on public.feature_requests;
create policy "feature_requests: signed-in users can submit" on public.feature_requests
  for insert with check (auth.uid() = user_id);

drop policy if exists "feature_requests: admin can update status" on public.feature_requests;
create policy "feature_requests: admin can update status" on public.feature_requests
  for update using (public.is_platform_admin());

drop policy if exists "feature_requests: admin can delete" on public.feature_requests;
create policy "feature_requests: admin can delete" on public.feature_requests
  for delete using (public.is_platform_admin());
