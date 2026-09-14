-- Closes a real gap in Circles (migration 031): "join once, see + join
-- any trip inside" only ever actually held for people added to a Trip
-- via create_trip_in_circle, which copies the Circle's roster once at
-- creation time. Anyone added to a Trip *afterward* — by invite code,
-- admin_add_user_to_group, or the "circle member can join a sibling
-- trip" self-join policy Circle members already have — never lands in
-- circle_members, so they can't see or join that Circle's *other*
-- Trips. That's what's currently stranding a handful of real members
-- outside their own Circle.
--
-- Two parts, same fix applied historically and going forward:
--
-- 1. One-time backfill: catch up every trip_members row whose user
--    isn't already in circle_members for that trip's parent circle.
-- 2. Standing trigger: on every future insert into group_members, if
--    the trip has a parent circle and the user isn't already in it,
--    add them. Deliberately one-way — this must never cascade circle
--    membership into every sibling Trip; it only ever adds someone to
--    a Circle because they just joined one of its Trips.
--
-- Run this once in the SQL Editor of your existing project.

insert into public.circle_members (circle_id, user_id)
select g.circle_id, gm.user_id
from public.group_members gm
join public.groups g on g.id = gm.group_id
where g.circle_id is not null
on conflict (circle_id, user_id) do nothing;

create or replace function public.sync_trip_member_to_circle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_circle_id uuid;
begin
  select circle_id into parent_circle_id from public.groups where id = new.group_id;

  if parent_circle_id is not null then
    insert into public.circle_members (circle_id, user_id)
    values (parent_circle_id, new.user_id)
    on conflict (circle_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists group_members_sync_to_circle on public.group_members;
create trigger group_members_sync_to_circle
  after insert on public.group_members
  for each row execute procedure public.sync_trip_member_to_circle();
