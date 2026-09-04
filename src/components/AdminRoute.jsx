import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'

export default function AdminRoute({ children }) {
  const { user, profile, profileError, loading, refreshProfile } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (!profile) {
    // Without this branch, a profile fetch that fails (typically: no
    // signal) left this screen spinning on "Checking access…" forever —
    // `profile` never arrives, so it never reaches the is_admin check
    // below or the redirect either.
    if (profileError) {
      return (
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-owe mb-3">Couldn't verify admin access — check your connection.</p>
          <button onClick={refreshProfile} className="text-primary hover:underline text-sm">
            Retry
          </button>
        </div>
      )
    }
    return <LoadingScreen label="Checking access…" />
  }
  if (!profile.is_admin) return <Navigate to="/dashboard" replace />
  return children
}
