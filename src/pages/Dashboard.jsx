import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import CurrencySelect from '../components/CurrencySelect'
import { SkeletonRows } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Avatar from '../components/Avatar'
import GroupIcon, { hashString } from '../components/GroupIcon'
import { runSync } from '../lib/offlineQueue'
import { getCachedDashboard, setCachedDashboard } from '../lib/offlineCache'
import { pickGreetingTemplate } from '../lib/greetings'

// Purely decorative per-group accent — no "color" field exists or is being
// added, this just picks one deterministically from the group's own id so
// it stays the same on every visit rather than reshuffling.
const ACCENTS = ['#2f5233', '#b8901f', '#a04338', '#4a6a8a', '#6b4a8a', '#3a7d7d']
function accentFor(id) {
  return ACCENTS[hashString(id) % ACCENTS.length]
}

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
          'groups(id, name, home_currency, invite_code, created_at, archived_at, group_members(user_id, nickname, profiles(display_name, avatar_path)))'
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
        setError(err.message || "Couldn't load your groups — check your connection.")
      }
    }
  }

  useEffect(() => {
    loadGroups()
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
    navigate(`/groups/${group.id}`)
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
    navigate(`/groups/${data.id}`)
  }

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
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-tint px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {groups ? `${groups.length} group${groups.length === 1 ? '' : 's'}` : 'Your groups'}
          </span>
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
              ＋ New group
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
            <label className="block text-sm text-ink-soft mb-1.5">Group name</label>
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

      {groups === null && error ? (
        <div className="text-center py-10">
          <p className="text-sm text-ink-soft mb-3">You're offline and this device has never loaded your groups before.</p>
          <button onClick={loadGroups} className="text-primary hover:underline text-sm">
            Retry
          </button>
        </div>
      ) : groups === null ? (
        <SkeletonRows count={3} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7" cy="7" r="2.3" />
              <path d="M2.5 16c0-3 2-4.5 4.5-4.5s4.5 1.5 4.5 4.5" strokeLinecap="round" />
              <circle cx="13" cy="7" r="2.3" />
              <path d="M9 12.2c.7-1 1.9-1.7 4-1.7 2.5 0 4.5 1.5 4.5 4.5" strokeLinecap="round" />
            </svg>
          }
          title="No groups yet"
          subtitle="Start one, or join a friend's with their invite code."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((g, idx) => {
            const accent = accentFor(g.id)
            return (
              <Link
                key={g.id}
                to={`/groups/${g.id}`}
                className="group/card animate-rise-in relative block overflow-hidden rounded-[20px] border border-line bg-paper-raised p-6 shadow-[0_1px_2px_rgba(22,36,29,0.04)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_28px_44px_-20px_rgba(22,36,29,0.3)]"
                style={{ animationDelay: `${idx * 0.07}s` }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundImage: `linear-gradient(90deg, ${accent}, ${accent}66)` }}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1.5 -top-3.5 select-none font-display text-[84px] font-bold leading-none opacity-[0.06]"
                  style={{ color: accent }}
                >
                  {g.name[0]?.toUpperCase()}
                </span>

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

                <p className="mb-1 flex items-center gap-2.5 font-display text-xl font-semibold leading-tight text-ink">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
                    style={{ backgroundColor: `${accent}24`, color: accent }}
                  >
                    <GroupIcon id={g.id} />
                  </span>
                  {g.name}
                </p>
                <p className="mb-4 pl-[46px] text-sm text-ink-soft">
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
