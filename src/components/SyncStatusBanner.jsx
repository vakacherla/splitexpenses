import { useEffect, useState } from 'react'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { useOfflineQueue, useIsSyncing, getLastConflicts, runSync, retryOp, discardOp } from '../lib/offlineQueue'

// Small hand-drawn line icons, matching the stroke style used everywhere
// else in the app (CategoryIcon, the trip-settings gear, etc.) rather
// than pulling in an icon library for four glyphs.
function OfflineIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        d="M4 7.2a10 10 0 0 1 12 0M6.3 10a6.5 6.5 0 0 1 7.4 0M8.6 12.8a3 3 0 0 1 2.8 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="10" cy="15.5" r="1" fill="currentColor" />
      <path d="M3 3.5l14 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SyncingIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true">
      <path
        d="M16 8.5A6 6 0 0 0 5.6 5.8M4 11.5a6 6 0 0 0 10.4 2.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M4.3 4.3v3.6h3.6M15.7 15.7v-3.6h-3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PendingIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6.2v4l2.8 1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M10 3.3 17.3 16H2.7L10 3.3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 8.3v3.3M10 14h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// The app's first toast/banner primitive — nothing like it existed before
// offline mode needed a place to say "you're offline," "syncing," or
// "this couldn't sync" somewhere more visible than a per-form error line.
export default function SyncStatusBanner() {
  const isOnline = useOnlineStatus()
  const queue = useOfflineQueue()
  const syncing = useIsSyncing()
  const [conflicts, setConflicts] = useState([])
  const [dismissedConflicts, setDismissedConflicts] = useState(false)

  const pending = queue.filter((op) => op.status !== 'failed')
  const failed = queue.filter((op) => op.status === 'failed')

  // Conflict summaries are transient — read once syncing finishes, shown
  // until dismissed or the next sync run replaces them.
  useEffect(() => {
    if (!syncing) {
      const latest = getLastConflicts()
      if (latest.length > 0) {
        setConflicts(latest)
        setDismissedConflicts(false)
      }
    }
  }, [syncing])

  if (isOnline && queue.length === 0 && (dismissedConflicts || conflicts.length === 0)) return null

  return (
    <div className="border-b border-line bg-paper-raised px-4 py-3 text-base">
      <div className="mx-auto max-w-3xl flex flex-col gap-2">
        {!isOnline && (
          <p className="text-owe flex items-center gap-2">
            <OfflineIcon />
            You're offline — {pending.length > 0 ? `${pending.length} change${pending.length === 1 ? '' : 's'} will sync when you're back online.` : "changes you make will sync when you're back online."}
          </p>
        )}

        {isOnline && syncing && (
          <p className="text-owed flex items-center gap-2">
            <SyncingIcon />
            Syncing {pending.length} change{pending.length === 1 ? '' : 's'}…
          </p>
        )}

        {isOnline && !syncing && pending.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-ink-soft flex items-center gap-2">
              <PendingIcon />
              {pending.length} change{pending.length === 1 ? '' : 's'} waiting to sync
            </p>
            <button onClick={() => runSync()} className="text-sm font-medium text-primary hover:underline shrink-0">
              Retry now
            </button>
          </div>
        )}

        {failed.map((op) => (
          <div key={op.opId} className="flex items-center justify-between gap-3">
            <p className="text-owe flex items-center gap-2 truncate">
              <WarningIcon />
              Couldn't sync a change{op.lastError ? ` — ${op.lastError}` : ''}
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={() => retryOp(op.opId)} className="text-sm font-medium text-primary hover:underline">
                Retry
              </button>
              <button onClick={() => discardOp(op.opId)} className="text-sm font-medium text-owe hover:underline">
                Discard
              </button>
            </div>
          </div>
        ))}

        {conflicts.length > 0 && !dismissedConflicts && (
          <div className="flex items-start justify-between gap-3">
            <ul className="text-accent space-y-1">
              {conflicts.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5">
                    <WarningIcon />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setDismissedConflicts(true)}
              className="text-sm text-ink-soft hover:text-ink shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
