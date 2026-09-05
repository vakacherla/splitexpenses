import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import ThemeToggle from '../components/ThemeToggle'
import LoadingScreen from '../components/LoadingScreen'

// Reached by following the link in a "reset your password" email. Supabase
// exchanges the link's code for a session automatically (supabaseClient's
// default detectSessionInUrl) and AuthContext picks it up — but that happens
// asynchronously, so this page waits briefly for a session to appear before
// concluding the link itself was invalid or expired, rather than flashing
// that message on every load.
export default function ResetPassword() {
  const { user, loading } = useAuth()
  const [graceExpired, setGraceExpired] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => setGraceExpired(true), 4000)
    return () => clearTimeout(timer)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/dashboard', { replace: true })
  }

  if (loading || (!user && !graceExpired)) return <LoadingScreen />

  if (!user) {
    return (
      <div className="min-h-dvh bg-paper flex items-center justify-center px-4 py-12 relative">
        <div className="absolute top-4 right-4 flex items-center gap-3">
          <Link to="/help" className="text-sm text-ink-soft hover:text-ink">
            Help
          </Link>
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm text-center bg-paper-raised border border-line rounded-2xl p-8 shadow-raised">
          <h1 className="font-display text-2xl text-ink mb-2">Link expired</h1>
          <p className="text-sm text-ink-soft">
            This password reset link is invalid or has expired. Request a new one to continue.
          </p>
          <Link
            to="/forgot-password"
            className="inline-block mt-6 text-primary font-medium hover:underline text-sm"
          >
            Request a new link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-paper flex items-center justify-center px-4 py-12 relative">
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <Link to="/help" className="text-sm text-ink-soft hover:text-ink">
          Help
        </Link>
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl text-ink">Choose a new password</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-paper-raised border border-line rounded-2xl p-6 shadow-raised space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm text-ink-soft mb-1.5">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm text-ink-soft mb-1.5">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>

          {error && <p className="text-sm text-owe">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary text-on-primary font-medium py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>
    </div>
  )
}
