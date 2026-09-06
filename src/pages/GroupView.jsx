import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ExpenseRow from '../components/ExpenseRow'
import BalancesPanel from '../components/BalancesPanel'
import MembersPanel from '../components/MembersPanel'
import AddExpenseForm from '../components/AddExpenseForm'
import SettleUpModal from '../components/SettleUpModal'
import GroupSettingsModal from '../components/GroupSettingsModal'
import ImportCsvModal from '../components/ImportCsvModal'
import GroupBanner from '../components/GroupBanner'
import ActivityFeed from '../components/ActivityFeed'
import HelpLink from '../components/HelpLink'
import { accentFor } from '../components/GroupIcon'
import LoadingScreen from '../components/LoadingScreen'
import { SkeletonChart } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { CATEGORIES } from '../lib/categories'
import { expensesToCSV, downloadCSV } from '../lib/csvExport'
import { computeNetBalances } from '../lib/balances'
import { logActivity } from '../lib/activity'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { useOfflineQueue, useIsSyncing, enqueue, runSync } from '../lib/offlineQueue'
import { getCachedGroup, setCachedGroup, mergeQueueIntoExpenses, mergeQueueIntoSettlements } from '../lib/offlineCache'

const ReportsPanel = lazy(() => import('../components/ReportsPanel'))

const TABS = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'balances', label: 'Balances' },
  { id: 'reports', label: 'Reports' },
  { id: 'activity', label: 'Activity' },
  { id: 'members', label: 'Members' },
]

// Which Help section answers questions about each tab, so the "?" next to
// the tab bar jumps straight there instead of the top of the whole guide.
const TAB_HELP_SECTION = {
  ledger: 'search-export-import',
  balances: 'balances',
  reports: 'reports',
  activity: 'activity',
  members: 'members',
}

