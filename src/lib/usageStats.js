// Usage insights, admin Usage tab (REQ-USE-05..09): the small amount of pure
// logic behind the screens: dates in the admin's timezone, plain-language
// durations, percentages, and the CSV for the stuck-users list. Kept out of
// the component so it can be tested without a browser.
//
// The numbers themselves come from the admin_usage_* database functions
// (migration 050); nothing here recomputes them.

import { csvEscape } from './csvExport'

// Below this many users every percentage is noise, so the screens say so.
export const MIN_USERS = 10

export const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

export const STUCK_SEGMENTS = [
  { key: 'never_signed_in', label: 'Never signed in', stoppedAt: 'Account created, never signed in' },
  { key: 'no_trip', label: 'No trip yet', stoppedAt: 'Signed up, no trip' },
  { key: 'trip_no_expense', label: 'Trip, no expense', stoppedAt: 'In a trip, no expense added' },
  { key: 'never_invited', label: 'Never invited', stoppedAt: 'Adding expenses alone' },
  { key: 'quiet', label: 'Quiet 14+ days', stoppedAt: 'Not seen for 14+ days' },
]

export function adminTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// "YYYY-MM-DD" for the given instant in the given timezone.
export function todayIn(tz, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// The inclusive date range for "last N days", ending today in the admin's zone.
export function periodRange(days, tz, now = new Date()) {
  const to = todayIn(tz, now)
  return { from: addDays(to, -(days - 1)), to }
}

export function notEnoughData(totalUsers) {
  return !(Number(totalUsers) >= MIN_USERS)
}

export function pctOf(n, base) {
  if (n == null || !base) return null
  return Math.round((n / base) * 100)
}

// "4 h 25 min", "6 d 2 h", "under 1 min". null means no data.
export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—'
  const s = Math.max(0, Math.round(Number(seconds)))
  if (s < 60) return 'under 1 min'
  const mins = Math.round(s / 60)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    const m = mins % 60
    return m ? `${hours} h ${m} min` : `${hours} h`
  }
  const days = Math.floor(hours / 24)
  const h = hours % 24
  return h ? `${days} d ${h} h` : `${days} d`
}

export function timeAgo(iso, now = new Date()) {
  if (!iso) return 'never'
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000
  if (Number.isNaN(diff)) return 'never'
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  return `${Math.floor(diff / 86400)} d ago`
}

// Change against a previous value, as text plus a tone for colouring.
export function changeText(current, previous, versus) {
  if (current == null || previous == null) return { text: '', tone: 'flat' }
  const diff = Number(current) - Number(previous)
  if (diff === 0) return { text: `no change ${versus}`, tone: 'flat' }
  const sign = diff > 0 ? '+' : '−'
  return { text: `${sign}${Math.abs(diff)} ${versus}`, tone: diff > 0 ? 'up' : 'down' }
}

// Shapes the funnel response into display rows. Stages 2-3 are measured
// against the stage before; stages 4-6 against users who added an expense.
export function stageRows(funnel) {
  const stages = funnel?.stages ?? []
  const signed = stages[0]?.users ?? 0
  return stages.map((s, i) => {
    const unavailable = s.users == null
    return {
      key: s.key,
      label: s.label,
      users: s.users,
      unavailable,
      pctSignups: unavailable ? null : pctOf(s.users, signed),
      pctBasis: i === 0 || unavailable ? null : pctOf(s.users, s.basis_users),
      basis: s.basis,
      basisUsers: s.basis_users ?? null,
      median: s.median_seconds ?? null,
    }
  })
}

// The stage to blame for the biggest loss among the stages with a basis.
export function biggestDrop(rows) {
  let worst = null
  for (const r of rows) {
    if (r.unavailable || r.basisUsers == null || r.basisUsers < 1) continue
    const lost = r.basisUsers - r.users
    if (lost > 0 && (worst == null || lost / r.basisUsers > worst.share)) {
      worst = { key: r.key, label: r.label, lost, basisUsers: r.basisUsers, share: lost / r.basisUsers }
    }
  }
  return worst
}

// What to show in the "Stopped at" column. For people who never signed in, the
// useful detail is whether their email was ever confirmed: unconfirmed points
// at email delivery, confirmed points at something else (ask them).
export function stoppedAtText(row, segmentKey) {
  const segment = STUCK_SEGMENTS.find((s) => s.key === segmentKey)
  if (segmentKey === 'never_signed_in') {
    if (row.email_confirmed === false) return 'Email never confirmed'
    if (row.email_confirmed === true) return 'Email confirmed, never signed in'
  }
  return segment?.stoppedAt ?? ''
}

// Days a user has been in this state, for the "stuck for" column.
export function stuckForDays(row, segmentKey, now = new Date()) {
  const from = segmentKey === 'quiet' ? row.last_seen_at ?? row.signed_up_at : row.signed_up_at
  if (!from) return null
  return Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 86400000))
}

// CSV for the stuck-users list: names and numbers only, never an email.
export function stuckToCSV(rows, segmentKey, now = new Date()) {
  const segment = STUCK_SEGMENTS.find((s) => s.key === segmentKey)
  // Only this group carries the email-confirmed yes/no (never the address).
  const withEmailFlag = segmentKey === 'never_signed_in'
  const header = ['Name', 'Segment', 'Signed up', 'Last seen', 'Trips', 'Expenses', 'Days stuck']
  if (withEmailFlag) header.push('Email confirmed')
  const lines = rows.map((r) => [
    r.display_name,
    segment?.label ?? segmentKey,
    r.signed_up_at ? String(r.signed_up_at).slice(0, 10) : '',
    r.last_seen_at ? String(r.last_seen_at).slice(0, 10) : '',
    r.trips ?? '',
    r.expenses ?? '',
    stuckForDays(r, segmentKey, now) ?? '',
    ...(withEmailFlag ? [r.email_confirmed === true ? 'yes' : r.email_confirmed === false ? 'no' : ''] : []),
  ])
  return [header, ...lines].map((line) => line.map(csvEscape).join(',')).join('\n')
}

