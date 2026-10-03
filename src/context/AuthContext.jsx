import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { nextPasswordRecoveryState } from '../lib/authRecovery'
import { setCurrentUserId } from '../lib/offlineQueue'

const AuthContext = createContext(null)

// `profile` (and with it, is_admin) starts at null and only has something
// real in it after a network round trip — on every fresh page load that's
// a visible window where the Navbar silently has no Admin link and no
// name, which reads as "it's missing" rather than "it's still loading."
// Caching the last-known profile per user id means a returning session
// renders instantly from cache while the real fetch below confirms (or
// corrects) it in the background, same reasoning as fx.js's rate cache.
const PROFILE_CACHE_KEY = 'ledger_profile_cache_v1'

function readCachedProfile(userId) {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw)
    return cache?.userId === userId ? cache.profile : null
  } catch {
    return null
  }
}

function writeCachedProfile(userId, profile) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile }))
  } catch {
    // storage unavailable (private browsing, quota) — safe to skip
  }
}

function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  // Set when Supabase reports a PASSWORD_RECOVERY auth event (the session
  // created by clicking a "reset your password" email link). Kept separate
  // from `session` so the app can force the user to the reset-password form
  // instead of treating this like a normal sign-in and routing them into the
  // dashboard with a session they never set a password for.
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  // AU-04: holds the id of a signed-in person the database reports as suspended
  // (migration 047). Their open session keeps a valid token for a while after
  // an admin suspends them, but every data request is refused, so the app
  // swaps to a "suspended" screen instead of showing broken pages.
  const [suspendedUserId, setSuspendedUserId] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      setPasswordRecovery((current) => nextPasswordRecoveryState(event, current))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // OFF-16 / AUTH-07: lets the offline write queue scope itself to
  // whoever's actually signed in right now, rather than being one shared,
  // unlabeled bucket anyone on this device can see or sync into.
  useEffect(() => {
    if (session === undefined) return // still loading the initial session
    setCurrentUserId(session?.user?.id ?? null)
  }, [session])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setProfileError('')
      return
    }
    // Render the last-known profile immediately so the Navbar's Admin
    // link/name don't flash blank while the real fetch below is in
    // flight — it's overwritten the moment that fetch resolves, so a
    // stale cache (e.g. is_admin revoked elsewhere) only persists for
    // one render.
    const cached = readCachedProfile(session.user.id)
    if (cached) setProfile(cached)
    let cancelled = false
    fetchProfile(session.user.id)
      .then((data) => {
        if (!cancelled) {
          setProfile(data)
          setProfileError('')
          writeCachedProfile(session.user.id, data)
        }
      })
      .catch((err) => {
        // No offline fallback for this — but leaving `profile` stuck at
        // null forever (its previous behavior) is what made AdminRoute
        // hang indefinitely on "Checking access…" with no signal. This at
        // least gives it something to show instead of spinning forever.
        // The cached profile (if any) from above stays in place rather
        // than being cleared, so a transient network blip offline still
        // shows the right nav instead of losing it.
        if (!cancelled) setProfileError(err.message || 'Could not load your profile.')
      })
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  // Ask the database whether this person is suspended: once when the session
  // starts, then again whenever the tab regains focus and once a minute, so a
  // suspension takes effect without them having to reload.
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const check = () =>
      supabase.rpc('is_suspended').then(({ data, error }) => {
        // On any error (offline, a blip) leave the current state alone rather
        // than flipping someone to "suspended" or back by accident.
        if (!cancelled && !error && typeof data === 'boolean') setSuspendedUserId(data ? userId : null)
      })
    check()
    const timer = setInterval(check, 60000)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])

  function fetchProfile(userId) {
    return supabase
      .from('profiles')
      .select('id, display_name, email, is_admin, is_super_admin, avatar_path, share_usage')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error) throw error
        return data
      })
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    profileError,
    loading: session === undefined,
    passwordRecovery,
    suspended: Boolean(session?.user) && suspendedUserId === session.user.id,
    clearPasswordRecovery: () => setPasswordRecovery(false),
    signOut: () => {
      clearCachedProfile()
      return supabase.auth.signOut()
    },
    // Lets any page (the Profile page, after a save) pull the shared
    // profile — display name, avatar — back in sync without a reload.
    refreshProfile: () =>
      session?.user &&
      fetchProfile(session.user.id)
        .then((data) => {
          setProfile(data)
          setProfileError('')
          writeCachedProfile(session.user.id, data)
        })
        .catch((err) => setProfileError(err.message || 'Could not load your profile.')),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
