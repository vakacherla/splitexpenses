-- Self-service "add by email" for a Circle's creator/managers —
-- deliberately not open search or discovery, this app is still
-- pre-revenue/friends-testing. Closes the exact gap already flagged in
-- PRODUCT-ROADMAP.md ("no admin_add_user_to_circle-style RPC or UI for
-- adding one person to a Circle outside of them using its invite code
-- themselves"), but self-service for the circle's own manager rather
-- than super-admin-only — modeled on admin_add_user_to_group (018) for
-- the "look up, then insert on conflict do nothing" shape.
--
-- Run this once in the SQL Editor of your existing project.

create or replace function public.add_circle_member_by_email(target_circle_id uuid, target_email text)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.circles;
  target_user_id uuid;
begin
  if not public.is_circle_manager(target_circle_id) then
    raise exception 'Only this circle''s creator or a manager can add someone directly.';
  end if;

  select * into c from public.circles where id = target_circle_id;
  if not found then
    raise exception 'Circle not found.';
  end if;

  select id into target_user_id from public.profiles where lower(email) = lower(trim(target_email));
  if target_user_id is null then
    raise exception 'No account found with that email — they''ll need to sign up first.';
  end if;

  insert into public.circle_members (circle_id, user_id)
  values (target_circle_id, target_user_id)
  on conflict (circle_id, user_id) do nothing;

  return c;
end;
$$;

notify pgrst, 'reload schema';
