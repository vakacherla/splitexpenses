import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { timeAgo, timelineGroups } from '../lib/usageStats'
import Avatar from './Avatar'
import { Skeleton } from './Skeleton'

// One person's last 30 days (REQ-USE-12): what they opened and used, and what
// they did in trips, newest first. Name and avatar only, never an email, and no
// trip names, expense text or amounts (the database function never returns them).
// Opened from Admin > Usage > Stuck users and Funnel lists and from the Users tab.
export default function UserTimeline({ user, tz, onClose }) {
  const [state, setState] = useState({ key: '', data: null, error: '' })
  const key = `${user.id}|${tz}`

  useEffect(() => {
    let cancelled = false
    supabase.rpc('admin_usage_user_timeline', { p_user: user.id, p_tz: tz }).then(({ data, error }) => {
      if (!cancelled) setState({ key, data: error ? null : data, error: error ? error.message : '' })
    })
    return () => {
      cancelled = true
    }
  }, [user.id, tz, key])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const current = state.key === key
  const loading = !current
  const data = current ? state.data : null
  const error = current ? state.error : ''
  const groups = data ? timelineGroups(data.events, tz) : []
  const events = data?.events ?? []
  const total = data?.total ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Activity for ${user.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-paper-raised rounded-t-3xl sm:rounded-2xl border border-line shadow-raised max-h-[88dvh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-paper-raised px-5 sm:px-6 pt-5 pb-3 border-b border-line flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar avatarPath={data?.user?.avatar_path ?? user.avatarPath} name={user.name} size="md" />
            <div className="min-w-0">
              <h2 className="font-display text-xl text-ink truncate">{data?.user?.display_name ?? user.name}</h2>
              {data && (
                <p className="text-xs text-ink-soft">
                  Signed up {timeAgo(data.user.signed_up_at)} · last seen {timeAgo(data.user.last_seen_at)}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm shrink-0">
            Close
          </button>
        </div>

        <div className="px-5 sm:px-6 py-4 space-y-4">
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {error && <p className="text-sm text-owe">Could not load this: {error}</p>}
          {data && (
            <>
              <p className="text-xs text-ink-soft">
                The last {data.days} days, newest first. Only what someone did is listed: no trip names, amounts or messages.
              </p>
              {data.user.share_usage === false && (
                <p className="rounded-lg bg-accent-tint text-ink text-sm px-3 py-2">
                  This person turned usage data off, so only what they did in trips is shown, not what they opened.
                </p>
              )}
              {events.length === 0 ? (
                <p className="text-sm text-ink-soft">Nothing recorded for this person in the last {data.days} days.</p>
              ) : (
                groups.map((g) => (
                  <section key={g.key}>
                    <h3 className="text-xs uppercase tracking-wide text-ink-soft font-medium mb-1">{g.heading}</h3>
                    <ul className="divide-y divide-line border-y border-line">
                      {g.items.map((it, i) => (
                        <li key={`${it.key}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                          <span className="text-ink">{it.label}</span>
                          <span className="num text-xs text-ink-soft shrink-0">{it.time}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
              {total > events.length && (
                <p className="text-xs text-ink-soft">Showing the {events.length} most recent of {total}.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
