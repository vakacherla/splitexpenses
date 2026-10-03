// Usage insights (REQ-USE-03, REQ-USE-04): a tiny first-party event tracker.
//
// Rules this file keeps, matching migration 049:
//  - only fixed event names and a few short, allowlisted props are ever sent:
//    never an amount, description, name, email or trip name;
//  - it never blocks or breaks the app: every failure is swallowed;
//  - nothing is sent offline (dropped, not queued) and nothing is sent unless
//    tracking is switched on for the signed-in person;
//  - events are batched and sent in one request.
//
// `createTracker` is pure plumbing with injected dependencies so it can be
// tested without a browser or network; the default instance at the bottom is
// the one the app uses.

import { supabase } from './supabaseClient'

export const FLUSH_MS = 5000
export const MAX_BATCH = 25
export const HEARTBEAT_MS = 2 * 60 * 1000

// Turns a real path into a route pattern so ids never leave the browser.
// Unknown paths become "/other" rather than being sent as typed.
const STATIC_ROUTES = new Set([
  '/', '/login', '/signup', '/forgot-password', '/reset-password',
  '/help', '/dashboard', '/profile', '/rates', '/admin',
])
const PARAM_ROUTES = [
  [/^\/trips\/[^/]+$/, '/trips/:id'],
  [/^\/groups\/[^/]+$/, '/trips/:id'],
  [/^\/circles\/[^/]+$/, '/circles/:id'],
]

export function routePattern(pathname) {
  const path = String(pathname || '/').split(/[?#]/)[0].replace(/(.)\/+$/, '$1')
  if (STATIC_ROUTES.has(path)) return path
  for (const [re, pattern] of PARAM_ROUTES) {
    if (re.test(path)) return pattern
  }
  return '/other'
}

// Whether a last-seen heartbeat is due: the tab must be visible and at least
// minMs must have passed since the last one.
export function heartbeatDue({ now, last, visible, minMs = HEARTBEAT_MS }) {
  if (!visible) return false
  return last == null || now - last >= minMs
}

// True the first time it is called in a browser session, so app_open is sent
// once per session. Storage is injected; a missing or throwing storage counts
// as "first time" only once per page load via the fallback flag.
let openedFallback = false
export function takeAppOpen(storage, key = 'ledger_usage_opened') {
  try {
    if (storage && storage.getItem(key)) return false
    storage?.setItem(key, '1')
    if (storage) return true
  } catch {
    // storage blocked: fall through to the in-memory flag
  }
  if (openedFallback) return false
  openedFallback = true
  return true
}

export function createTracker({ send, getSessionId, isOnline = () => true, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let queue = []
  let enabled = false
  let timer = null

  function clear() {
    queue = []
    if (timer != null) {
      clearTimer(timer)
      timer = null
    }
  }

  function schedule() {
    if (timer == null && queue.length > 0) {
      timer = setTimer(() => {
        timer = null
        flush()
      }, FLUSH_MS)
    }
  }

  function flush() {
    if (timer != null) {
      clearTimer(timer)
      timer = null
    }
    if (!enabled || queue.length === 0) return Promise.resolve()
    const batch = queue.slice(0, MAX_BATCH)
    queue = queue.slice(MAX_BATCH)
    schedule()
    // Offline: drop the batch instead of keeping it, so old events are never
    // replayed later with a misleading server timestamp.
    if (!isOnline()) return Promise.resolve()
    try {
      return Promise.resolve(send(batch, getSessionId())).then(
        () => undefined,
        () => undefined,
      )
    } catch {
      return Promise.resolve()
    }
  }

  function track(name, props) {
    if (!enabled || typeof name !== 'string') return
    const event = props && typeof props === 'object' ? { name, props } : { name }
    queue.push(event)
    if (queue.length >= MAX_BATCH) flush()
    else schedule()
  }

  function setEnabled(value) {
    enabled = Boolean(value)
    if (!enabled) clear()
  }

  return { track, flush, setEnabled, reset: clear, get pending() { return queue.length } }
}

let memorySession = null
function sessionId() {
  try {
    const stored = sessionStorage.getItem('ledger_usage_session')
    if (stored) return stored
    const fresh = randomId()
    sessionStorage.setItem('ledger_usage_session', fresh)
    return fresh
  } catch {
    if (!memorySession) memorySession = randomId()
    return memorySession
  }
}

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(16).slice(2) + Date.now().toString(16)
  }
}

const tracker = createTracker({
  send: (events, session) => supabase.rpc('track_events', { p_events: events, p_session: session }),
  getSessionId: sessionId,
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
})

export const track = tracker.track
export const flushEvents = tracker.flush
export const setTrackingEnabled = tracker.setEnabled
export const resetTracking = tracker.reset

export function touchLastSeen() {
  return Promise.resolve(supabase.rpc('touch_last_seen')).then(
    () => undefined,
    () => undefined,
  )
}
