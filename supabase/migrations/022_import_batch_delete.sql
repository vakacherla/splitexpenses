-- CSV import needs a live connection for the write step itself (each row
-- is its own round trip to create the expense + its splits) — unlike the
-- rest of the offline write queue, a bulk import can't be queued and
-- replayed atomically later without a lot more machinery (a dependency
-- graph the existing offline queue deliberately doesn't have). So rather
-- than half-support it offline, ImportCsvModal blocks starting an import
-- while offline and, if the connection drops mid-import, automatically
-- rolls the batch back — soft-deleting whatever expenses it managed to
-- create, then removing the now-meaningless import_batches row itself so
-- a failed attempt never lingers next to real, successful imports in
-- Group settings' "CSV imports" list.
--
-- That rollback needs a delete policy on import_batches that migration
-- 021 didn't add (it only anticipated select/insert/update for the
-- normal "view your imports" and "mark undone" flows).
--
-- Run this once in the SQL Editor of your existing project.

create policy "import_batches: importer can delete" on public.import_batches
  for delete using (auth.uid() = created_by);
