import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { clearPendingInvite, inviteProblem, joinPath, setPendingInvite, targetPath } from '../lib/invite'
import { accentFor } from '../components/TripIcon'
import Avatar from '../components/Avatar'
import TripBanner from '../components/TripBanner'
import InviteArt from '../components/InviteArt'
import ThemeToggle from '../components/ThemeToggle'
import { Skeleton } from '../components/Skeleton'

// /join/<token>: what a friend sees when they open an invite link. Public, so it
// works before they have an account. It shows only what the database's preview
// gives a stranger: the trip's name and cover photo, and who invited them.
export default function JoinPage() {
  const { token } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState({ key: '', data: null, error: '' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const userId = user?.id ?? ''
  const key = `${token}|${userId}|${nonce}`

  useEffect(() => {
    if (authLoading) return undefined
    let cancelled = false
    supabase.rpc('preview_invite', { p_token: token }).then(({ data, error }) => {
      if (!cancelled) setResult({ key, data: error ? null : data, error: error ? error.message : '' })
    })
    return () => {
      cancelled = true
    }
  }, [token, authLoading, key])

  const ready = !authLoading && result.key === key
  const preview = ready ? result.data : null
  const state = preview?.state

  // A signed-out person with a good link: remember it so signing up or in
  // brings them straight back here, even after a reload.
  useEffect(() => {
    if (ready && !user && state === 'ok') setPendingInvite(localStorage, token)
  }, [ready, user, state, token])

  // A signed-in person who has now seen the outcome (already in, or the link is
  // dead) no longer needs the invite remembered. Without this, the app would keep
  // sending them back here.
  useEffect(() => {
    if (ready && user && state && state !== 'ok') clearPendingInvite(localStorage)
  }, [ready, user, state])

  async function join() {
    setBusy(true)
    setActionError('')
    const { data, error } = await supabase.rpc('accept_invite', { p_token: token })
    setBusy(false)
    if (error) {
      setActionError(error.message)
      return
    }
    clearPendingInvite(localStorage)
    navigate(targetPath(data.kind, data.target_id), { replace: true })
  }

  const kind = preview?.kind ?? 'trip'
  const noun = kind === 'circle' ? 'circle' : 'trip'
  const who = preview?.inviter_first_name
  const from = joinPath(token)

  let body
  if (!ready) {
    body = (
      <div className="space-y-3 px-6 pb-8 pt-4">
        <Skeleton className="mx-auto h-4 w-40" />
        <Skeleton className="mx-auto h-7 w-56" />
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    )
  } else if (result.error || !preview) {
    body = (
      <div className="px-6 pb-8 pt-6 text-center">
        <p className="font-display text-xl text-ink">We could not load this invite</p>
        <p className="mt-2 text-sm text-ink-soft">Check your connection and try again.</p>
        <button onClick={() => setNonce((n) => n + 1)} className="mt-4 rounded-full border border-line px-5 py-2 text-sm text-ink hover:border-primary">
          Try again
        </button>
      </div>
    )
  } else if (state === 'ok') {
    body = (
      <div className="px-6 pb-8 pt-4 text-center">
        <p className="text-sm text-ink-soft">{who ? `${who} invited you to join` : 'You have been invited to join'}</p>
        <h1 className="mt-1 font-display text-3xl leading-tight text-ink">{preview.name}</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Track shared costs in any currency and settle up with fewer transfers.
        </p>
        {user ? (
          <>
            <button
              onClick={join}
              disabled={busy}
              className="mt-6 w-full rounded-full bg-primary px-5 py-3 font-medium text-on-primary transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {busy ? 'Joining…' : `Join ${preview.name}`}
            </button>
            <p className="mt-3 text-xs text-ink-soft">You will see the people and the expenses in the {noun} after you join.</p>
          </>
        ) : (
          <>
            <Link
              to="/signup"
              state={{ from }}
              className="mt-6 block w-full rounded-full bg-primary px-5 py-3 font-medium text-on-primary transition-colors hover:bg-primary-dark"
            >
              Create account to join
            </Link>
            <Link
              to="/login"
              state={{ from }}
              className="mt-3 block w-full rounded-full border border-line px-5 py-3 text-ink transition-colors hover:border-primary"
            >
              I already have an account
            </Link>
            <p className="mt-3 text-xs text-ink-soft">After you sign up or sign in, you land right inside the {noun}. No code to type.</p>
          </>
        )}
        {actionError && <p className="mt-3 text-sm text-owe">{actionError}</p>}
      </div>
    )
  } else if (state === 'already_member') {
    body = (
      <div className="px-6 pb-8 pt-4 text-center">
        <h1 className="font-display text-2xl leading-tight text-ink">You are already in {preview.name}</h1>
        <Link
          to={targetPath(kind, preview.target_id)}
          replace
          className="mt-6 block w-full rounded-full bg-primary px-5 py-3 font-medium text-on-primary transition-colors hover:bg-primary-dark"
        >
          Open the {noun}
        </Link>
      </div>
    )
  } else {
    const problem = inviteProblem(state, who, kind)
    body = (
      <div className="px-6 pb-8 pt-4 text-center">
        <h1 className="font-display text-2xl leading-tight text-ink">{problem.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{problem.body}</p>
        <Link
          to={user ? '/dashboard' : '/login'}
          className="mt-6 block w-full rounded-full border border-line px-5 py-3 text-ink transition-colors hover:border-primary"
        >
          {user ? 'Go to my trips' : 'Sign in'}
        </Link>
      </div>
    )
  }

  const showArt = ready && preview && preview.state !== 'not_found'
  const seed = preview?.icon_seed ?? token
  return (
    <div className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto flex max-w-md items-center justify-between pb-4">
        <span className="font-display text-lg font-semibold text-primary">Split Expenses</span>
        {!user && <ThemeToggle />}
      </div>
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-raised">
        {showArt &&
          (preview.banner_path ? (
            <TripBanner
              name={preview.name}
              bannerPath={preview.banner_path}
              accent={accentFor(String(seed))}
              className="h-40"
              bucket={kind === 'circle' ? 'circle-banners' : 'group-banners'}
            />
          ) : (
            <InviteArt kind={kind} seed={String(seed)} className="h-40" />
          ))}
        {showArt && state === 'ok' && who && (
          <div className="-mt-7 flex justify-center">
            <span className="rounded-full border-4 border-paper-raised bg-paper-raised">
              <Avatar avatarPath={preview.inviter_avatar_path} name={who} size="lg" />
            </span>
          </div>
        )}
        {body}
      </div>
    </div>
  )
}
