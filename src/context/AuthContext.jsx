import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { nextPasswordRecoveryState } from '../lib/authRecovery'

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      setPasswordRecovery((current) => nextPasswordRecoveryState(event, current))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

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

  function fetchProfile(userId) {
    return supabase
      .from('profiles')
      .select('id, display_name, email, is_admin, is_super_admin, avatar_path')
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
