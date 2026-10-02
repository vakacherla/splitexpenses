-- AT-07 (circle variant): a non-admin circle creator/manager could not
-- delete (archive) their own circle. "Delete this circle" is an UPDATE
-- setting archived_at, and it failed with "You don't have permission to
-- do that" — same root cause and same fix shape as migration 044 (trips)
-- and 043 (expenses): "circles: members can view" only allowed rows with
-- archived_at is null for anyone but a platform admin, and Postgres RLS
-- requires the *new* row to still satisfy a SELECT-relevant policy, so the
-- archive UPDATE itself was rejected.
--
-- Fix: whoever can manage the circle (creator or appointed manager) can
-- still see it once archived. Client-side consumers are updated in the
-- same change so an archived circle does not reappear anywhere:
--   * Dashboard.jsx already filters archived_at itself
--   * TripSettingsModal.jsx's "Attach to a circle" list now filters it
--   * CirclePage.jsx treats an archived circle as "not found" (non-admins)
--   * the circle-name breadcrumbs in TripView/TripSettingsModal ignore it

drop policy if exists "circles: members can view" on public.circles;
create policy "circles: members can view" on public.circles
  for select using (
    (archived_at is null and (public.is_circle_member(id) or created_by = auth.uid()))
    or public.is_circle_manager(id)
    or public.is_platform_admin()
  );
