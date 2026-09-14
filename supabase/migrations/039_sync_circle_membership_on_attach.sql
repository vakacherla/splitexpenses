-- Closes the same gap as migration 036, via the door that testing
-- turned up: attach_trip_to_circle / admin_attach_group_to_circle (033)
-- only ever update groups.circle_id — they never touch group_members —
-- so migration 036's "after insert on group_members" trigger never
-- fires for them. A Trip's *existing* roster silently stayed out of
-- the Circle it just joined, exactly the bug 036 was meant to close,
-- just reached from the other direction (attach an old Trip with
-- members already in it, instead of adding a member to a Trip that's
-- already in a Circle).
--
-- Verified live before this fix: attaching a two-member Trip to a
-- fresh Circle left the non-creator member out of circle_members
-- entirely.
--
-- Same one-way rule as before — this only ever adds people to a
-- Circle because their Trip just joined it, never removes anyone on
-- detach, and never cascades Circle membership into sibling Trips.
--
-- Run this once in the SQL Editor of your existing project.

create or replace function public.sync_trip_roster_to_circle_on_attach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.circle_id is not null and new.circle_id is distinct from old.circle_id then
    insert into public.circle_members (circle_id, user_id)
    select new.circle_id, gm.user_id
    from public.group_members gm
    where gm.group_id = new.id
    on conflict (circle_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists groups_sync_roster_to_circle on public.groups;
create trigger groups_sync_roster_to_circle
  after update of circle_id on public.groups
  for each row execute procedure public.sync_trip_roster_to_circle_on_attach();
