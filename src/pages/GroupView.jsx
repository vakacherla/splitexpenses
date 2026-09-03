import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ExpenseRow from '../components/ExpenseRow'
import BalancesPanel from '../components/BalancesPanel'
import MembersPanel from '../components/MembersPanel'
import AddExpenseForm from '../components/AddExpenseForm'
import SettleUpModal from '../components/SettleUpModal'
import LoadingScreen from '../components/LoadingScreen'
import { CATEGORIES } from '../lib/categories'
import { expensesToCSV, downloadCSV } from '../lib/csvExport'
import { computeNetBalances } from '../lib/balances'

const ReportsPanel = lazy(() => import('../components/ReportsPanel'))

const TABS = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'balances', label: 'Balances' },
  { id: 'reports', label: 'Reports' },
  { id: 'members', label: 'Members' },
]

export default function GroupView() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [tab, setTab] = useState('ledger')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [settleSuggestion, setSettleSuggestion] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')

  const load = useCallback(async () => {
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

    setMembers(
      membersRes.data
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
    )
    setExpenses(expensesRes.data ?? [])
    setSettlements(settlementsRes.data ?? [])
    setLoading(false)
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  // Must stay above the early returns below — Hooks can't be called
  // conditionally, and loading/error states return before this point.
  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const payerNames = Object.fromEntries(members.map((m) => [m.user_id, m.display_name]))
    return expenses.filter((exp) => {
      if (categoryFilter !== 'All' && exp.category !== categoryFilter) return false
      if (!q) return true
      const payer = payerNames[exp.paid_by] ?? ''
      return exp.description.toLowerCase().includes(q) || payer.toLowerCase().includes(q)
    })
  }, [expenses, members, searchQuery, categoryFilter])

  async function handleDeleteExpense(id) {
    if (!confirm('Delete this expense for everyone in the group?')) return
    // Soft-delete — recoverable by the platform admin (Admin → Trash),
    // same reasoning as archiving a group instead of removing it outright.
    const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  async function handleUndoSettlement(id) {
    if (!confirm('Undo this payment? It will go back to counting as owed.')) return
    const { error } = await supabase.from('settlements').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  if (loading) return <LoadingScreen label="Loading group…" />

  if (error && !group) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-owe mb-3">{error}</p>
        <Link to="/dashboard" className="text-primary hover:underline text-sm">
          Back to your groups
        </Link>
      </div>
    )
  }

  const membersMap = Object.fromEntries(members.map((m) => [m.user_id, m]))
  const isMember = Boolean(membersMap[user.id])
  const isOwner = group.created_by === user.id
  const canManage = isOwner || Boolean(membersMap[user.id]?.is_manager)

  function handleExportCSV() {
    const csv = expensesToCSV(expenses, membersMap, group.home_currency)
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

  async function handleRemoveMember(memberId) {
    // A removed member's past expenses stay in the ledger (nothing here
    // deletes them), but they'd vanish from the members list — which
    // would leave a real balance with nobody left to show it against.
    // Blocking while a balance is outstanding is the same protection
    // already in place for deleting a user account platform-wide.
    const netBalances = computeNetBalances(members, expenses, settlements)
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
      <div className="mb-6">
        <Link to="/dashboard" className="text-sm text-ink-soft hover:text-ink">
          ← Your groups
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">{group.name}</h1>
        <p className="text-sm text-ink-soft mt-0.5">Home currency: {group.home_currency}</p>
        {!isMember && (
          <p className="text-xs text-accent mt-2 border border-accent/30 bg-accent-tint rounded-full inline-block px-3 py-1">
            Viewing as admin — you're not a member of this group
          </p>
        )}
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

      {tab === 'ledger' && (
        <>
          {expenses.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
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
            </div>
          )}

          {expenses.length === 0 ? (
            <div className="text-center border border-dashed border-line rounded-2xl py-16 px-6">
              <p className="font-display text-lg text-ink mb-1">No expenses yet</p>
              <p className="text-sm text-ink-soft">Add the first one to start the ledger.</p>
            </div>
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
                  onDelete={handleDeleteExpense}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'balances' && (
        <BalancesPanel
          members={members}
          expenses={expenses}
          settlements={settlements}
          currentUserId={user.id}
          homeCurrency={group.home_currency}
          onSettle={setSettleSuggestion}
          onUndoSettlement={handleUndoSettlement}
        />
      )}

      {tab === 'reports' && (
        <Suspense fallback={<p className="text-sm text-ink-soft">Loading reports…</p>}>
          <ReportsPanel
            expenses={expenses}
            members={members}
            homeCurrency={group.home_currency}
            currentUserId={user.id}
          />
        </Suspense>
      )}

      {tab === 'members' && (
        <MembersPanel
          group={group}
          members={members}
          currentUserId={user.id}
          isOwner={isOwner}
          canManage={canManage}
          onRename={handleRenameGroup}
          onRemoveMember={handleRemoveMember}
          onDeleteGroup={handleDeleteGroup}
          onToggleManager={handleToggleManager}
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

      {showAdd && (
        <AddExpenseForm
          group={group}
          members={members}
          currentUserId={user.id}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
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
