-- Reverts migration 022. Turns out a hard delete of an import_batches
-- row was never going to work: expenses.import_batch_id still points at
-- the batch even after those expenses are soft-deleted (the rows still
-- exist, just hidden), so deleting the batch row violates that foreign
-- key — and supabase-js resolves a query error rather than throwing,
-- so the failure was silent (confirmed live: a rolled-back import's
-- batch row was left behind, showing as a normal undoable import
-- instead of disappearing). Fixed in the app by marking the batch
-- undone (same mechanism as a real undo) instead of deleting it, which
-- needs no delete policy at all — this migration just removes the one
-- 022 added that the app no longer calls.
--
-- Run this once in the SQL Editor of your existing project.

drop policy if exists "import_batches: importer can delete" on public.import_batches;
