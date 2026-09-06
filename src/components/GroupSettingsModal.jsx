import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { accentFor } from './GroupIcon'
import GroupBanner from './GroupBanner'
import { validateTripDates, MIN_TRIP_DATE, MAX_TRIP_DATE } from '../lib/tripDates'
import HelpLink from './HelpLink'

export default function GroupSettingsModal({
  group,
  currentUserId,
  canManage,
  onRename,
  onUpdateTripDates,
  onDeleteGroup,
  onDuplicate,
  duplicating,
  onImportUndone,
  onBannerChanged,
  onClose,
}) {
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(group.name)
  const [bannerPath, setBannerPath] = useState(group.banner_path ?? null)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [bannerError, setBannerError] = useState('')
  const bannerInputRef = useRef(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [startDateDraft, setStartDateDraft] = useState(group.start_date ?? '')
  const [endDateDraft, setEndDateDraft] = useState(group.end_date ?? '')
  const [savingDates, setSavingDates] = useState(false)
  const datesChanged = startDateDraft !== (group.start_date ?? '') || endDateDraft !== (group.end_date ?? '')
  const tripDatesCheck = validateTripDates(startDateDraft, endDateDraft)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [duplicateName, setDuplicateName] = useState(`${group.name} (copy)`)
  const [importBatches, setImportBatches] = useState(null)
  const [undoingBatchId, setUndoingBatchId] = useState(null)
  const [undoError, setUndoError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('import_batches')
      .select('id, filename, row_count, created_at, undone_at, created_by, profiles(display_name)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setImportBatches(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [group.id])

  async function handleUndoImport(batchId) {
    if (!confirm('Undo this import? Every expense it created will be removed from the ledger.')) return
    setUndoingBatchId(batchId)
    setUndoError('')
    const { error: expenseError } = await supabase
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('import_batch_id', batchId)
    const { data, error: batchError } = await supabase
      .from('import_batches')
      .update({ undone_at: new Date().toISOString() })
      .eq('id', batchId)
      .select()
      .single()
    setUndoingBatchId(null)
    if (expenseError || batchError) {
      setUndoError((expenseError ?? batchError).message)
      return
    }
    setImportBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, undone_at: data?.undone_at ?? new Date().toISOString() } : b)))
    onImportUndone?.()
  }

  async function saveTripDates() {
    if (!validateTripDates(startDateDraft, endDateDraft).valid) return
    setSavingDates(true)
    await onUpdateTripDates(startDateDraft || null, endDateDraft || null)
    setSavingDates(false)
  }

  function saveRename() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== group.name) onRename(trimmed)
    setRenaming(false)
  }

  async function handleBannerChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingBanner(true)
    setBannerError('')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${group.id}/banner.${ext}`
    const { error: uploadError } = await supabase.storage.from('group-banners').upload(path, file, { upsert: true })
    if (uploadError) {
      setUploadingBanner(false)
      setBannerError(uploadError.message)
      return
    }
    const { error: updateError } = await supabase.from('groups').update({ banner_path: path }).eq('id', group.id)
    setUploadingBanner(false)
    if (updateError) {
      setBannerError(updateError.message)
      return
    }
    setBannerPath(path)
    onBannerChanged?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
      <div className="w-full sm:max-w-sm bg-paper-raised rounded-t-3xl sm:rounded-2xl border border-line shadow-raised p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Group settings</h2>
          <div className="flex items-center gap-3">
            <HelpLink to="group-settings" />
            <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm">
              Close
            </button>
          </div>
        </div>

        <div>
          <GroupBanner
            name={group.name}
            bannerPath={bannerPath}
            accent={accentFor(group.id)}
            className="-mx-5 sm:-mx-6 h-28"
          />
          {canManage && (
            <div className="mt-2">
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerChange}
              />
              {bannerPath ? (
                <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5">
                  <span className="text-sm text-ink-soft truncate">
                    {uploadingBanner ? 'Uploading…' : 'Cover photo set'}
                  </span>
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={uploadingBanner}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50 shrink-0 ml-2"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={uploadingBanner}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-line py-3 text-sm text-ink-soft hover:text-ink hover:border-primary transition-colors disabled:opacity-50"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
                    <path
                      d="M4 6.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <circle cx="7.5" cy="9" r="1.25" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M4 12.5 8 9l2.5 2.5L14 8l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                  {uploadingBanner ? 'Uploading…' : 'Add a cover photo'}
                </button>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-ink">
                <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0 mt-0.5 text-ink-soft" aria-hidden="true">
                  <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M10 9v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="10" cy="6.75" r="0.9" fill="currentColor" />
                </svg>
                Landscape photos work best — square or portrait shots will get cropped to fit.
              </p>
            </div>
          )}
          {bannerError && <p className="mt-1 text-xs text-owe">{bannerError}</p>}
        </div>

        <div>
          <p className="text-xs text-ink-soft mb-1.5">Group name</p>
          {renaming ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-ink focus:border-primary outline-none"
              />
              <button onClick={saveRename} className="text-xs font-medium text-primary hover:underline shrink-0">
                Save
              </button>
              <button
                onClick={() => {
                  setRenaming(false)
                  setNameDraft(group.name)
                }}
                className="text-xs text-ink-soft hover:text-ink shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-ink">{group.name}</p>
              <button onClick={() => setRenaming(true)} className="text-xs font-medium text-primary hover:underline">
                Rename
              </button>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-line">
          <p className="text-xs text-ink-soft mb-1.5">Trip dates (optional)</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-ink-soft mb-1">Start</label>
              <input
                type="date"
                value={startDateDraft}
                min={MIN_TRIP_DATE}
                max={endDateDraft || MAX_TRIP_DATE}
                onChange={(e) => setStartDateDraft(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-1">End</label>
              <input
                type="date"
                value={endDateDraft}
                min={startDateDraft || MIN_TRIP_DATE}
                max={MAX_TRIP_DATE}
                onChange={(e) => setEndDateDraft(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-primary outline-none"
              />
            </div>
            {datesChanged && (
              <button
                onClick={saveTripDates}
                disabled={savingDates || !tripDatesCheck.valid}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {savingDates ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
          {!tripDatesCheck.valid && (
            <p className="mt-1.5 text-xs text-owe">{tripDatesCheck.error}</p>
          )}
          <p className="mt-1.5 text-xs text-ink-soft">
            Once the end date passes, anyone who still owes money gets an automatic reminder.
          </p>
        </div>

        <div className="pt-4 border-t border-line">
          <p className="text-xs text-ink-soft mb-1.5">Same people, next trip</p>
          {!showDuplicate ? (
            <button onClick={() => setShowDuplicate(true)} className="text-sm text-primary hover:underline">
              Duplicate this group
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-ink-soft">
                Copies the members (and manager roles) and home currency into a new group with its own invite
                code. Expenses, settlements, and trip dates stay behind — it's a fresh start, not a continuation.
              </p>
              <input
                autoFocus
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder={`${group.name} (copy)`}
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-primary outline-none"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onDuplicate(duplicateName)}
                  disabled={duplicating}
                  className="rounded-full bg-primary text-on-primary text-sm font-medium px-4 py-1.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
                >
                  {duplicating ? 'Duplicating…' : 'Duplicate'}
                </button>
                <button onClick={() => setShowDuplicate(false)} className="text-xs text-ink-soft hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {importBatches?.length > 0 && (
          <div className="pt-4 border-t border-line">
            <p className="text-xs text-ink-soft mb-1.5">CSV imports</p>
            {undoError && <p className="text-xs text-owe mb-1.5">{undoError}</p>}
            <ul className="space-y-2">
              {importBatches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-ink truncate">
                      {b.filename ?? 'import'} — {b.row_count} expense{b.row_count === 1 ? '' : 's'}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {new Date(b.created_at).toLocaleDateString()} by {b.profiles?.display_name ?? 'someone'}
                    </p>
                  </div>
                  {b.undone_at ? (
                    <span className="text-xs text-ink-soft shrink-0">Undone</span>
                  ) : b.created_by === currentUserId ? (
                    <button
                      onClick={() => handleUndoImport(b.id)}
                      disabled={undoingBatchId === b.id}
                      className="text-xs font-medium text-owe hover:underline shrink-0 disabled:opacity-50"
                    >
                      {undoingBatchId === b.id ? 'Undoing…' : 'Undo'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-4 border-t border-line">
          <p className="flex items-center gap-1.5 text-xs text-owe mb-2">
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
              <path d="M10 3.3 17.3 16H2.7L10 3.3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M10 8.3v3.3M10 14h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Danger zone
          </p>
          {!confirmingDelete ? (
            <button onClick={() => setConfirmingDelete(true)} className="text-sm text-owe hover:underline">
              Delete this group
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">
                This removes {group.name} from everyone's dashboard right away. Nothing is actually deleted — the
                app's admin can restore it, in full, for 30 days. After that it's gone for good. Type the group
                name to confirm.
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={group.name}
                className="w-full rounded-lg border border-owe/40 bg-paper px-3.5 py-2 text-sm text-ink focus:border-owe outline-none"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={onDeleteGroup}
                  disabled={deleteConfirmText !== group.name}
                  className="rounded-full bg-owe text-on-primary text-sm font-medium px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Delete this group
                </button>
                <button
                  onClick={() => {
                    setConfirmingDelete(false)
                    setDeleteConfirmText('')
                  }}
                  className="text-xs text-ink-soft hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
