-- Adds optional trip start/end dates to a group, a place to store each
-- device's Web Push subscription, and a per-group cooldown timestamp so
-- the automatic "trip ended, please settle up" nudge (a separate Edge
-- Function, scheduled via pg_cron below) can't re-fire more than once
-- every few days for the same group.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.groups
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists last_reminder_sent_at timestamptz;

-- No new RPC or policy needed to let a group's owner/manager set these —
-- the existing "groups: creator or manager can update" policy (migration
-- 013) already covers every column on this table via a plain
-- supabase.from('groups').update(...), same as rename already works.

-- One row per subscribed browser/device. A user can have several (phone,
-- laptop, etc.) — each gets its own row, each gets its own push.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: own rows only" on public.push_subscriptions;
create policy "push_subscriptions: own rows only" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Scheduled trip-end reminder sweep ----------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Runs once a day. The target Edge Function takes no user input and
-- returns nothing sensitive — the anon key here only gets it past
-- Supabase's own platform-level "is this a real API key" gate (the same
-- key already sitting in this app's own public frontend bundle, not a
-- secret), not a stand-in for real auth. The function does its own
-- server-side query of every group past its end date, using its own
-- service-role key internally, exactly like admin-users does.
select cron.schedule(
  'send-trip-reminders-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://msaawuwelovlikdboxrn.supabase.co/functions/v1/trip-reminders-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zYWF3dXdlbG92bGlrZGJveHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjY5OTYsImV4cCI6MjEwMzcwMjk5Nn0.N4JS0KdaWkxfAOenw7cHI3jt-wUabod3rvkdNfT84H4',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

notify pgrst, 'reload schema';
