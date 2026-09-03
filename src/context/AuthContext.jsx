import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null)

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
      return
    }
    let cancelled = false
    fetchProfile(session.user.id).then((data) => {
      if (!cancelled) setProfile(data)
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
      .then(({ data }) => data)
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading: session === undefined,
    signOut: () => supabase.auth.signOut(),
    // Lets any page (the Profile page, after a save) pull the shared
    // profile — display name, avatar — back in sync without a reload.
    refreshProfile: () => session?.user && fetchProfile(session.user.id).then(setProfile),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
