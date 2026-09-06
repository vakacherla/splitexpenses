import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import CurrencySelect from '../components/CurrencySelect'
import CircleMembersPanel from '../components/CircleMembersPanel'
import LoadingScreen from '../components/LoadingScreen'
import EmptyState from '../components/EmptyState'
import CircleIcon from '../components/CircleIcon'
import HelpLink from '../components/HelpLink'
import { accentFor } from '../components/TripIcon'

export default function CirclePage() {
  const { circleId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [circle, setCircle] = useState(null)
  const [members, setMembers] = useState(null)
  const [trips, setTrips] = useState(null)
  const [myTripIds, setMyTripIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showNewTrip, setShowNewTrip] = useState(false)
  const [newTripName, setNewTripName] = useState('')
  const [newTripCurrency, setNewTripCurrency] = useState('USD')
  const [creatingTrip, setCreatingTrip] = useState(false)
  const [joiningTripId, setJoiningTripId] = useState(null)

  const load = useCallback(async () => {
    setError('')
    const [circleRes, membersRes, tripsRes] = await Promise.all([
      supabase.from('circles').select('*').eq('id', circleId).single(),
      supabase
        .from('circle_members')
        .select('user_id, profiles(display_name, email, avatar_path, payment_provider, payment_handle)')
        .eq('circle_id', circleId),
      supabase
        .from('groups')
        .select('id, name, home_currency, created_at')
        .eq('circle_id', circleId)
        .order('created_at', { ascending: false }),
    ])

    if (circleRes.error) {
      setError(circleRes.error.message)
      setLoading(false)
      return
    }
    setCircle(circleRes.data)

    if (membersRes.error) {
      setError(membersRes.error.message)
    } else {
      setMembers(membersRes.data.map((row) => ({ user_id: row.user_id, ...row.profiles })))
    }

    if (tripsRes.error) {
      setError(tripsRes.error.message)
      setTrips([])
    } else {
      setTrips(tripsRes.data)
      const tripIds = tripsRes.data.map((t) => t.id)
      if (tripIds.length > 0) {
        const { data: myMemberships } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .in('group_id', tripIds)
        setMyTripIds(new Set((myMemberships ?? []).map((r) => r.group_id)))
      } else {
        setMyTripIds(new Set())
      }
    }
    setLoading(false)
  }, [circleId, user.id])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreateTrip(e) {
    e.preventDefault()
    if (!newTripName.trim()) return
    setCreatingTrip(true)
    setError('')
    const { data, error } = await supabase.rpc('create_trip_in_circle', {
      target_circle_id: circleId,
      new_name: newTripName.trim(),
      new_currency: newTripCurrency,
    })
    setCreatingTrip(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/trips/${data.id}`)
  }

  async function handleJoinTrip(tripId) {
    setJoiningTripId(tripId)
    setError('')
    const { error } = await supabase.from('group_members').insert({ group_id: tripId, user_id: user.id })
    setJoiningTripId(null)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/trips/${tripId}`)
  }

  async function handleRemoveMember(targetUserId) {
    const target = members?.find((m) => m.user_id === targetUserId)
    if (!confirm(`Remove ${target?.display_name ?? 'this person'} from ${circle.name}? They'd need a new invite to rejoin, but any Trip they're already in stays unaffected.`))
      return
    setError('')
    const { error } = await supabase.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', targetUserId)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  if (loading) return <LoadingScreen label="Loading circle…" />

  if (error && !circle) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-owe mb-3">{error}</p>
        <Link to="/dashboard" className="text-primary hover:underline text-sm">
          Back to your trips
        </Link>
      </div>
    )
  }

  const isOwner = circle.created_by === user.id

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <div className="mb-6">
        <Link to="/dashboard" className="text-sm text-ink-soft hover:text-ink">
          ← Your trips
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <div
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${accentFor(circle.id)}22`, color: accentFor(circle.id) }}
          >
            <CircleIcon id={circle.id} className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl text-ink">{circle.name}</h1>
          <HelpLink to="circles" />
        </div>
        <p className="text-sm text-ink-soft mt-1.5">
          A circle — join once, then create or join any Trip inside it without a new invite.
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-owe">{error}</p>}

      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-ink">Trips</h3>
          <button
            onClick={() => setShowNewTrip((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            + New trip
          </button>
        </div>

        {showNewTrip && (
          <form
            onSubmit={handleCreateTrip}
            className="mb-5 bg-paper-raised border border-line rounded-2xl p-5 shadow-raised flex flex-col sm:flex-row gap-3 sm:items-end"
          >
            <div className="flex-1">
              <label className="block text-sm text-ink-soft mb-1.5">Trip name</label>
              <input
                autoFocus
                value={newTripName}
                onChange={(e) => setNewTripName(e.target.value)}
                placeholder="Japan 2027, Diwali 2026…"
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Home currency</label>
              <CurrencySelect value={newTripCurrency} onChange={setNewTripCurrency} />
            </div>
            <button
              type="submit"
              disabled={creatingTrip}
              className="rounded-full bg-primary text-on-primary text-sm font-medium px-5 py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {creatingTrip ? 'Creating…' : 'Create'}
            </button>
          </form>
        )}

        {trips.length === 0 ? (
          <EmptyState
            icon={
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M5 3h10v14l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1V3Z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.5 7h5M7.5 10h5M7.5 13h3" strokeLinecap="round" />
              </svg>
            }
            title="No trips yet"
            subtitle="Create the first one — everyone in this circle can add trips."
          />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {trips.map((t) => {
              const isMine = myTripIds.has(t.id)
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    {isMine ? (
                      <Link to={`/trips/${t.id}`} className="text-ink hover:text-primary truncate block">
                        {t.name}
                      </Link>
                    ) : (
                      <p className="text-ink truncate">{t.name}</p>
                    )}
                    <p className="text-xs text-ink-soft mt-0.5">Home currency: {t.home_currency}</p>
                  </div>
                  {!isMine && (
                    <button
                      onClick={() => handleJoinTrip(t.id)}
                      disabled={joiningTripId === t.id}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-50 shrink-0"
                    >
                      {joiningTripId === t.id ? 'Joining…' : 'Join this trip'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {members && (
        <CircleMembersPanel
          circle={circle}
          members={members}
          currentUserId={user.id}
          isOwner={isOwner}
          onRemoveMember={handleRemoveMember}
        />
      )}
    </div>
  )
}