export default function GroupView() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [circleName, setCircleName] = useState(null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [tab, setTab] = useState('ledger')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(null)
  const isOffline = !useOnlineStatus()
  const pendingOps = useOfflineQueue()

  const [showAdd, setShowAdd] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [duplicatingExpense, setDuplicatingExpense] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [duplicatingGroup, setDuplicatingGroup] = useState(false)
  const [settleSuggestion, setSettleSuggestion] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')

  const load = useCallback(async () => {
    try {
      const [groupRes, membersRes, expensesRes, settlementsRes] = await Promise.all([
        supabase.from('groups').select('*').eq('id', groupId).single(),
        supabase
          .from('group_members')
          .select(
            'user_id, nickname, is_manager, profiles(display_name, email, payment_provider, payment_handle, avatar_path, phone_home, phone_travel)'
          )
          .eq('group_id', groupId),
        supabase
          .from('expenses')
          .select('*, expense_splits(user_id, share_amount, share_in_home, percentage)')
          .eq('group_id', groupId)
          // Explicit even though RLS already excludes deleted expenses for
          // regular members — an admin's own RLS bypass means this filter
          // is what keeps a deleted expense from leaking into their own
          // normal browsing of a group they're a member of, same fix as
          // Dashboard's group list needed for archived groups.
          .is('deleted_at', null)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('settlements').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
      ])

      // A genuine network failure (no signal) doesn't necessarily reject
      // this Promise.all — on Safari in particular, supabase-js resolves
      // with an error payload instead (message text like "Load failed"),
      // so checking connectivity first is what routes a real offline
      // reload to the cache fallback below instead of surfacing that raw
      // error as if it were a real server response.
      if (!navigator.onLine && (groupRes.error || membersRes.error || expensesRes.error || settlementsRes.error)) {
        throw new Error('offline')
      }

      if (groupRes.error) {
        setError(groupRes.error.message)
        setLoading(false)
        return
      }

      setGroup(groupRes.data)

      // Each of these failing independently used to fail silently — the
      // group itself would still load, but members/expenses/settlements
      // would just quietly render as empty with no indication anything was
      // wrong. That's exactly how a missing migration (a real column not
      // existing yet) went unnoticed until manual testing caught it.
      const failures = [
        membersRes.error && `members (${membersRes.error.message})`,
        expensesRes.error && `expenses (${expensesRes.error.message})`,
        settlementsRes.error && `settlements (${settlementsRes.error.message})`,
      ].filter(Boolean)
      setError(failures.length > 0 ? `Couldn't load: ${failures.join(', ')}` : '')

      const membersData = membersRes.data
        ? membersRes.data.map((m) => ({
            user_id: m.user_id,
            ...m.profiles,
            // Everywhere in the app that renders a member's name reads
            // `display_name` — resolving the nickname here, once, means
            // ExpenseRow/BalancesPanel/SettleUpModal/etc. never need to
            // know nicknames exist at all.
            display_name: m.nickname || m.profiles?.display_name,
            real_display_name: m.profiles?.display_name,
            nickname: m.nickname,
            is_manager: m.is_manager,
          }))
        : []
      const expensesData = expensesRes.data ?? []
      const settlementsData = settlementsRes.data ?? []
      setMembers(membersData)
      setExpenses(expensesData)
      setSettlements(settlementsData)
      setStale(null)
      setCachedGroup(groupId, { group: groupRes.data, members: membersData, expenses: expensesData, settlements: settlementsData })
      setLoading(false)
    } catch {
      // Promise.all itself rejected — a genuine network failure (offline),
      // not a query resolving with an error payload (handled above, and
      // still shown as before). Fall back to whatever last loaded
      // successfully on this device, if anything ever did.
      const cached = getCachedGroup(groupId)
      if (cached) {
        setGroup(cached.group)
        setMembers(cached.members)
        setExpenses(cached.expenses)
        setSettlements(cached.settlements)
        setStale(cached.cachedAt)
        setError('')
      } else {
        setError('offline-no-cache')
      }
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    runSync()
  }, [])

  useEffect(() => {
    if (!group?.circle_id) {
      setCircleName(null)
      return
    }
    let cancelled = false
    supabase
      .from('circles')
      .select('name')
      .eq('id', group.circle_id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setCircleName(data?.name ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [group?.circle_id])

  // A synced expense/settlement disappears from the queue the moment it
  // succeeds (see offlineQueue.js's removeOp) — but the *real* row only
  // exists in this page's own `expenses`/`settlements` state once a fresh
  // `load()` actually fetches it. Without this, a just-synced change
  // would briefly vanish from the ledger instead of smoothly turning from
  // "pending" into the real thing, until the next full reload.
  const syncing = useIsSyncing()
  const wasSyncingRef = useRef(false)
  useEffect(() => {
    if (wasSyncingRef.current && !syncing) load()
    wasSyncingRef.current = syncing
  }, [syncing, load])

  // Must stay above the early returns below — Hooks can't be called
  // conditionally, and loading/error states return before this point.
  const groupPending = useMemo(() => pendingOps.filter((op) => op.groupId === groupId), [pendingOps, groupId])
  const displayExpenses = useMemo(
    () => (group ? mergeQueueIntoExpenses(expenses, groupPending, group.home_currency) : expenses),
    [expenses, groupPending, group]
  )
  const displaySettlements = useMemo(
    () => mergeQueueIntoSettlements(settlements, groupPending),
    [settlements, groupPending]
  )

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const payerNames = Object.fromEntries(members.map((m) => [m.user_id, m.display_name]))
    return displayExpenses.filter((exp) => {
      if (categoryFilter !== 'All' && exp.category !== categoryFilter) return false
      if (!q) return true
      const payer = payerNames[exp.paid_by] ?? ''
      return exp.description.toLowerCase().includes(q) || payer.toLowerCase().includes(q)
    })
  }, [displayExpenses, members, searchQuery, categoryFilter])

  async function handleDeleteExpense(id) {
    if (!confirm('Delete this expense for everyone in the group?')) return
    const exp = expenses.find((e) => e.id === id)
    const actorName = membersMap[user.id]?.display_name ?? 'Someone'
    const summary = exp ? `${exp.description} — ${exp.amount} ${exp.currency}` : 'an expense'
    if (isOffline) {
      enqueue({ type: 'expense.delete', entityId: id, groupId: group.id, payload: { actorName, summary } })
      return
    }
    // Soft-delete — recoverable by the platform admin (Admin → Trash),
    // same reasoning as archiving a group instead of removing it outright.
    const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    logActivity({ groupId: group.id, actorId: user.id, actorName, eventType: 'expense_deleted', summary, entityId: id })
    load()
  }

  async function handleUndoSettlement(id) {
    if (!confirm('Undo this payment? It will go back to counting as owed.')) return
    const settlement = settlements.find((s) => s.id === id)
    const actorName = membersMap[user.id]?.display_name ?? 'Someone'
    const summary = settlement ? `${settlement.amount} ${settlement.currency}` : 'a payment'
    if (isOffline) {
      enqueue({ type: 'settlement.delete', entityId: id, groupId: group.id, payload: { actorName, summary } })
      return
    }
    const { error } = await supabase.from('settlements').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    logActivity({ groupId: group.id, actorId: user.id, actorName, eventType: 'settlement_deleted', summary, entityId: id })
    load()
  }

  if (loading) return <LoadingScreen label="Loading group…" />

  if (error && !group) {
    const offlineNoCache = error === 'offline-no-cache'
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className={offlineNoCache ? 'text-ink-soft mb-3' : 'text-owe mb-3'}>
          {offlineNoCache
            ? "You're offline and haven't opened this group on this device before. Reconnect to load it the first time."
            : error}
        </p>
        <div className="flex items-center justify-center gap-4">
          {offlineNoCache && (
            <button onClick={load} className="text-primary hover:underline text-sm">
              Retry
            </button>
          )}
          <Link to="/dashboard" className="text-primary hover:underline text-sm">
            Back to your groups
          </Link>
        </div>
      </div>
    )
  }

  const membersMap = Object.fromEntries(members.map((m) => [m.user_id, m]))
  const isMember = Boolean(membersMap[user.id])
  const isOwner = group.created_by === user.id
  const canManage = isOwner || Boolean(membersMap[user.id]?.is_manager)

  function handleExportCSV() {
    const csv = expensesToCSV(displayExpenses, membersMap, group.home_currency)
    const safeName = group.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    downloadCSV(`${safeName}-expenses.csv`, csv)
  }

  async function handleRenameGroup(newName) {
    const { error } = await supabase.from('groups').update({ name: newName }).eq('id', group.id)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  async function handleUpdateTripDates(startDate, endDate) {
    const { error } = await supabase
      .from('groups')
      .update({ start_date: startDate, end_date: endDate })
      .eq('id', group.id)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  async function handleRemind(debtorUserId) {
    const { data, error } = await supabase.functions.invoke('remind', {
      body: { groupId: group.id, debtorUserId },
    })
    if (error) {
      let message = error.message
      try {
        const body = await error.context?.json?.()
        if (body?.error) message = body.error
      } catch {
        // no JSON body — fall back to error.message
      }
      throw new Error(message)
    }
    if (data?.error) throw new Error(data.error)
  }

  async function handleRemoveMember(memberId) {
    // A removed member's past expenses stay in the ledger (nothing here
    // deletes them), but they'd vanish from the members list — which
    // would leave a real balance with nobody left to show it against.
    // Blocking while a balance is outstanding is the same protection
    // already in place for deleting a user account platform-wide.
    const netBalances = computeNetBalances(members, displayExpenses, displaySettlements)
    const balance = netBalances.get(memberId) ?? 0
    const memberName = membersMap[memberId]?.display_name ?? 'This person'
    if (Math.abs(balance) > 0.01) {
      setError(`Can't remove ${memberName} — they still have an outstanding balance in this group. Settle up first.`)
      return
    }
    if (!confirm(`Remove ${memberName} from ${group.name}? Their past expenses stay in the ledger, but they'd need a new invite to rejoin.`))
      return
    const { error } = await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', memberId)
    if (error) {
      setError(error.message)
      return
    }
    logActivity({
      groupId: group.id,
      actorId: user.id,
      actorName: membersMap[user.id]?.display_name ?? 'Someone',
      eventType: 'member_removed',
      summary: memberName,
      entityId: memberId,
    })
    load()
  }

  async function handleDeleteGroup() {
    // Archives rather than actually deleting — everything (expenses,
    // members, settlements) stays intact and can be restored by the
    // platform admin. See Admin → Groups → Archived.
    const { error } = await supabase.from('groups').update({ archived_at: new Date().toISOString() }).eq('id', group.id)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/dashboard')
  }

  async function handleDuplicateGroup(newName) {
    setDuplicatingGroup(true)
    setError('')
    const { data, error } = await supabase.rpc('duplicate_group', {
      source_group_id: group.id,
      new_name: newName,
    })
    setDuplicatingGroup(false)
    if (error) {
      setError(error.message)
      return
    }
    setShowSettings(false)
    navigate(`/groups/${data.id}`)
  }

  async function handleToggleManager(memberId, makeManager) {
    const { error } = await supabase
      .from('group_members')
      .update({ is_manager: makeManager })
      .eq('group_id', group.id)
      .eq('user_id', memberId)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 pb-28">
      <GroupBanner
        name={group.name}
        bannerPath={group.banner_path}
        accent={accentFor(group.id)}
        className="rounded-2xl mb-5 h-36 sm:h-44"
      />
      <div className="mb-6">
        <Link to="/dashboard" className="text-sm text-ink-soft hover:text-ink">
          ← Your groups
        </Link>
        {group.circle_id && circleName && (
          <Link to={`/circles/${group.circle_id}`} className="block text-sm text-ink-soft hover:text-ink mt-0.5">
            {circleName} ›
          </Link>
        )}
        <div className="flex items-center gap-2 mt-1">
          <h1 className="font-display text-2xl sm:text-3xl text-ink">{group.name}</h1>
          {canManage && (
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Group settings"
              title="Group settings"
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink hover:border-primary transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M16.2 11.2c.05-.4.05-.8 0-1.2l1.2-1a.6.6 0 0 0 .15-.75l-1.1-1.9a.6.6 0 0 0-.7-.28l-1.4.5a5.6 5.6 0 0 0-1.05-.6l-.2-1.45a.6.6 0 0 0-.6-.52H9.5a.6.6 0 0 0-.6.52l-.2 1.45c-.38.15-.73.36-1.05.6l-1.4-.5a.6.6 0 0 0-.7.28l-1.1 1.9a.6.6 0 0 0 .15.75l1.2 1c-.05.4-.05.8 0 1.2l-1.2 1a.6.6 0 0 0-.15.75l1.1 1.9c.14.25.44.36.7.28l1.4-.5c.32.24.67.45 1.05.6l.2 1.45c.05.3.3.52.6.52h2.2a.6.6 0 0 0 .6-.52l.2-1.45c.38-.15.73-.36 1.05-.6l1.4.5a.6.6 0 0 0 .7-.28l1.1-1.9a.6.6 0 0 0-.15-.75l-1.2-1Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        <p className="text-sm text-ink-soft mt-0.5">Home currency: {group.home_currency}</p>
        {!isMember && (
          <p className="text-xs text-accent mt-2 border border-accent/30 bg-accent-tint rounded-full inline-block px-3 py-1">
            Viewing as admin — you're not a member of this group
          </p>
        )}
        {stale && (
          <p className="text-xs text-ink-soft mt-2">
            Showing saved data from{' '}
            {new Date(stale).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{' '}
            — reconnect to refresh.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-line mb-6">
        <div className="flex gap-1">
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
        <HelpLink to={TAB_HELP_SECTION[tab]} className="mb-2 mr-1" />
      </div>

      {error && <p className="mb-4 text-sm text-owe">{error}</p>}

      {tab === 'ledger' && (
        <>
          {(displayExpenses.length > 0 || isMember) && (
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              {displayExpenses.length > 0 && (
                <>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by description or payer…"
                    className="flex-1 rounded-lg border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-primary outline-none"
                  />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary outline-none"
                  >
                    <option value="All">All categories</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleExportCSV}
                    className="rounded-lg border border-line px-3.5 py-2 text-sm text-ink-soft hover:text-ink hover:border-primary transition-colors whitespace-nowrap"
                  >
                    Export CSV
                  </button>
                </>
              )}
              {isMember && (
                <button
                  onClick={() => setShowImport(true)}
                  className="rounded-lg border border-line px-3.5 py-2 text-sm text-ink-soft hover:text-ink hover:border-primary transition-colors whitespace-nowrap"
                >
                  Import CSV
                </button>
              )}
            </div>
          )}

          {displayExpenses.length === 0 ? (
            <EmptyState
              icon={
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path
                    d="M5 3h10v14l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1V3Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M7.5 7h5M7.5 10h5M7.5 13h3" strokeLinecap="round" />
                </svg>
              }
              title="No expenses yet"
              subtitle="Add the first one to start the ledger."
            />
          ) : filteredExpenses.length === 0 ? (
            <p className="text-sm text-ink-soft text-center py-10">No expenses match that search.</p>
          ) : (
            <ul>
              {filteredExpenses.map((exp) => (
                <ExpenseRow
                  key={exp.id}
                  expense={exp}
                  membersMap={membersMap}
                  currentUserId={user.id}
                  homeCurrency={group.home_currency}
                  isMember={isMember}
                  onEdit={setEditingExpense}
                  onDelete={handleDeleteExpense}
                  onDuplicate={setDuplicatingExpense}
                  onAttached={load}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'balances' && (
        <BalancesPanel
          members={members}
          expenses={displayExpenses}
          settlements={displaySettlements}
          currentUserId={user.id}
          homeCurrency={group.home_currency}
          onSettle={setSettleSuggestion}
          onUndoSettlement={handleUndoSettlement}
          onRemind={handleRemind}
        />
      )}

      {tab === 'reports' && (
        <Suspense fallback={<SkeletonChart />}>
          <ReportsPanel
            expenses={displayExpenses}
            members={members}
            homeCurrency={group.home_currency}
            currentUserId={user.id}
          />
        </Suspense>
      )}

      {tab === 'activity' && <ActivityFeed groupId={group.id} />}

      {tab === 'members' && (
        <MembersPanel
          group={group}
          members={members}
          currentUserId={user.id}
          isOwner={isOwner}
          canManage={canManage}
          onRemoveMember={handleRemoveMember}
          onToggleManager={handleToggleManager}
        />
      )}

      {showSettings && (
        <GroupSettingsModal
          group={group}
          currentUserId={user.id}
          canManage={canManage}
          onRename={handleRenameGroup}
          onUpdateTripDates={handleUpdateTripDates}
          onDeleteGroup={handleDeleteGroup}
          onDuplicate={handleDuplicateGroup}
          duplicating={duplicatingGroup}
          onImportUndone={load}
          onBannerChanged={load}
          onCircleChanged={load}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showImport && (
        <ImportCsvModal
          group={group}
          members={members}
          currentUserId={user.id}
          onImported={load}
          onClose={() => setShowImport(false)}
        />
      )}

      {isMember && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-6 right-6 sm:right-[max(1.5rem,calc(50%-22rem))] rounded-full bg-primary text-on-primary shadow-raised h-14 w-14 flex items-center justify-center text-2xl hover:bg-primary-dark transition-colors"
          aria-label="Add expense"
        >
          +
        </button>
      )}

      {(showAdd || editingExpense || duplicatingExpense) && (
        <AddExpenseForm
          group={group}
          members={members}
          currentUserId={user.id}
          editingExpense={editingExpense}
          duplicateFrom={duplicatingExpense}
          onClose={() => {
            setShowAdd(false)
            setEditingExpense(null)
            setDuplicatingExpense(null)
          }}
          onAdded={() => {
            setShowAdd(false)
            setEditingExpense(null)
            setDuplicatingExpense(null)
            load()
          }}
        />
      )}

      {settleSuggestion && (
        <SettleUpModal
          group={group}
          suggestion={settleSuggestion}
          membersMap={membersMap}
          currentUserId={user.id}
          onClose={() => setSettleSuggestion(null)}
          onDone={() => {
            setSettleSuggestion(null)
            load()
          }}
        />
      )}
    </div>
  )
}
