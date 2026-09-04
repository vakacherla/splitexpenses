-- Supports true offline mode's conflict detection: when a queued offline
-- edit finally syncs, it needs to tell "nothing changed on the server
-- since I loaded this" apart from "someone else edited it while I was
-- offline" (see src/lib/offlineQueue.js's applyExpenseUpdate). Same
-- trigger style as prevent_admin_self_promotion elsewhere in this schema.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.expenses
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute procedure public.touch_updated_at();

notify pgrst, 'reload schema';
