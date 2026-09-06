import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { SkeletonRows } from './Skeleton'
import EmptyState from './EmptyState'

// One hand-drawn icon per event type, matching CategoryIcon's style
// rather than pulling in an icon library for eight glyphs.
function EventIcon({ type }) {
  const paths = {
    expense_added: <path d="M10 5v10M5 10h10" strokeLinecap="round" />,
    expense_edited: (
      <path d="M13 4.5 15.5 7 7 15.5H4.5V13L13 4.5Z" strokeLinejoin="round" strokeLinecap="round" />
    ),
    expense_deleted: (
      <>
        <path d="M5 6.5h10M8 6.5V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 6.5 7 15a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    settlement_added: <path d="M4.5 10.5 8 14l7.5-8" strokeLinecap="round" strokeLinejoin="round" />,
    settlement_deleted: <path d="M6 10a4 4 0 0 1 4-4h4M14 6l-2.5-2.5M14 6l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />,
    member_joined: (
      <>
        <circle cx="8" cy="7.5" r="2.5" />
        <path d="M3.5 16c.5-3 2.2-4.5 4.5-4.5s4 1.5 4.5 4.5" strokeLinecap="round" />
        <path d="M14.5 8v4M16.5 10h-4" strokeLinecap="round" />
      </>
    ),
    member_removed: (
      <>
        <circle cx="8" cy="7.5" r="2.5" />
        <path d="M3.5 16c.5-3 2.2-4.5 4.5-4.5s4 1.5 4.5 4.5" strokeLinecap="round" />
        <path d="M12.5 10h4" strokeLinecap="round" />
      </>
    ),
    csv_import: <path d="M10 14V5M6 9l4-4 4 4M4.5 16h11" strokeLinecap="round" strokeLinejoin="round" />,
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4" aria-hidden="true">
      {paths[type] ?? <circle cx="10" cy="10" r="6" />}
    </svg>
  )
}

const TEMPLATES = {
  expense_added: (e) => `${e.actor_name} added an expense: ${e.summary}`,
  expense_edited: (e) => `${e.actor_name} edited an expense: ${e.summary}`,
  expense_deleted: (e) => `${e.actor_name} deleted an expense: ${e.summary}`,
  settlement_added: (e) => `${e.actor_name} recorded a payment: ${e.summary}`,
  settlement_deleted: (e) => `${e.actor_name} undid a payment: ${e.summary}`,
  member_joined: (e) => `${e.summary} joined the trip`,
  member_removed: (e) => `${e.summary} was removed from the trip`,
  csv_import: (e) => `${e.actor_name} imported ${e.summary}`,
}

export default function ActivityFeed({ groupId }) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('activity_events')
      .select('id, actor_name, event_type, summary, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        setEvents(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  if (events === null) return <SkeletonRows count={6} trailing={false} />

  if (error) return <p className="text-sm text-owe">{error}</p>

  if (events.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M10 5v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="10" r="7.5" />
          </svg>
        }
        title="Nothing yet"
        subtitle="Activity in this trip — expenses, payments, and member changes — will show up here."
      />
    )
  }

  return (
    <ul className="divide-y divide-line border-y border-line">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-3.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary">
            <EventIcon type={e.event_type} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">{(TEMPLATES[e.event_type] ?? ((ev) => ev.summary))(e)}</p>
            <p className="text-xs text-ink-soft mt-0.5">
              {new Date(e.created_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
