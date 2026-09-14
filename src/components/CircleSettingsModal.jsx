import { useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { accentFor } from './TripIcon'
import TripBanner from './TripBanner'
import HelpLink from './HelpLink'

// Trimmed copy of TripSettingsModal.jsx's shape — rename, banner, and
// danger zone. Circles have no dates, duplicate, CSV imports, or
// attach/detach-circle section (that last one is Trip-only, obviously).
export default function CircleSettingsModal({ circle, canManage, onRename, onArchiveCircle, onBannerChanged, onClose }) {
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(circle.name)
  const [bannerPath, setBannerPath] = useState(circle.banner_path ?? null)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [bannerError, setBannerError] = useState('')
  const bannerInputRef = useRef(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function saveRename() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== circle.name) onRename(trimmed)
    setRenaming(false)
  }

  async function handleBannerChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingBanner(true)
    setBannerError('')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${circle.id}/banner.${ext}`
    const { error: uploadError } = await supabase.storage.from('circle-banners').upload(path, file, { upsert: true })
    if (uploadError) {
      setUploadingBanner(false)
      setBannerError(uploadError.message)
      return
    }
    const { error: updateError } = await supabase.from('circles').update({ banner_path: path }).eq('id', circle.id)
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
          <h2 className="font-display text-xl text-ink">Circle settings</h2>
          <div className="flex items-center gap-3">
            <HelpLink to="circles" />
            <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm">
              Close
            </button>
          </div>
        </div>

        <div>
          <TripBanner
            name={circle.name}
            bannerPath={bannerPath}
            accent={accentFor(circle.id)}
            bucket="circle-banners"
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
          <p className="text-xs text-ink-soft mb-1.5">Circle name</p>
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
                  setNameDraft(circle.name)
                }}
                className="text-xs text-ink-soft hover:text-ink shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-ink">{circle.name}</p>
              {canManage && (
                <button onClick={() => setRenaming(true)} className="text-xs font-medium text-primary hover:underline">
                  Rename
                </button>
              )}
            </div>
          )}
        </div>

        {canManage && (
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
                Delete this circle
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-ink-soft">
                  This removes {circle.name} from everyone's dashboard right away. Every Trip already inside it
                  keeps working completely unaffected — this only affects the Circle container itself. Type the
                  circle name to confirm.
                </p>
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={circle.name}
                  className="w-full rounded-lg border border-owe/40 bg-paper px-3.5 py-2 text-sm text-ink focus:border-owe outline-none"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={onArchiveCircle}
                    disabled={deleteConfirmText !== circle.name}
                    className="rounded-full bg-owe text-on-primary text-sm font-medium px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Delete this circle
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
        )}
      </div>
    </div>
  )
}
