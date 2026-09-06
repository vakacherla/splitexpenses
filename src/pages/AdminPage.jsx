import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatMoney } from '../lib/fx'
import { Skeleton, SkeletonRows, SkeletonStatGrid, SkeletonChart } from '../components/Skeleton'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'groups', label: 'Trips' },
  { id: 'reports', label: 'Reports' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'trash', label: 'Trash' },
  { id: 'feedback', label: 'Feedback' },
]

const REQUEST_STATUSES = ['new', 'reviewing', 'planned', 'done', 'declined']
const ARCHIVE_DAYS = 30

// Same hand-drawn line-icon style as EmptyState/CategoryIcon/TripIcon —
// reusing the exact paths already used elsewhere for the same concept
// (Dashboard's "no trips" icon, TripView's "no expenses" receipt,
// Navbar's exchange-rates arrows) rather than drawing new ones, so a
// stat tile and the empty state it might lead to actually look related.
const STAT_ICONS = {
  Trips: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="6" height="6" rx="1.2" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" />
    </svg>
  ),
  Users: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="10" cy="7" r="2.6" />
      <path d="M4 16c0-3.3 2.3-5 6-5s6 1.7 6 5" strokeLinecap="round" />
    </svg>
  ),
  'Active users': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="7" r="2.4" />
      <path d="M3.5 15.5c0-3 2.2-4.7 5.5-4.7s5.5 1.7 5.5 4.7" strokeLinecap="round" />
      <circle cx="15.3" cy="5.3" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  ),
  'Expenses logged': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 3h10v14l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1V3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 7h5M7.5 10h5M7.5 13h3" strokeLinecap="round" />
    </svg>
  ),
  'Settlements recorded': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path
        d="M4 7h10.5M14.5 7 11.5 4M14.5 7l-3 3M16 13H5.5M5.5 13 8.5 10M5.5 13l3 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
}

function daysSince(isoDate) {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24))
}

