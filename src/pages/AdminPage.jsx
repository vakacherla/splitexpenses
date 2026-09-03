import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatMoney } from '../lib/fx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'groups', label: 'Groups' },
  { id: 'reports', label: 'Reports' },
  { id: 'trash', label: 'Trash' },
  { id: 'feedback', label: 'Feedback' },
]

const REQUEST_STATUSES = ['new', 'reviewing', 'planned', 'done', 'declined']
const ARCHIVE_DAYS = 30

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
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [nameDraft, setNameDraft] = useState('')

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
      .select('id, name, home_currency, invite_code, created_at, archived_at, group_members(user_id)')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setGroups(data)
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
      const groupName = e.groups?.name ?? 'Unknown group'
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
        `Permanently delete ${eligibleGroups.length} group${eligibleGroups.length === 1 ? '' : 's'} that have been archived 30+ days? This cannot be undone.`
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
          ← Your groups
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Admin</h1>
        <p className="text-sm text-ink-soft mt-0.5">Platform-wide user and group management.</p>
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
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Groups', value: overview.groups },
              { label: 'Users', value: overview.users },
              { label: 'Active users', value: overview.activeUsers },
              { label: 'Expenses logged', value: overview.expenses },
              { label: 'Settlements recorded', value: overview.settlements },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-line bg-paper-raised px-4 py-4">
                <p className="num font-display text-3xl text-ink">{stat.value}</p>
                <p className="text-xs text-ink-soft mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        ))}

      {tab === 'users' &&
        (users === null ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3">
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
              </li>
            ))}
          </ul>
        ))}

      {tab === 'groups' &&
        (groups === null ? (
          <p className="text-sm text-ink-soft">Loading…</p>
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
                      <li key={g.id} className="flex items-center justify-between gap-3 py-3">
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
                            <Link to={`/groups/${g.id}`} className="text-ink hover:text-primary truncate block">
                              {g.name}
                            </Link>
                          )}
                          <p className="text-xs text-ink-soft mt-0.5">
                            {g.group_members.length} member{g.group_members.length === 1 ? '' : 's'} ·{' '}
                            {g.home_currency} · code {g.invite_code}
                          </p>
                        </div>
                        {editingGroupId !== g.id && (
                          <div className="flex items-center gap-3 shrink-0">
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
          <p className="text-sm text-ink-soft">Loading…</p>
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
              <h3 className="font-display text-lg text-ink mb-3">Spend by group</h3>
              {reports.byGroup.length === 0 ? (
                <p className="text-sm text-ink-soft">No expenses logged yet.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {[...reports.byGroup]
                    .sort((a, b) => b.total - a.total)
                    .map((g) => (
                      <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                        <Link to={`/groups/${g.id}`} className="text-ink hover:text-primary truncate">
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

      {tab === 'trash' &&
        (trash === null ? (
          <p className="text-sm text-ink-soft">Loading…</p>
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
                            {e.groups?.name ?? 'Unknown group'} · {e.category} · deleted {days} day
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
          <p className="text-sm text-ink-soft">Loading…</p>
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
