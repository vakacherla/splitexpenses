import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { detectDevice, readDeviceEnv } from './device'
import {
  HEARTBEAT_MS,
  flushEvents,
  heartbeatDue,
  routePattern,
  setTrackingEnabled,
  takeAppOpen,
  touchLastSeen,
  track,
} from './track'

// Usage insights (REQ-USE-01, 03, 04). Mounted once inside the app shell.
//
// Tracking runs only when the person is signed in, not suspended, and their
// profile has loaded with "Share usage data" switched on. While the profile is
// still loading the answer is unknown, so nothing is sent. The database
// enforces the same rule again (migration 049), so a stale cache here cannot
// record anything for someone who opted out.
export function useUsageTracking() {
  const { user, profile, suspended } = useAuth()
  const { pathname } = useLocation()
  const userId = user?.id
  const enabled = Boolean(userId) && !suspended && profile?.share_usage === true

  useEffect(() => {
    setTrackingEnabled(enabled)
    return () => setTrackingEnabled(false)
  }, [enabled, userId])

  // Once per browser session, with coarse device labels (never the raw UA).
  useEffect(() => {
    if (!enabled) return
    let storage
    try {
      storage = sessionStorage
    } catch {
      storage = undefined
    }
    if (takeAppOpen(storage)) track('app_open', detectDevice(readDeviceEnv()))
  }, [enabled, userId])

  // Route patterns only, never real ids.
  useEffect(() => {
    if (enabled) track('page_view', { route: routePattern(pathname) })
  }, [enabled, pathname])

  // "Active now" and last seen, only while the tab is visible.
  useEffect(() => {
    if (!enabled) return undefined
    let last = null
    const beat = () => {
      const now = Date.now()
      if (heartbeatDue({ now, last, visible: document.visibilityState === 'visible' })) {
        last = now
        touchLastSeen()
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushEvents()
      else beat()
    }
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS / 2)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushEvents)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushEvents)
    }
  }, [enabled, userId])
}