async function callAdminFunction(action, userId) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: { action, userId } })
  if (error) {
    let message = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) message = body.error
    } catch {
      // no JSON body available — fall back to error.message
    }
    if (/failed to send a request/i.test(message)) {
      message =
        "Couldn't reach the admin-users function — it likely hasn't been deployed yet. Run `supabase functions deploy admin-users` (README, \"Set up the admin module\")."
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function AdminPage() {
  const { user, profile } = useAuth()
  const [tab, setTab] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [reports, setReports] = useState(null)
  const [trash, setTrash] = useState(null)
  const [users, setUsers] = useState(null)
  const [groups, setGroups] = useState(null)
  const [requests, setRequests] = useState(null)
  const [settlementsList, setSettlementsList] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  const [groupOptions, setGroupOptions] = useState(null)
  const [manageGroupsUserId, setManageGroupsUserId] = useState(null)
  const [userGroups, setUserGroups] = useState(null)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [addToGroupMessage, setAddToGroupMessage] = useState('')
  const [manageCircleGroupId, setManageCircleGroupId] = useState(null)
  const [allCircles, setAllCircles] = useState(null)
  const [selectedCircleForGroup, setSelectedCircleForGroup] = useState('')
  const [circleActionMessage, setCircleActionMessage] = useState('')

  async function loadUsers() {
    setError('')
    try {
      const data = await callAdminFunction('list')
      setUsers(data.users)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadGroups() {
    setError('')
    const { data, error } = await supabase
      .from('groups')
      .select(
        'id, name, home_currency, invite_code, created_at, archived_at, created_by, circle_id, profiles!groups_created_by_fkey(display_name, email), group_members(user_id)'
      )
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setGroups(data)
  }

  async function loadSettlementsList() {
    setError('')
    const { data, error } = await supabase
      .from('settlements')
      .select(
        'id, currency, amount, amount_in_home, note, created_at, groups(name, home_currency), from_profile:profiles!settlements_from_user_fkey(display_name, email), to_profile:profiles!settlements_to_user_fkey(display_name, email)'
      )
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setSettlementsList(data)
  }

  async function loadRequests() {
    setError('')
    const { data, error } = await supabase
      .from('feature_requests')
      .select('id, message, status, created_at, user_id, profiles(display_name, email)')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setRequests(data)
  }

  async function loadOverview() {
    setError('')
    const [groupsCount, usersCount, expensesCount, settlementsCount, splitsRes] = await Promise.all([
      // .is('archived_at', null) here too — same admin-bypass reasoning
      // as everywhere else: this should read as "how much is actually
      // live right now," not include what's sitting in the archive/trash.
      supabase.from('groups').select('*', { count: 'exact', head: true }).is('archived_at', null),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('expenses').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('settlements').select('*', { count: 'exact', head: true }),
      // "Active" = has actually been part of a real expense (paid or
      // split into one) — a looser bar like "has an account" would just
      // restate the users count.
      supabase.from('expense_splits').select('user_id'),
    ])
    const failures = [groupsCount, usersCount, expensesCount, settlementsCount, splitsRes]
      .map((r) => r.error?.message)
      .filter(Boolean)
    if (failures.length > 0) {
      setError(failures.join('; '))
      return
    }
    setOverview({
      groups: groupsCount.count ?? 0,
      users: usersCount.count ?? 0,
      expenses: expensesCount.count ?? 0,
      settlements: settlementsCount.count ?? 0,
      activeUsers: new Set((splitsRes.data ?? []).map((s) => s.user_id)).size,
    })
  }

  async function loadReports() {
    setError('')
    const { data, error } = await supabase
      .from('expenses')
      .select('category, amount_in_home, group_id, groups(name, home_currency)')
      .is('deleted_at', null)
    if (error) {
      setError(error.message)
      return
    }
    // Grouped by each group's own home currency rather than summed into
    // one number — a INR group and a USD group don't share a total
    // without converting one of them, and any conversion here would be
    // today's rate applied to money that moved on a different day. This
    // stays exact instead of guessing.
    const byCategoryCurrency = {}
    const byGroupMap = {}
    for (const e of data ?? []) {
      const currency = e.groups?.home_currency ?? '?'
      const groupName = e.groups?.name ?? 'Unknown trip'
      byCategoryCurrency[currency] ??= {}
      byCategoryCurrency[currency][e.category] = (byCategoryCurrency[currency][e.category] ?? 0) + e.amount_in_home
      byGroupMap[e.group_id] ??= { id: e.group_id, name: groupName, currency, total: 0, count: 0 }
      byGroupMap[e.group_id].total += e.amount_in_home
      byGroupMap[e.group_id].count += 1
    }
    setReports({ byCategoryCurrency, byGroup: Object.values(byGroupMap) })
  }

  async function loadTrash() {
    setError('')
    const { data, error } = await supabase
      .from('expenses')
      .select('id, description, amount, currency, category, deleted_at, group_id, groups(name)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setTrash(data)
  }

  useEffect(() => {
    if (tab === 'overview' && overview === null) loadOverview()
    if (tab === 'users' && users === null) loadUsers()
    if (tab === 'groups' && groups === null) loadGroups()
    if (tab === 'reports' && reports === null) loadReports()
    if (tab === 'settlements' && settlementsList === null) loadSettlementsList()
    if (tab === 'trash' && trash === null) loadTrash()
    if (tab === 'feedback' && requests === null) loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleSuspendToggle(u) {
    setBusyId(u.id)
    setError('')
    try {
      await callAdminFunction(u.banned_until ? 'unsuspend' : 'suspend', u.id)
      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
    setBusyId(null)
  }

  async function handleDeleteUser(u) {
    if (!confirm(`Permanently delete ${u.email}? This can't be undone.`)) return
    setBusyId(u.id)
    setError('')
    try {
      await callAdminFunction('delete', u.id)
      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
    setBusyId(null)
  }

  async function handleDeleteGroup(g) {
    // Archives rather than hard-deleting — same reasoning as the
    // owner-facing version of this action (see MembersPanel): it's now
    // available to more people (any group's own creator, not just you),
    // so the safety net applies here too, including for your own
    // deletes.
    if (!confirm(`Move "${g.name}" to the archive? It'll disappear from everyone's dashboard, but nothing is deleted — you can restore it for 30 days from the Archived section below.`))
      return
    setBusyId(g.id)
    setError('')
    const { error } = await supabase.from('groups').update({ archived_at: new Date().toISOString() }).eq('id', g.id)
    if (error) {
      setError(error.message)
    } else {
      await loadGroups()
    }
    setBusyId(null)
  }

  async function handleRestoreGroup(g) {
    setBusyId(g.id)
    setError('')
    const { error } = await supabase.from('groups').update({ archived_at: null }).eq('id', g.id)
    if (error) {
      setError(error.message)
    } else {
      await loadGroups()
    }
    setBusyId(null)
  }

  async function handlePurgeGroup(g) {
    if (!confirm(`Permanently delete "${g.name}" and everything in it? This cannot be undone.`)) return
    setBusyId(g.id)
    setError('')
    const { error } = await supabase.from('groups').delete().eq('id', g.id)
    if (error) {
      setError(error.message)
    } else {
      await loadGroups()
    }
    setBusyId(null)
  }

  async function handlePurgeAllEligible(eligibleGroups) {
    if (
      !confirm(
        `Permanently delete ${eligibleGroups.length} trip${eligibleGroups.length === 1 ? '' : 's'} that have been archived 30+ days? This cannot be undone.`
      )
    )
      return
    setError('')
    const { error } = await supabase
      .from('groups')
      .delete()
      .in('id', eligibleGroups.map((g) => g.id))
    if (error) {
      setError(error.message)
    } else {
      await loadGroups()
    }
  }

  async function handleRestoreExpense(e) {
    setBusyId(e.id)
    setError('')
    const { error } = await supabase.from('expenses').update({ deleted_at: null }).eq('id', e.id)
    if (error) {
      setError(error.message)
    } else {
      await loadTrash()
    }
    setBusyId(null)
  }

  async function handlePurgeExpense(e) {
    if (!confirm(`Permanently delete "${e.description}"? This cannot be undone.`)) return
    setBusyId(e.id)
    setError('')
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    if (error) {
      setError(error.message)
    } else {
      await loadTrash()
    }
    setBusyId(null)
  }

  async function handlePurgeAllEligibleExpenses(eligibleExpenses) {
    if (
      !confirm(
        `Permanently delete ${eligibleExpenses.length} expense${eligibleExpenses.length === 1 ? '' : 's'} that have been in the trash 30+ days? This cannot be undone.`
      )
    )
      return
    setError('')
    const { error } = await supabase
      .from('expenses')
      .delete()
      .in('id', eligibleExpenses.map((e) => e.id))
    if (error) {
      setError(error.message)
    } else {
      await loadTrash()
    }
  }

  function startRename(g) {
    setEditingGroupId(g.id)
    setNameDraft(g.name)
  }

  function cancelRename() {
    setEditingGroupId(null)
    setNameDraft('')
  }

  async function saveRename(g) {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === g.name) {
      cancelRename()
      return
    }
    setBusyId(g.id)
    setError('')
    const { error } = await supabase.from('groups').update({ name: trimmed }).eq('id', g.id)
    setBusyId(null)
    if (error) {
      setError(error.message)
      return
    }
    cancelRename()
    await loadGroups()
  }

  async function handleStatusChange(request, status) {
    setBusyId(request.id)
    setError('')
    const { error } = await supabase.from('feature_requests').update({ status }).eq('id', request.id)
    setBusyId(null)
    if (error) {
      setError(error.message)
      return
    }
    await loadRequests()
  }

  async function handleDeleteRequest(request) {
    if (!confirm('Remove this request? This can\'t be undone.')) return
    setBusyId(request.id)
    setError('')
    const { error } = await supabase.from('feature_requests').delete().eq('id', request.id)
    setBusyId(null)
    if (error) {
      setError(error.message)
      return
    }
    await loadRequests()
  }

  async function loadGroupOptions() {
    if (groupOptions !== null) return
    const { data, error } = await supabase
      .from('groups')
      .select('id, name')
      .is('archived_at', null)
      .order('name')
    if (error) {
      setError(error.message)
      return
    }
    setGroupOptions(data)
  }

  async function loadAllCircles() {
    if (allCircles !== null) return
    const { data, error } = await supabase.from('circles').select('id, name').order('name')
    if (error) {
      setCircleActionMessage(error.message)
      return
    }
    setAllCircles(data)
  }

  function toggleManageCircle(g) {
    if (manageCircleGroupId === g.id) {
      setManageCircleGroupId(null)
      return
    }
    setCircleActionMessage('')
    setSelectedCircleForGroup(g.circle_id ?? '')
    setManageCircleGroupId(g.id)
    loadAllCircles()
  }

  // One RPC does both attach and detach — passing an empty selection
  // through as null simply clears circle_id, same as detach_trip_from_
  // circle does for the self-service path.
  async function handleAdminSetCircle(g) {
    setBusyId(g.id)
    setCircleActionMessage('')
    const { error } = await supabase.rpc('admin_attach_group_to_circle', {
      target_group_id: g.id,
      target_circle_id: selectedCircleForGroup || null,
    })
    setBusyId(null)
    if (error) {
      setCircleActionMessage(error.message)
      return
    }
    setManageCircleGroupId(null)
    await loadGroups()
  }

  async function loadUserGroups(u) {
    setUserGroups(null)
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, groups(name)')
      .eq('user_id', u.id)
    if (error) {
      setAddToGroupMessage(error.message)
      setUserGroups([])
      return
    }
    setUserGroups(data.map((row) => ({ id: row.group_id, name: row.groups?.name ?? 'Unknown trip' })))
  }

  async function openManageGroups(u) {
    setAddToGroupMessage('')
    setSelectedGroupId('')
    setManageGroupsUserId(u.id)
    await Promise.all([loadGroupOptions(), loadUserGroups(u)])
  }

  async function handleAddToGroup(u) {
    if (!selectedGroupId) return
    setBusyId(u.id)
    setAddToGroupMessage('')
    const { error } = await supabase.rpc('admin_add_user_to_group', {
      target_user_id: u.id,
      target_group_id: selectedGroupId,
    })
    setBusyId(null)
    if (error) {
      setAddToGroupMessage(error.message)
      return
    }
    setSelectedGroupId('')
    await loadUserGroups(u)
  }

  async function handleRemoveFromGroup(u, groupId, groupName) {
    if (!confirm(`Remove ${u.display_name ?? u.email} from ${groupName}? Their past expenses there (if any) stay in the ledger, but they'd need a new invite — or another "Add to trip" — to rejoin.`))
      return
    setBusyId(u.id)
    setAddToGroupMessage('')
    const { error } = await supabase.rpc('admin_remove_user_from_group', {
      target_user_id: u.id,
      target_group_id: groupId,
    })
    setBusyId(null)
    if (error) {
      setAddToGroupMessage(error.message)
      return
    }
    await loadUserGroups(u)
  }

  async function handleAdminStatusChange(u, action) {
    setBusyId(u.id)
    setError('')
    try {
      await callAdminFunction(action, u.id)
      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
    setBusyId(null)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <div className="mb-6">
        <Link to="/dashboard" className="text-sm text-ink-soft hover:text-ink">
          ← Your trips
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Admin</h1>
        <p className="text-sm text-ink-soft mt-0.5">Platform-wide user and trip management.</p>
      </div>

      <div className="flex gap-1 border-b border-line mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-primary text-ink' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-owe">{error}</p>}

      {tab === 'overview' &&
        (overview === null ? (
          <SkeletonStatGrid count={4} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Trips', value: overview.groups, tab: 'groups' },
              { label: 'Users', value: overview.users, tab: 'users' },
              { label: 'Active users', value: overview.activeUsers, tab: 'users' },
              { label: 'Expenses logged', value: overview.expenses, tab: 'reports' },
              { label: 'Settlements recorded', value: overview.settlements, tab: 'settlements' },
            ].map((stat) => (
              <button
                key={stat.label}
                onClick={() => setTab(stat.tab)}
                className="text-left rounded-xl border border-line bg-paper-raised px-4 py-4 hover:border-primary transition-colors"
              >
                <div
                  className="h-8 w-8 rounded-full bg-primary-tint text-primary flex items-center justify-center mb-2"
                  aria-hidden="true"
                >
                  <div className="h-4 w-4">{STAT_ICONS[stat.label]}</div>
                </div>
                <p className="num font-display text-3xl text-ink">{stat.value}</p>
                <p className="text-xs text-ink-soft mt-1">{stat.label}</p>
              </button>
            ))}
          </div>
        ))}

      {tab === 'users' &&
        (users === null ? (
          <SkeletonRows count={5} />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {users.map((u) => (
              <li key={u.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                  <p className="text-ink truncate">
                    {u.display_name ?? u.email}
                    {u.is_admin && (
                      <span className="ml-2 text-xs text-primary border border-primary/30 rounded-full px-2 py-0.5">
                        {u.is_super_admin ? 'SU' : 'admin'}
                      </span>
                    )}
                    {u.banned_until && (
                      <span className="ml-2 text-xs text-owe border border-owe/30 rounded-full px-2 py-0.5">
                        suspended
                      </span>
                    )}
                  </p>
                    <p className="text-xs text-ink-soft mt-0.5 truncate">{u.email}</p>
                  </div>
                  {u.id !== user.id && (
                  <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                    {profile?.is_super_admin && (
                      <button
                        onClick={() =>
                          manageGroupsUserId === u.id ? setManageGroupsUserId(null) : openManageGroups(u)
                        }
                        disabled={busyId === u.id}
                        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        Manage trips
                      </button>
                    )}
                    {profile?.is_super_admin && (
                      <>
                        {u.is_super_admin ? (
                          <button
                            onClick={() => handleAdminStatusChange(u, 'demote_super')}
                            disabled={busyId === u.id}
                            className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
                          >
                            Demote to admin
                          </button>
                        ) : u.is_admin ? (
                          <>
                            <button
                              onClick={() => handleAdminStatusChange(u, 'promote_super')}
                              disabled={busyId === u.id}
                              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                            >
                              Promote to SU
                            </button>
                            <button
                              onClick={() => handleAdminStatusChange(u, 'demote_admin')}
                              disabled={busyId === u.id}
                              className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
                            >
                              Demote to member
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleAdminStatusChange(u, 'promote_admin')}
                            disabled={busyId === u.id}
                            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          >
                            Promote to admin
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => handleSuspendToggle(u)}
                      disabled={busyId === u.id}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      {u.banned_until ? 'Unsuspend' : 'Suspend'}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u)}
                      disabled={busyId === u.id}
                      className="text-xs font-medium text-owe hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
                </div>
                {manageGroupsUserId === u.id && (
                  <div className="mt-2 rounded-lg border border-line bg-paper px-3 py-2.5 space-y-2">
                    <div>
                      <p className="text-xs text-ink-soft mb-1">Currently in</p>
                      {userGroups === null ? (
                        <div className="space-y-1.5 py-0.5">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      ) : userGroups.length === 0 ? (
                        <p className="text-xs text-ink-soft">No trips.</p>
                      ) : (
                        <ul className="space-y-1">
                          {userGroups.map((g) => (
                            <li key={g.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-ink truncate">{g.name}</span>
                              <button
                                onClick={() => handleRemoveFromGroup(u, g.id, g.name)}
                                disabled={busyId === u.id}
                                className="font-medium text-owe hover:underline disabled:opacity-50 shrink-0"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-line">
                      {groupOptions === null ? (
                        <Skeleton className="h-6 w-40 rounded-full" />
                      ) : (
                        <>
                          <select
                            value={selectedGroupId}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                            className="text-xs rounded-full border border-line bg-paper-raised px-2.5 py-1 text-ink focus:border-primary outline-none"
                          >
                            <option value="">Add to a trip…</option>
                            {groupOptions.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAddToGroup(u)}
                            disabled={!selectedGroupId || busyId === u.id}
                            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => setManageGroupsUserId(null)}
                            className="text-xs text-ink-soft hover:text-ink"
                          >
                            Close
                          </button>
                        </>
                      )}
                    </div>
                    {addToGroupMessage && <p className="text-xs text-owe">{addToGroupMessage}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}

      {tab === 'groups' &&
        (groups === null ? (
          <SkeletonRows count={5} />
        ) : (
          (() => {
            const activeGroups = groups.filter((g) => !g.archived_at)
            const archivedGroups = groups.filter((g) => g.archived_at)
            const eligibleGroups = archivedGroups.filter((g) => daysSince(g.archived_at) >= ARCHIVE_DAYS)
            return (
              <div className="space-y-8">
                <div>
                  <ul className="divide-y divide-line border-y border-line">
                    {activeGroups.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-3 py-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          {editingGroupId === g.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveRename(g)
                                  if (e.key === 'Escape') cancelRename()
                                }}
                                className="w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-ink focus:border-primary outline-none"
                              />
                              <button
                                onClick={() => saveRename(g)}
                                disabled={busyId === g.id}
                                className="text-xs font-medium text-primary hover:underline shrink-0 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button onClick={cancelRename} className="text-xs text-ink-soft hover:text-ink shrink-0">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <Link to={`/trips/${g.id}`} className="text-ink hover:text-primary truncate block">
                              {g.name}
                            </Link>
                          )}
                          <p className="text-xs text-ink-soft mt-0.5">
                            {g.group_members.length} member{g.group_members.length === 1 ? '' : 's'} ·{' '}
                            {g.home_currency} · code {g.invite_code}
                          </p>
                          <p className="text-xs text-ink-soft/70 mt-0.5">
                            Created {new Date(g.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            by {g.profiles?.display_name ?? g.profiles?.email ?? 'Unknown'}
                          </p>
                        </div>
                        {editingGroupId !== g.id && (
                          <div className="flex items-center gap-3 shrink-0">
                            {profile?.is_super_admin && (
                              <button
                                onClick={() => toggleManageCircle(g)}
                                disabled={busyId === g.id}
                                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                              >
                                Circle
                              </button>
                            )}
                            <button
                              onClick={() => startRename(g)}
                              disabled={busyId === g.id}
                              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                            >
                              Rename
                            </button>
                            <button
                              onClick={() => handleDeleteGroup(g)}
                              disabled={busyId === g.id}
                              className="text-xs font-medium text-owe hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                        {manageCircleGroupId === g.id && (
                          <div className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 space-y-2 basis-full">
                            {allCircles === null ? (
                              <Skeleton className="h-6 w-40 rounded-full" />
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <select
                                  value={selectedCircleForGroup}
                                  onChange={(e) => setSelectedCircleForGroup(e.target.value)}
                                  className="text-xs rounded-full border border-line bg-paper-raised px-2.5 py-1 text-ink focus:border-primary outline-none"
                                >
                                  <option value="">— None (standalone) —</option>
                                  {allCircles.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleAdminSetCircle(g)}
                                  disabled={busyId === g.id}
                                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setManageCircleGroupId(null)}
                                  className="text-xs text-ink-soft hover:text-ink"
                                >
                                  Close
                                </button>
                              </div>
                            )}
                            {circleActionMessage && <p className="text-xs text-owe">{circleActionMessage}</p>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {archivedGroups.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-display text-lg text-ink">Archived</h3>
                      {eligibleGroups.length > 0 && (
                        <button
                          onClick={() => handlePurgeAllEligible(eligibleGroups)}
                          className="text-xs font-medium text-owe hover:underline"
                        >
                          Permanently delete {eligibleGroups.length} eligible ({ARCHIVE_DAYS}+ days)
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-line border-y border-line">
                      {archivedGroups.map((g) => {
                        const days = daysSince(g.archived_at)
                        const eligible = days >= ARCHIVE_DAYS
                        return (
                          <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-ink truncate">{g.name}</p>
                              <p className="text-xs text-ink-soft mt-0.5">
                                Archived {days} day{days === 1 ? '' : 's'} ago
                                {eligible ? ' · eligible for permanent deletion' : ` · ${ARCHIVE_DAYS - days} days left to restore`}
                              </p>
                              <p className="text-xs text-ink-soft/70 mt-0.5">
                                Created {new Date(g.created_at).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}{' '}
                                by {g.profiles?.display_name ?? g.profiles?.email ?? 'Unknown'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <button
                                onClick={() => handleRestoreGroup(g)}
                                disabled={busyId === g.id}
                                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                              >
                                Restore
                              </button>
                              <button
                                onClick={() => handlePurgeGroup(g)}
                                disabled={busyId === g.id}
                                className="text-xs font-medium text-owe hover:underline disabled:opacity-50"
                              >
                                Delete permanently
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )
          })()
        ))}

      {tab === 'reports' &&
        (reports === null ? (
          <SkeletonChart />
        ) : (
          <div className="space-y-8">
            <div>
              <h3 className="font-display text-lg text-ink mb-3">Spend by category</h3>
              {Object.keys(reports.byCategoryCurrency).length === 0 ? (
                <p className="text-sm text-ink-soft">No expenses logged yet.</p>
              ) : (
                Object.entries(reports.byCategoryCurrency).map(([currency, categories]) => (
                  <div key={currency} className="mb-5">
                    <p className="text-xs text-ink-soft mb-2 uppercase tracking-wide">{currency}</p>
                    <ul className="divide-y divide-line border-y border-line">
                      {Object.entries(categories)
                        .sort((a, b) => b[1] - a[1])
                        .map(([category, sum]) => (
                          <li key={category} className="flex items-center justify-between py-2 text-sm">
                            <span className="text-ink">{category}</span>
                            <span className="num text-ink-soft">{formatMoney(sum, currency)}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div>
              <h3 className="font-display text-lg text-ink mb-3">Spend by trip</h3>
              {reports.byGroup.length === 0 ? (
                <p className="text-sm text-ink-soft">No expenses logged yet.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {[...reports.byGroup]
                    .sort((a, b) => b.total - a.total)
                    .map((g) => (
                      <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                        <Link to={`/trips/${g.id}`} className="text-ink hover:text-primary truncate">
                          {g.name}
                        </Link>
                        <span className="num text-ink-soft shrink-0">
                          {formatMoney(g.total, g.currency)} · {g.count} expense{g.count === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        ))}

      {tab === 'settlements' &&
        (settlementsList === null ? (
          <SkeletonRows count={4} />
        ) : settlementsList.length === 0 ? (
          <p className="text-sm text-ink-soft">No settlements recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {settlementsList.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink truncate">
                      {s.from_profile?.display_name ?? s.from_profile?.email ?? 'Unknown'} →{' '}
                      {s.to_profile?.display_name ?? s.to_profile?.email ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-ink-soft mt-0.5 truncate">
                      {s.groups?.name ?? 'Unknown trip'} ·{' '}
                      {new Date(s.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {s.note ? ` · ${s.note}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="num text-ink">{formatMoney(s.amount, s.currency)}</p>
                    {s.currency !== s.groups?.home_currency && (
                      <p className="num text-xs text-ink-soft">
                        {formatMoney(s.amount_in_home, s.groups?.home_currency)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'trash' &&
        (trash === null ? (
          <SkeletonRows count={4} />
        ) : trash.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing in the trash.</p>
        ) : (
          (() => {
            const eligibleExpenses = trash.filter((e) => daysSince(e.deleted_at) >= ARCHIVE_DAYS)
            return (
              <div>
                {eligibleExpenses.length > 0 && (
                  <div className="flex items-center justify-end mb-3">
                    <button
                      onClick={() => handlePurgeAllEligibleExpenses(eligibleExpenses)}
                      className="text-xs font-medium text-owe hover:underline"
                    >
                      Permanently delete {eligibleExpenses.length} eligible ({ARCHIVE_DAYS}+ days)
                    </button>
                  </div>
                )}
                <ul className="divide-y divide-line border-y border-line">
                  {trash.map((e) => {
                    const days = daysSince(e.deleted_at)
                    const eligible = days >= ARCHIVE_DAYS
                    return (
                      <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-ink truncate">
                            {e.description} · {formatMoney(e.amount, e.currency)}
                          </p>
                          <p className="text-xs text-ink-soft mt-0.5">
                            {e.groups?.name ?? 'Unknown trip'} · {e.category} · deleted {days} day
                            {days === 1 ? '' : 's'} ago
                            {eligible ? ' · eligible for permanent deletion' : ` · ${ARCHIVE_DAYS - days} days left to restore`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            onClick={() => handleRestoreExpense(e)}
                            disabled={busyId === e.id}
                            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handlePurgeExpense(e)}
                            disabled={busyId === e.id}
                            className="text-xs font-medium text-owe hover:underline disabled:opacity-50"
                          >
                            Delete permanently
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })()
        ))}

      {tab === 'feedback' &&
        (requests === null ? (
          <SkeletonRows count={4} />
        ) : requests.length === 0 ? (
          <p className="text-sm text-ink-soft">No feedback submitted yet.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {requests.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{r.message}</p>
                    <p className="text-xs text-ink-soft mt-1">
                      {r.profiles?.display_name ?? r.profiles?.email ?? 'Unknown'} ·{' '}
                      {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={r.status}
                      onChange={(e) => handleStatusChange(r, e.target.value)}
                      disabled={busyId === r.id}
                      className="text-xs rounded-full border border-line bg-paper px-2.5 py-1 text-ink focus:border-primary outline-none disabled:opacity-50"
                    >
                      {REQUEST_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDeleteRequest(r)}
                      disabled={busyId === r.id}
                      className="text-xs font-medium text-owe hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
