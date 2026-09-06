import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import ThemeToggle from '../components/ThemeToggle'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-dvh bg-paper flex items-center justify-center px-4 py-12 relative">
        <div className="absolute top-4 right-4 flex items-center gap-3">
          <Link to="/help" className="text-sm text-ink-soft hover:text-ink">
            Help
          </Link>
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm text-center bg-paper-raised border border-line rounded-2xl p-8 shadow-raised">
          <h1 className="font-display text-2xl text-ink mb-2">Check your email</h1>
          <p className="text-sm text-ink-soft">
            If an account exists for <span className="text-ink">{email}</span>, we sent a link to reset your
            password.
          </p>
          <Link to="/login" className="inline-block mt-6 text-primary font-medium hover:underline text-sm">
            Back to sign in
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
          <img src="/icon.svg" alt="" className="h-12 w-12 rounded-2xl mx-auto mb-3" />
          <h1 className="font-display text-3xl text-ink">Reset your password</h1>
          <p className="mt-2 text-sm text-ink-soft">We'll email you a link to choose a new one.</p>
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

          {error && <p className="text-sm text-owe">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary text-on-primary font-medium py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          <Link to="/login" className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
