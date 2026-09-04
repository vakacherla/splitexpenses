import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import CurrencySelect from '../components/CurrencySelect'
import { SkeletonRows } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { runSync } from '../lib/offlineQueue'
import { getCachedDashboard, setCachedDashboard } from '../lib/offlineCache'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(null)

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
        .select('groups(id, name, home_currency, invite_code, created_at, archived_at, group_members(user_id))')
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
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ink">
            {profile ? `Hey, ${profile.display_name.split(' ')[0]}` : 'Your groups'}
          </h1>
          <p className="text-sm text-ink-soft mt-1">Every ledger you're part of, in one place.</p>
          {stale && (
            <p className="text-xs text-ink-soft mt-1">
              Showing saved data from{' '}
              {new Date(stale).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{' '}
              — reconnect to refresh.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-owe/30 bg-owe-tint text-owe text-sm px-4 py-3">{error}</div>
      )}

      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setShowJoin(false)
          }}
          className="rounded-full bg-primary text-on-primary text-sm font-medium px-4 py-2 hover:bg-primary-dark transition-colors"
        >
          New group
        </button>
        <button
          onClick={() => {
            setShowJoin((v) => !v)
            setShowCreate(false)
          }}
          className="rounded-full border border-line text-ink text-sm font-medium px-4 py-2 hover:border-primary transition-colors"
        >
          Join with a code
        </button>
      </div>

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
        <ul className="divide-y divide-line border-y border-line">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                to={`/groups/${g.id}`}
                className="flex items-center justify-between py-4 group hover:bg-paper-raised transition-colors -mx-2 px-2 rounded-lg"
              >
                <div>
                  <p className="font-display text-lg text-ink">{g.name}</p>
                  <p className="text-sm text-ink-soft mt-0.5">
                    {g.group_members.length} member{g.group_members.length === 1 ? '' : 's'} · {g.home_currency}
                  </p>
                </div>
                <svg
                  className="w-4 h-4 text-ink-soft group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
