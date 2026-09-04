import { useState } from 'react'

export default function GroupSettingsModal({
  group,
  onRename,
  onUpdateTripDates,
  onDeleteGroup,
  onDuplicate,
  duplicating,
  onClose,
}) {
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(group.name)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [startDateDraft, setStartDateDraft] = useState(group.start_date ?? '')
  const [endDateDraft, setEndDateDraft] = useState(group.end_date ?? '')
  const [savingDates, setSavingDates] = useState(false)
  const datesChanged = startDateDraft !== (group.start_date ?? '') || endDateDraft !== (group.end_date ?? '')
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [duplicateName, setDuplicateName] = useState(`${group.name} (copy)`)

  async function saveTripDates() {
    setSavingDates(true)
    await onUpdateTripDates(startDateDraft || null, endDateDraft || null)
    setSavingDates(false)
  }

  function saveRename() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== group.name) onRename(trimmed)
    setRenaming(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
      <div className="w-full sm:max-w-sm bg-paper-raised rounded-t-3xl sm:rounded-2xl border border-line shadow-raised p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Group settings</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm">
            Close
          </button>
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
                onChange={(e) => setStartDateDraft(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-1">End</label>
              <input
                type="date"
                value={endDateDraft}
                onChange={(e) => setEndDateDraft(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-primary outline-none"
              />
            </div>
            {datesChanged && (
              <button
                onClick={saveTripDates}
                disabled={savingDates}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {savingDates ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
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

        <div className="pt-4 border-t border-line">
          <p className="text-xs text-owe mb-2">Danger zone</p>
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
