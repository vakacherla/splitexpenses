-- AU-04 (found 2026-10-02): suspending a user only set the Supabase auth ban
-- (auth.users.banned_until). That refuses a NEW sign-in, but a session that
-- is already open keeps a valid access token for up to an hour and nothing
-- in the database looked at the ban, so a suspended user could keep reading
-- and writing (the test account created a circle after being suspended).
--
-- This makes the ban bite at the database, immediately:
--   1. is_suspended(): true when the caller's auth user is currently banned.
--      Also exposed as an RPC so the app can show a "suspended" screen.
--   2. A RESTRICTIVE row-level-security policy on every public table and on
--      storage.objects: it is ANDed with every existing policy, so it denies
--      all reads and writes while suspended without touching those policies.
--   3. A BEFORE INSERT/UPDATE/DELETE trigger on every public table. The
--      SECURITY DEFINER RPCs (join by code, create trip in circle, duplicate
--      trip, ...) run as the table owner and so skip RLS; triggers still fire
--      for them, and auth.uid() still names the real caller.
--   4. revoke_user_sessions(): used by the admin-users Edge Function on
--      suspend so the user's refresh tokens die too (no silent re-auth).
--
-- The policy is inert on a table that has RLS switched off (this does not
-- switch it on); the write trigger still applies there.
--
-- Service-role/Edge Function calls have auth.uid() = null, so they are never
-- treated as suspended. New tables later: call
--   select public.protect_table_from_suspended('public.<table>');

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.banned_until is not null and u.banned_until > now()
     from auth.users u
     where u.id = auth.uid()),
    false
  );
$$;

create or replace function public.block_suspended_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_suspended() then
    raise exception 'Your account is suspended. Contact the administrator.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.protect_table_from_suspended(tbl regclass)
returns void
language plpgsql
as $$
declare
  rel text := tbl::text;
begin
  execute format('drop policy if exists "suspended: deny all" on %s', rel);
  execute format(
    'create policy "suspended: deny all" on %s as restrictive for all
       using (not (select public.is_suspended()))
       with check (not (select public.is_suspended()))',
    rel
  );
  execute format('drop trigger if exists block_suspended_writes on %s', rel);
  execute format(
    'create trigger block_suspended_writes before insert or update or delete on %s
       for each row execute function public.block_suspended_writes()',
    rel
  );
end;
$$;

-- Apply to every table in public.
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    perform public.protect_table_from_suspended(format('public.%I', t.tablename)::regclass);
  end loop;
end $$;

-- Storage (avatars, banners, receipts): deny access while suspended.
drop policy if exists "suspended: deny all" on storage.objects;
create policy "suspended: deny all" on storage.objects
  as restrictive for all
  using (not (select public.is_suspended()))
  with check (not (select public.is_suspended()));

-- Kill the user's sessions when an admin suspends them. Only the service
-- role (the admin-users Edge Function) may call this.
create or replace function public.revoke_user_sessions(target uuid)
returns void
language sql
security definer
set search_path = auth, public
as $$
  delete from auth.sessions where user_id = target;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

grant execute on function public.is_suspended() to authenticated;

notify pgrst, 'reload schema';
