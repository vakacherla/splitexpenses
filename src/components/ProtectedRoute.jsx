import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'
import SuspendedScreen from './SuspendedScreen'

export default function ProtectedRoute({ children }) {
  const { user, loading, suspended } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (suspended) return <SuspendedScreen />
  return children
}
