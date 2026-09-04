import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setProfileError('')
      return
    }
    let cancelled = false
    fetchProfile(session.user.id)
      .then((data) => {
        if (!cancelled) {
          setProfile(data)
          setProfileError('')
        }
      })
      .catch((err) => {
        // No offline fallback for this — but leaving `profile` stuck at
        // null forever (its previous behavior) is what made AdminRoute
        // hang indefinitely on "Checking access…" with no signal. This at
        // least gives it something to show instead of spinning forever.
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
    signOut: () => supabase.auth.signOut(),
    // Lets any page (the Profile page, after a save) pull the shared
    // profile — display name, avatar — back in sync without a reload.
    refreshProfile: () =>
      session?.user &&
      fetchProfile(session.user.id)
        .then((data) => {
          setProfile(data)
          setProfileError('')
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
