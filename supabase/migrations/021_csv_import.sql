-- CSV bulk-import (roadmap "Next" item #1, priority order set 2026-09-04).
--
-- Every import run is tagged with a batch row so a bad import can be
-- undone in one click, same "recoverable, not silent" principle as the
-- existing expenses.deleted_at soft-delete.
--
-- Undo itself needs no new RPC: it's a plain client-side
--   update expenses set deleted_at = now() where import_batch_id = $1
-- which the existing "expenses: members can edit" policy (migration 017,
-- created_by = auth.uid() or paid_by = auth.uid()) already allows, since
-- every row in a batch has created_by = the importer. v1 undo is
-- therefore self-service only — a manager undoing someone else's import
-- would need a SECURITY DEFINER RPC, deliberately not built here.
--
-- Run this once in the SQL Editor of your existing project.

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  filename text,
  row_count int not null,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

alter table public.expenses
  add column import_batch_id uuid references public.import_batches(id);

alter table public.import_batches enable row level security;

create policy "import_batches: members can view" on public.import_batches
  for select using (public.is_group_member(group_id));

create policy "import_batches: members can create" on public.import_batches
  for insert with check (public.is_group_member(group_id) and auth.uid() = created_by);

create policy "import_batches: importer can mark undone" on public.import_batches
  for update using (auth.uid() = created_by);