// ---- Feature adoption (REQ-USE-10) -------------------------------------
// The database counts (migration 056); the diagnosis is decided here so the
// thresholds can be tuned in one place. Percentages are of active users.
export const DISCOVERY_GAP_BELOW_PCT = 15
export const QUALITY_GAP_BELOW_PCT = 30

export const FEATURES = [
  { key: 'receipt_scan', label: 'Receipt scan' },
  { key: 'text_parse', label: 'Describe it (text parse)' },
  { key: 'itemized_split', label: 'Itemized split' },
  { key: 'csv_import', label: 'CSV import' },
  { key: 'csv_export', label: 'CSV export' },
  { key: 'settle_up', label: 'Settle up' },
  { key: 'invite_link', label: 'Invite link' },
  { key: 'circles', label: 'Circles' },
  { key: 'trip_reports', label: 'Trip reports' },
  { key: 'rates', label: 'Exchange rates page' },
  { key: 'reminders', label: 'Trip end date (reminders)' },
  { key: 'push_optin', label: 'Push notifications' },
  { key: 'offline_queue', label: 'Offline queue' },
  { key: 'help', label: 'Help' },
  { key: 'tour', label: 'Welcome tour' },
]

export const DIAGNOSES = {
  discovery: { label: 'Discovery gap', hint: 'Few people have tried it: they may not know it exists.' },
  quality: { label: 'Quality gap', hint: 'Plenty tried it but few came back: it may not be good enough yet.' },
  healthy: { label: 'Healthy', hint: 'Tried by many and repeated by enough of them.' },
}

// null means "no diagnosis": too few users, or nobody was active. Integer
// arithmetic keeps the boundaries exact (exactly 15% is not a discovery gap,
// exactly 30% is not a quality gap).
export function featureDiagnosis({ tried, repeated, active, totalUsers }) {
  if (notEnoughData(totalUsers)) return null
  if (!(Number(active) > 0)) return null
  const t = Number(tried) || 0
  const r = Number(repeated) || 0
  if (t * 100 < DISCOVERY_GAP_BELOW_PCT * active) return 'discovery'
  if (r * 100 < QUALITY_GAP_BELOW_PCT * t) return 'quality'
  return 'healthy'
}

// Turns the database response into display rows, in the fixed feature order.
export function featureRows(result) {
  const active = Number(result?.active_users) || 0
  const totalUsers = Number(result?.total_users) || 0
  const byKey = new Map((result?.features ?? []).map((f) => [f.feature, f]))
  return FEATURES.map((f) => {
    const tried = Number(byKey.get(f.key)?.tried) || 0
    const repeated = Math.min(Number(byKey.get(f.key)?.repeated) || 0, tried)
    return {
      key: f.key,
      label: f.label,
      tried,
      repeated,
      triedOnce: tried - repeated,
      pctTried: pctOf(tried, active),
      pctRepeated: pctOf(repeated, active),
      diagnosis: featureDiagnosis({ tried, repeated, active, totalUsers }),
    }
  })
}

// ---- Top events this week (REQ-USE-11) ----------------------------------
// Event keys come from migration 057: feature_used:<feature>,
// page_view:<route>, or the plain event name.
const EVENT_NAMES = {
  app_open: 'Opened the app',
  trip_created: 'Created a trip',
  expense_added: 'Added an expense',
  settled_up: 'Settled up',
  member_invited: 'Invited a member',
  invite_shared: 'Shared an invite link',
}

const ROUTE_NAMES = {
  '/': 'the home page',
  '/dashboard': 'the trips list',
  '/trips/:id': 'a trip',
  '/circles/:id': 'a Circle',
  '/rates': 'Exchange rates',
  '/help': 'Help',
  '/profile': 'Profile',
  '/admin': 'Admin',
  '/join/:token': 'an invite link',
  '/login': 'sign in',
  '/signup': 'sign up',
  '/forgot-password': 'forgot password',
  '/reset-password': 'reset password',
  '/other': 'another page',
}

export function eventLabel(key) {
  const k = String(key ?? '')
  if (EVENT_NAMES[k]) return EVENT_NAMES[k]
  if (k.startsWith('feature_used:')) {
    const feature = k.slice('feature_used:'.length)
    const known = FEATURES.find((f) => f.key === feature)
    // Lower-case the first letter of a normal word, but leave acronyms like CSV alone.
    const name = known ? known.label.replace(/^([A-Z])([a-z])/, (_, a, b) => a.toLowerCase() + b) : feature.replace(/_/g, ' ')
    return `Used ${name}`
  }
  if (k.startsWith('page_view:')) {
    const route = k.slice('page_view:'.length)
    return `Viewed ${ROUTE_NAMES[route] ?? route}`
  }
  return k.replace(/_/g, ' ')
}

// Display rows for the card: label, people, and their share of active people.
export function topEventRows(result) {
  const active = Number(result?.active_users) || 0
  return (result?.events ?? []).map((e) => ({
    key: e.event,
    label: eventLabel(e.event),
    users: Number(e.users) || 0,
    pct: pctOf(Number(e.users) || 0, active),
  }))
}
