-- AT-07 (test record): a non-admin trip creator/manager could not archive
-- their own trip at all. "Delete this trip" (an UPDATE setting
-- archived_at) failed with "new row violates row-level security policy"
-- for anyone who wasn't a platform admin.
--
-- Same root cause and same fix shape as migration 043's expense-delete
-- bug: "groups: members can view" required archived_at is null for a
-- non-admin, and Postgres's RLS requires the *new* row (post-archive) to
-- still satisfy some SELECT-relevant policy for the executing role even
-- without a RETURNING clause. Once archived_at got set, the only
-- remaining viewer was a platform admin, so the UPDATE itself was
-- rejected before it could ever take effect.
--
-- Fix: let whoever can manage the trip (its creator, or anyone promoted
-- to manager) also still see it once archived, same as migration 043 did
-- for an expense's own creator/payer/manager. Dashboard.jsx already
-- filters archived_at out of a member's trip list itself, so this
-- doesn't make an archived trip reappear in anyone's normal browsing —
-- it only lets the archive operation (and a direct link to the trip
-- afterward) actually work for the person doing it.

drop policy if exists "groups: members can view" on public.groups;
create policy "groups: members can view" on public.groups
  for select using (
    (archived_at is null and (public.is_group_member(id) or created_by = auth.uid()))
    or public.is_group_manager(id)
    or public.is_platform_admin()
  );
