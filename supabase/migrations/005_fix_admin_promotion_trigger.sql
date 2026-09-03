-- Fixes a bug in the is_admin protection trigger: it was blocking the
-- "make yourself an admin" UPDATE even when run directly in the SQL
-- Editor, since auth.uid() is null there too (no session attached) — the
-- exact same condition the trigger uses to detect a non-admin trying to
-- self-promote through the app. This adds an `auth.uid() is not null`
-- guard so the trigger only intervenes on requests that actually came
-- through the app with a real session.
--
-- Run this once, then re-run your "update profiles set is_admin = true"
-- statement — it will actually take effect this time.

create or replace function public.prevent_admin_self_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if auth.uid() is not null and not public.is_platform_admin() then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;
