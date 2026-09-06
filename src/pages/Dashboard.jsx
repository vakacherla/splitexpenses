import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import CurrencySelect from '../components/CurrencySelect'
import { SkeletonRows } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Avatar from '../components/Avatar'
import TripBanner from '../components/TripBanner'
import { accentFor } from '../components/TripIcon'
import CircleIcon from '../components/CircleIcon'
import HelpLink from '../components/HelpLink'
import { runSync } from '../lib/offlineQueue'
import { getCachedDashboard, setCachedDashboard } from '../lib/offlineCache'
import { pickGreetingTemplate } from '../lib/greetings'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(null)
  const [greetingTemplate] = useState(pickGreetingTemplate)
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there'
  const greetingTitle = greetingTemplate.title.replace('{name}', firstName)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState('USD')
  const [creating, setCreating] = useState(false)

  const [showJoin, setShowJoin] = useState(false)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)

  const [circles, setCircles] = useState(null)
  const [showCreateCircle, setShowCreateCircle] = useState(false)
  const [newCircleName, setNewCircleName] = useState('')
  const [creatingCircle, setCreatingCircle] = useState(false)
  const [showJoinCircle, setShowJoinCircle] = useState(false)
  const [circleCode, setCircleCode] = useState('')
  const [joiningCircle, setJoiningCircle] = useState(false)

  async function loadGroups() {
    try {
      // Deliberately NOT `.from('groups').select(...)` — that would rely on
      // RLS alone to decide what comes back, and for an admin account RLS
      // is permissive by design (it needs to see every group for the Admin
      // panel). Scoping through this user's own group_members rows instead
      // keeps "my dashboard" meaning "groups I'm actually in," regardless
      // of admin status — and explicitly excluding archived ones means an
      // admin's own archived groups disappear from their personal view
      // too, not just everyone else's.
      const { data, error } = await supabase
        .from('group_members')
        .select(
          'groups(id, name, home_currency, invite_code, created_at, archived_at, banner_path, circle_id, group_members(user_id, nickname, profiles(display_name, avatar_path)))'
        )
        .eq('user_id', user.id)
      if (error) throw error
      const myGroups = (data ?? [])
        .map((row) => row.groups)
        .filter((g) => g && !g.archived_at)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setGroups(myGroups)
      setStale(null)
      setError('')
      setCachedDashboard(myGroups)
    } catch (err) {
      // A thrown Supabase query error (bad RLS, etc.) and a genuine
      // network failure (offline) land here the same way — either way,
      // falling back to the last-known list beats an indefinite skeleton.
      const cached = getCachedDashboard()
      if (cached) {
        setGroups(cached.groups)
        setStale(cached.cachedAt)
        setError('')
      } else {
        setError(err.message || "Couldn't load your trips — check your connection.")
      }
    }
  }

  async function loadCircles() {
    // Same "query through the membership table" pattern as loadGroups,
    // for the same reason — this is "circles I'm actually in," not
    // whatever RLS would otherwise let an admin account see. No offline
    // fallback for this one: circles are additive/optional, so simply
    // not showing them while offline (standalone groups still load from
    // cache as before) is an acceptable v1 gap rather than complicating
    // offlineCache.js's shape for a feature most groups will never use.
    const { data, error } = await supabase
      .from('circle_members')
      .select('circles(id, name, invite_code, created_at, archived_at)')
      .eq('user_id', user.id)
    if (error) return
    const myCircles = (data ?? [])
      .map((row) => row.circles)
      .filter((c) => c && !c.archived_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setCircles(myCircles)
  }

  useEffect(() => {
    loadGroups()
    loadCircles()
    runSync()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError('')

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({ name: newName.trim(), home_currency: newCurrency, created_by: user.id })
      .select()
      .single()

    if (groupError) {
      setError(groupError.message)
      setCreating(false)
      return
    }

    const { error: memberError } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: user.id })

    setCreating(false)
    if (memberError) {
      setError(memberError.message)
      return
    }
    navigate(`/trips/${group.id}`)
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!code.trim()) return
    setJoining(true)
    setError('')
    const { data, error } = await supabase.rpc('join_group_by_code', { code: code.trim() })
    setJoining(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/trips/${data.id}`)
  }

  async function handleCreateCircle(e) {
    e.preventDefault()
    if (!newCircleName.trim()) return
    setCreatingCircle(true)
    setError('')

    const { data: circle, error: circleError } = await supabase
      .from('circles')
      .insert({ name: newCircleName.trim(), created_by: user.id })
      .select()
      .single()

    if (circleError) {
      setError(circleError.message)
      setCreatingCircle(false)
      return
    }

    const { error: memberError } = await supabase
      .from('circle_members')
      .insert({ circle_id: circle.id, user_id: user.id })

    setCreatingCircle(false)
    if (memberError) {
      setError(memberError.message)
      return
    }
    navigate(`/circles/${circle.id}`)
  }

  async function handleJoinCircle(e) {
    e.preventDefault()
    if (!circleCode.trim()) return
    setJoiningCircle(true)
    setError('')
    const { data, error } = await supabase.rpc('join_circle_by_code', { code: circleCode.trim() })
    setJoiningCircle(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/circles/${data.id}`)
  }

  // Trips that belong to a Circle show up inside that Circle's own card
  // above instead of in this flat grid — a Trip is never shown twice.
  const standaloneGroups = (groups ?? []).filter((g) => !g.circle_id)

  return (
    <div className="mx-auto max-w-3xl xl:max-w-6xl px-4 sm:px-6 py-10">
      <div
        className="relative mb-9 overflow-hidden rounded-3xl border border-line p-7 sm:p-9 shadow-raised"
        style={{
          backgroundImage:
            'linear-gradient(155deg, var(--color-paper-raised) 0%, color-mix(in srgb, var(--color-paper-raised) 88%, var(--color-primary-tint)) 100%)',
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 right-1 font-display text-[180px] sm:text-[220px] font-semibold leading-none text-ink opacity-[0.035]"
        >
          {greetingTemplate.wm}
        </span>
        <div className="relative">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-tint px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {groups ? `${groups.length} trip${groups.length === 1 ? '' : 's'}` : 'Your trips'}
            </span>
            {circles && circles.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-tint px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {circles.length} circle{circles.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <h1 className="font-display text-3xl sm:text-[42px] leading-[1.1] tracking-tight text-ink">
            {greetingTitle}
          </h1>
          <p className="mt-2 max-w-md text-[15.5px] text-ink-soft">{greetingTemplate.sub}</p>
          {stale && (
            <p className="mt-2 text-xs text-ink-soft">
              Showing saved data from{' '}
              {new Date(stale).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              — reconnect to refresh.
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => {
                setShowCreate((v) => !v)
                setShowJoin(false)
              }}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-on-primary shadow-[0_1px_1px_rgba(0,0,0,0.1),0_10px_20px_-8px_color-mix(in_srgb,var(--color-primary)_60%,transparent)] transition-transform hover:-translate-y-0.5"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 88%, white 12%), var(--color-primary-dark))',
              }}
            >
              ＋ New trip
            </button>
            <button
              onClick={() => {
                setShowJoin((v) => !v)
                setShowCreate(false)
              }}
              className="rounded-full border border-line bg-paper-raised px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent"
            >
              Join with a code
            </button>
          </div>
          <div className="mt-6 pt-5 border-t border-line/70">
            <div className="flex items-center gap-1.5 mb-2.5">
              <p className="text-sm font-semibold text-ink">Circles</p>
              <HelpLink to="circles" />
            </div>
            <p className="text-sm text-ink-soft mb-3 max-w-md">
              Take trips with the same people often? Join once, then create or join any trip inside it — no
              new invite code each time.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setShowCreateCircle((v) => !v)
                  setShowJoinCircle(false)
                }}
                className="rounded-full bg-accent text-on-primary px-5 py-2.5 text-sm font-semibold transition-colors hover:opacity-90"
              >
                ＋ New circle
              </button>
              <button
                onClick={() => {
                  setShowJoinCircle((v) => !v)
                  setShowCreateCircle(false)
                }}
                className="rounded-full border border-line bg-paper-raised px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent"
              >
                Join a circle
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-owe/30 bg-owe-tint text-owe text-sm px-4 py-3">{error}</div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-8 bg-paper-raised border border-line rounded-2xl p-5 shadow-raised flex flex-col sm:flex-row gap-3 sm:items-end"
        >
          <div className="flex-1">
            <label className="block text-sm text-ink-soft mb-1.5">Trip name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Goa trip, Flat 4B, Family fund…"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-ink-soft mb-1.5">Home currency</label>
            <CurrencySelect value={newCurrency} onChange={setNewCurrency} />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-full bg-primary text-on-primary text-sm font-medium px-5 py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {showJoin && (
        <form
          onSubmit={handleJoin}
          className="mb-8 bg-paper-raised border border-line rounded-2xl p-5 shadow-raised flex flex-col sm:flex-row gap-3 sm:items-end"
        >
          <div className="flex-1">
            <label className="block text-sm text-ink-soft mb-1.5">Invite code</label>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. 7K2QF1"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink tracking-widest focus:border-primary outline-none uppercase"
            />
          </div>
          <button
            type="submit"
            disabled={joining}
            className="rounded-full bg-primary text-on-primary text-sm font-medium px-5 py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {joining ? 'Joining…' : 'Join'}
          </button>
        </form>
      )}

      {showCreateCircle && (
        <form
          onSubmit={handleCreateCircle}
          className="mb-8 bg-paper-raised border border-line rounded-2xl p-5 shadow-raised flex flex-col sm:flex-row gap-3 sm:items-end"
        >
          <div className="flex-1">
            <label className="block text-sm text-ink-soft mb-1.5">Circle name</label>
            <input
              autoFocus
              value={newCircleName}
              onChange={(e) => setNewCircleName(e.target.value)}
              placeholder="Smith Family, College Friends…"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={creatingCircle}
            className="rounded-full bg-primary text-on-primary text-sm font-medium px-5 py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {creatingCircle ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {showJoinCircle && (
        <form
          onSubmit={handleJoinCircle}
          className="mb-8 bg-paper-raised border border-line rounded-2xl p-5 shadow-raised flex flex-col sm:flex-row gap-3 sm:items-end"
        >
          <div className="flex-1">
            <label className="block text-sm text-ink-soft mb-1.5">Circle invite code</label>
            <input
              autoFocus
              value={circleCode}
              onChange={(e) => setCircleCode(e.target.value.toUpperCase())}
              placeholder="e.g. 7K2QF1"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink tracking-widest focus:border-primary outline-none uppercase"
            />
          </div>
          <button
            type="submit"
            disabled={joiningCircle}
            className="rounded-full bg-primary text-on-primary text-sm font-medium px-5 py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {joiningCircle ? 'Joining…' : 'Join'}
          </button>
        </form>
      )}

      {circles && circles.length > 0 && (
        <div className="mb-8 space-y-4">
          {circles.map((c) => {
            const trips = (groups ?? []).filter((g) => g.circle_id === c.id)
            const accent = accentFor(c.id)
            return (
              <Link
                key={c.id}
                to={`/circles/${c.id}`}
                className="block rounded-2xl border border-line bg-paper-raised p-5 hover:border-primary transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${accent}22`, color: accent }}
                    >
                      <CircleIcon id={c.id} />
                    </div>
                    <p className="font-display text-lg text-ink truncate">{c.name}</p>
                  </div>
                  <span className="text-xs text-ink-soft shrink-0">
                    {trips.length} trip{trips.length === 1 ? '' : 's'} →
                  </span>
                </div>
                {trips.length > 0 && (
                  <p className="mt-2 text-sm text-ink-soft truncate">{trips.map((t) => t.name).join(' · ')}</p>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {groups === null && error ? (
        <div className="text-center py-10">
          <p className="text-sm text-ink-soft mb-3">You're offline and this device has never loaded your trips before.</p>
          <button onClick={loadGroups} className="text-primary hover:underline text-sm">
            Retry
          </button>
        </div>
      ) : groups === null ? (
        <SkeletonRows count={3} />
      ) : standaloneGroups.length === 0 ? (
        circles && circles.length > 0 ? null : (
          <EmptyState
            icon={
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="7" cy="7" r="2.3" />
                <path d="M2.5 16c0-3 2-4.5 4.5-4.5s4.5 1.5 4.5 4.5" strokeLinecap="round" />
                <circle cx="13" cy="7" r="2.3" />
                <path d="M9 12.2c.7-1 1.9-1.7 4-1.7 2.5 0 4.5 1.5 4.5 4.5" strokeLinecap="round" />
              </svg>
            }
            title="No trips yet"
            subtitle="Start one, or join a friend's with their invite code."
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {standaloneGroups.map((g, idx) => {
            const accent = accentFor(g.id)
            return (
              <Link
                key={g.id}
                to={`/trips/${g.id}`}
                className="group/card animate-rise-in relative block overflow-hidden rounded-[20px] border border-line bg-paper-raised p-6 shadow-[0_1px_2px_rgba(22,36,29,0.04)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_28px_44px_-20px_rgba(22,36,29,0.3)]"
                style={{ animationDelay: `${idx * 0.07}s` }}
              >
                <TripBanner name={g.name} bannerPath={g.banner_path} accent={accent} className="-mx-6 -mt-6 mb-4 h-28 sm:h-32" />

                <div className="mb-4 flex items-start justify-between">
                  <div className="flex -space-x-2.5">
                    {g.group_members.slice(0, 4).map((m) => {
                      const memberName = m.nickname || m.profiles?.display_name || 'Member'
                      return (
                        <div key={m.user_id} className="group/avatar relative rounded-full ring-2 ring-paper-raised">
                          <Avatar avatarPath={m.profiles?.avatar_path} name={memberName} size="md" />
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-ink px-2.5 py-1 font-body text-[11.5px] font-medium text-paper opacity-0 transition-all duration-150 group-hover/avatar:translate-y-0 group-hover/avatar:opacity-100">
                            {memberName}
                          </span>
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-[7px] -translate-x-1/2 translate-y-1 border-[5px] border-transparent border-t-ink opacity-0 transition-all duration-150 group-hover/avatar:translate-y-0 group-hover/avatar:opacity-100" />
                        </div>
                      )
                    })}
                  </div>
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-line text-ink-soft transition-transform duration-200 group-hover/card:translate-x-0.5">
                    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                      <path
                        d="M6 3l5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>

                <p className="mb-1 font-display text-xl font-semibold leading-tight text-ink">{g.name}</p>
                <p className="mb-4 text-sm text-ink-soft">
                  {g.group_members.length} member{g.group_members.length === 1 ? '' : 's'}
                </p>

                <div className="flex items-center justify-between border-t border-line pt-3.5 font-mono text-[11px] text-ink-soft">
                  <span>
                    Home currency · <span className="font-semibold" style={{ color: accent }}>{g.home_currency}</span>
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
