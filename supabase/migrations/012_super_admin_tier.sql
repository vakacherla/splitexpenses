-- Adds a super-admin tier on top of the existing admin flag. The only
-- thing this tier controls is who can grant or revoke admin status
-- itself (via the admin-users Edge Function's new promote/demote
-- actions) — every other admin action (ban, delete, archive a group,
-- etc.) stays available to any admin, super or not.
--
-- Run this once in the SQL Editor of your existing project.

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

alter table public.profiles
  drop constraint if exists super_admin_requires_admin;
alter table public.profiles
  add constraint super_admin_requires_admin check (not is_super_admin or is_admin);

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

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

  if new.is_super_admin is distinct from old.is_super_admin then
    if auth.uid() is not null and not public.is_super_admin() then
      new.is_super_admin := old.is_super_admin;
    elsif old.is_super_admin and not new.is_super_admin then
      if (select count(*) from public.profiles where is_super_admin and id <> old.id) = 0 then
        new.is_super_admin := old.is_super_admin;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute procedure public.prevent_admin_self_promotion();

-- Seeds the very first super admin: whichever existing admin account is
-- oldest — the same account the "SU" badge already pointed to before
-- this migration, when it was just a derived label rather than a real
-- permission. Without this, there'd be nobody able to use the new
-- promote/demote actions at all.
update public.profiles
set is_super_admin = true
where id = (select id from public.profiles where is_admin = true order by created_at asc limit 1);
