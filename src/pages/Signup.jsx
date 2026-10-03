import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import ThemeToggle from '../components/ThemeToggle'
import TurnstileWidget from '../components/TurnstileWidget'
import { captchaOptions } from '../lib/turnstile'
import { USAGE_NOTICE } from '../lib/usageNotice'
import { signupErrorMessage, THROWAWAY_EMAIL_MESSAGE } from '../lib/signup'
import { getPendingInvite, joinPath, postAuthPath } from '../lib/invite'

export default function Signup() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const [captchaError, setCaptchaError] = useState('')
  const [done, setDone] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    // Friendly pre-check; the database refuses throwaway domains regardless.
    // If the check itself fails, carry on and let the server decide.
    const { data: allowed, error: checkError } = await supabase.rpc('signup_email_allowed', { p_email: email })
    if (!checkError && allowed === false) {
      setBusy(false)
      setCaptchaReset((n) => n + 1)
      setError(THROWAWAY_EMAIL_MESSAGE)
      return
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        ...captchaOptions(captchaToken),
        data: { display_name: displayName.trim() },
        // With confirmation on, the link in the email opens on whatever device the
        // person reads mail on, so the invite has to ride along in the address.
        emailRedirectTo: `${window.location.origin}${getPendingInvite(localStorage) ? joinPath(getPendingInvite(localStorage)) : '/login'}`,
      },
    })
    setBusy(false)
    if (error) {
      setCaptchaReset((n) => n + 1)
      setError(signupErrorMessage(error))
      return
    }
    if (data.session) {
      navigate(postAuthPath(location.state?.from, localStorage), { replace: true })
    } else {
      // Email confirmation is required by this Supabase project's auth settings.
      setDone(true)
    }
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
            We sent a confirmation link to <span className="text-ink">{email}</span>. Follow it, then come back
            and sign in.
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
          <h1 className="font-display text-3xl text-ink">Split Expenses</h1>
          <p className="mt-2 text-sm text-ink-soft">Shared expenses, any currency.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-paper-raised border border-line rounded-2xl p-6 shadow-raised space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm text-ink-soft mb-1.5">
              Your name
            </label>
            <input
              id="name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How your trip mates will see you"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>
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
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>

          {error && <p className="text-sm text-owe">{error}</p>}

          <TurnstileWidget onToken={setCaptchaToken} onLoadError={setCaptchaError} resetCount={captchaReset} />
          {captchaError && <p className="text-sm text-owe">{captchaError} Check your connection or content blocker and reload.</p>}
          <button
            type="submit"
            disabled={busy || !captchaToken}
            className="w-full rounded-full bg-primary text-on-primary font-medium py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p className="text-xs text-ink-soft">
            {USAGE_NOTICE} You can switch this off any time in your profile.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
