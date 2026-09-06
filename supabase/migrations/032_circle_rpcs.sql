-- Companion RPCs to migration 031. join_circle_by_code is a direct copy
-- of join_group_by_code's shape; create_trip_in_circle is modeled on
-- duplicate_group (018_admin_add_to_group_and_duplicate_group.sql) —
-- "create a new groups row + bulk-copy membership from elsewhere in one
-- transaction" is exactly the same problem, just sourcing membership
-- from circle_members instead of another group's group_members.
--
-- Run this once in the SQL Editor of your existing project.

create or replace function public.join_circle_by_code(code text)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.circles;
begin
  select * into c from public.circles where invite_code = upper(trim(code));
  if not found then
    raise exception 'That invite code doesn''t match any circle.';
  end if;

  insert into public.circle_members (circle_id, user_id)
  values (c.id, auth.uid())
  on conflict (circle_id, user_id) do nothing;

  return c;
end;
$$;

create or replace function public.create_trip_in_circle(target_circle_id uuid, new_name text, new_currency text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group public.groups;
begin
  if not public.is_circle_member(target_circle_id) then
    raise exception 'You must be a member of this circle to create a trip in it.';
  end if;

  if coalesce(trim(new_name), '') = '' then
    raise exception 'Give this trip a name.';
  end if;

  insert into public.groups (name, home_currency, created_by, circle_id)
  values (trim(new_name), new_currency, auth.uid(), target_circle_id)
  returning * into new_group;

  -- One-time copy of the circle's *current* members, not a live link —
  -- the tampering trigger already blocks rewriting group_members rows'
  -- identity, and nothing else ties this trip's roster back to
  -- circle_members after this insert. Removing someone from this trip
  -- later (or adding a non-circle guest) never touches the circle, and
  -- vice versa — exactly the "inherited by default, then independent"
  -- behavior this feature is meant to have.
  insert into public.group_members (group_id, user_id)
  select new_group.id, cm.user_id
  from public.circle_members cm
  where cm.circle_id = target_circle_id
  on conflict (group_id, user_id) do nothing;

  return new_group;
end;
$$;
