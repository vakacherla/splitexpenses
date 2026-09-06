import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useAuth } from './context/AuthContext'
import ConfigGate from './components/ConfigGate'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import LoadingScreen from './components/LoadingScreen'
import Navbar from './components/Navbar'
import SyncStatusBanner from './components/SyncStatusBanner'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import GroupView from './pages/GroupView'

const CirclePage = lazy(() => import('./pages/CirclePage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const RatesPage = lazy(() => import('./pages/RatesPage'))

function AppShell({ children }) {
  const { user } = useAuth()
  return (
    <div className="min-h-dvh bg-paper">
      {user && <Navbar />}
      {user && <SyncStatusBanner />}
      {children}
    </div>
  )
}

function Root() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <ConfigGate>
      <AppShell>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/help"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <HelpPage />
              </Suspense>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <ProfilePage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rates"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <RatesPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:groupId"
            element={
              <ProtectedRoute>
                <GroupView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/circles/:circleId"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <CirclePage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <AdminPage />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </ConfigGate>
  )
}
