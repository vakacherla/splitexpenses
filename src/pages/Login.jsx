import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import ThemeToggle from '../components/ThemeToggle'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(location.state?.from ?? '/dashboard', { replace: true })
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
          <h1 className="font-display text-3xl text-ink">Split Expenses</h1>
          <p className="mt-2 text-sm text-ink-soft">Shared expenses, any currency.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-paper-raised border border-line rounded-2xl p-6 shadow-raised space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-ink-soft mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-ink-soft mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>

          {error && <p className="text-sm text-owe">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary text-on-primary font-medium py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          New here?{' '}
          <Link to="/signup" className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
