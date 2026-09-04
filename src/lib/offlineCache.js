// Read-side of offline mode: a plain localStorage snapshot of the last
// successful fetch for the Dashboard and for each group, plus pure
// functions that overlay pending write-queue ops onto a fetched list so a
// just-added-while-offline expense/settlement shows up immediately.
//
// Write-through happens at the one clean seam each screen already has —
// Dashboard.jsx's loadGroups() and GroupView.jsx's load() — right after a
// fetch succeeds. Read-fallback happens in the same functions' catch
// block, when a fetch fails outright (offline).

import { peekCachedRate } from './fx'

const DASHBOARD_KEY = 'ledger_cache_dashboard_v1'
const groupKey = (groupId) => `ledger_cache_group_${groupId}_v1`

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable (private browsing, quota) — caching is a nicety,
    // not a requirement; the live fetch path still works normally.
  }
}

export function getCachedDashboard() {
  return readJSON(DASHBOARD_KEY)
}

export function setCachedDashboard(groups) {
  writeJSON(DASHBOARD_KEY, { groups, cachedAt: new Date().toISOString() })
}

export function getCachedGroup(groupId) {
  return readJSON(groupKey(groupId))
}

export function setCachedGroup(groupId, { group, members, expenses, settlements }) {
  writeJSON(groupKey(groupId), { group, members, expenses, settlements, cachedAt: new Date().toISOString() })
}

// A pending create has no server-confirmed amount_in_home yet — estimate
// it from whatever rate happens to already be cached (same-currency needs
// no estimate at all: peekCachedRate returns 1 with no lookup). When
// nothing's cached for a genuinely new pair, amount_in_home is left null
// so the UI can show "pending" honestly instead of a fabricated number,
// while share_in_home still gets a rough passthrough (rate treated as 1)
// so balance/report math downstream has a number to sum rather than null.
function estimateHomeAmounts(amount, currency, homeCurrency, splits) {
  const rate = peekCachedRate(currency, homeCurrency)
  const effectiveRate = rate ?? 1
  return {
    amount_in_home: rate != null ? Math.round(amount * rate * 100) / 100 : null,
    splits: splits.map((s) => ({
      ...s,
      share_in_home: Math.round(s.share_amount * effectiveRate * 100) / 100,
    })),
  }
}

// Overlays pending `expense.*` ops from the write queue onto an already-
// fetched expense list. Pure — same inputs always produce the same
// output — so it's directly unit-testable without touching localStorage.
export function mergeQueueIntoExpenses(expenses, pendingOps, homeCurrency) {
  let result = expenses

  for (const op of pendingOps) {
    if (op.type === 'expense.create') {
      if (result.some((e) => e.id === op.entityId)) continue // already synced and refetched
      const { payload } = op
      const { amount_in_home, splits } = estimateHomeAmounts(payload.amount, payload.currency, homeCurrency, payload.splits)
      result = [
        {
          id: op.entityId,
          group_id: op.groupId,
          description: payload.description,
          paid_by: payload.paid_by,
          currency: payload.currency,
          amount: payload.amount,
          amount_in_home,
          expense_date: payload.expense_date,
          split_type: payload.split_type,
          category: payload.category,
          note: payload.note,
          items: payload.items,
          tax: payload.tax,
          tip: payload.tip,
          created_by: payload.created_by,
          created_at: op.createdAt,
          deleted_at: null,
          receipt_path: null,
          expense_splits: splits,
          _pendingSync: true,
        },
        ...result,
      ]
    } else if (op.type === 'expense.update') {
      result = result.map((e) => (e.id === op.entityId ? { ...e, ...op.payload, _pendingSync: true } : e))
    } else if (op.type === 'expense.delete') {
      result = result.filter((e) => e.id !== op.entityId)
    }
  }

  return result
}

export function mergeQueueIntoSettlements(settlements, pendingOps) {
  let result = settlements

  for (const op of pendingOps) {
    if (op.type === 'settlement.create') {
      if (result.some((s) => s.id === op.entityId)) continue
      const { payload } = op
      result = [
        {
          id: op.entityId,
          group_id: op.groupId,
          from_user: payload.from_user,
          to_user: payload.to_user,
          currency: payload.currency,
          amount: payload.amount,
          note: payload.note,
          created_by: payload.created_by,
          created_at: op.createdAt,
          _pendingSync: true,
        },
        ...result,
      ]
    } else if (op.type === 'settlement.delete') {
      result = result.filter((s) => s.id !== op.entityId)
    }
  }

  return result
}
