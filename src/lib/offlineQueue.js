// Local write queue for expenses/settlements entered with no signal —
// see PRODUCT-ROADMAP.md's "True offline mode" entry. Deliberately
// localStorage, not IndexedDB: receipts (the one genuinely large payload)
// are excluded from offline entry entirely, so everything queued here is
// a few KB of JSON — the same scale as fx.js's rate cache.
//
// Ids are client-generated (crypto.randomUUID(), same pattern already used
// for itemized-split item ids in AddExpenseForm.jsx) and sent to Supabase
// as the row's real id. The optimistic local row and the eventual server
// row share one id from the moment of creation — there is no id-remapping
// problem to solve.
//
// Enqueue-time collapsing is what keeps sync ordering simple: as long as a
// create for an entity hasn't yet reached the server, any later edit or
// delete for that same entity is folded into (or cancels) that one queued
// create rather than becoming a second, dependent op. That invariant means
// a strict FIFO drain at sync time never has to reason about "did the
// thing this op depends on succeed yet" — an update/delete surviving in
// the queue only ever targets a row that's already real.

import { useSyncExternalStore } from 'react'
import { supabase } from './supabaseClient'
import { track } from './track'
import { getRate } from './fx'
import { logActivity, notifyGroup } from './activity'

const QUEUE_KEY = 'ledger_write_queue_v1'
const MAX_ATTEMPTS = 5

const listeners = new Set()

function readFromStorage() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// OFF-16 / AUTH-07: the queue is one shared bucket in localStorage, not
// namespaced per browser profile — a shared or borrowed device can have
// more than one person sign in over its lifetime. Every op is tagged with
// the `userId` that was signed in at enqueue time, and every *read* path
// below (the reactive hook, per-group listing, and sync itself) filters
// down to whoever's currently signed in — so B signing in after A queued
// something offline sees and syncs none of A's pending ops; they just sit
// untouched in storage until A is the one signed in again. An op with no
// `userId` at all is a pre-this-fix leftover (nothing upgraded it
// retroactively) and stays visible to anyone, same as it always was,
// rather than becoming silently stuck forever.
let currentUserId = null

function filterForCurrentUser(queue) {
  return queue.filter((op) => op.userId === undefined || op.userId === currentUserId)
}

// `useSyncExternalStore` requires a stable (===) snapshot reference when
// nothing has changed, or React re-renders every subscriber on every tick —
// this in-memory cache is what makes `getQueue()` safe to use as a
// `getSnapshot`, on top of also avoiding a JSON round-trip on every read.
let cachedQueue = readFromStorage()
let cachedUserQueue = filterForCurrentUser(cachedQueue)

function write(queue) {
  cachedQueue = queue
  cachedUserQueue = filterForCurrentUser(queue)
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // storage unavailable (private browsing, quota) — the queue just
    // won't survive a reload; nothing to recover from here.
  }
  listeners.forEach((l) => l())
}

// Test-only: re-syncs the in-memory cache from (presumably just-cleared)
// localStorage. `getQueue()` now returns a derived, filtered snapshot
// rather than the same array reference as the internal cache, so a test's
// old `getQueue().length = 0` trick no longer actually resets anything.
export function __resetQueueForTests() {
  currentUserId = null
  cachedQueue = readFromStorage()
  cachedUserQueue = filterForCurrentUser(cachedQueue)
}

// Called from AuthContext whenever the signed-in user changes (including
// to/from signed-out). Re-syncs immediately in case switching in revealed
// ops this user queued earlier and never got to send.
export function setCurrentUserId(userId) {
  if (userId === currentUserId) return
  currentUserId = userId
  cachedUserQueue = filterForCurrentUser(cachedQueue)
  listeners.forEach((l) => l())
  runSync()
}

export function getQueue() {
  return cachedUserQueue
}

export function listPending(groupId) {
  return cachedUserQueue.filter((op) => op.groupId === groupId)
}

export function subscribe(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

// Reactive view of the whole queue — components filter/derive what they
// need (e.g. `useMemo`'d per-group pending ops) rather than each keeping
// their own subscription logic.
export function useOfflineQueue() {
  return useSyncExternalStore(subscribe, getQueue, getQueue)
}

export function useIsSyncing() {
  return useSyncExternalStore(subscribe, isSyncing, isSyncing)
}

// Finds an unsynced create for this entity — one that's still sitting in
// the queue, whether pending or previously failed. If it's already synced,
// it's gone from the queue entirely, so this correctly returns null and
// the caller proceeds with a normal, independent op.
function findUnsyncedCreate(queue, type, entityId) {
  const createType = type.replace(/\.(update|delete)$/, '.create')
  return queue.find((op) => op.type === createType && op.entityId === entityId)
}

export function enqueue(op) {
  // Collapsing only ever considers this user's own unsynced ops — another
  // user's leftover queued create from a previous session on this device
  // should never be silently merged into or deleted by this one, even on
  // the off chance of an entityId collision (client-generated UUIDs, so
  // not actually possible in practice, but scoping this is the correct
  // invariant regardless of how unlikely the collision is).
  const queue = cachedUserQueue
  const entry = {
    opId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    lastError: null,
    expectedUpdatedAt: null,
    ...op,
    userId: currentUserId,
  }

  if (entry.type === 'expense.delete' || entry.type === 'settlement.delete') {
    const create = findUnsyncedCreate(queue, entry.type, entry.entityId)
    if (create) {
      write(cachedQueue.filter((o) => o.opId !== create.opId))
      return
    }
  }

  if (entry.type === 'expense.update') {
    const create = findUnsyncedCreate(queue, entry.type, entry.entityId)
    if (create) {
      write(
        cachedQueue.map((o) =>
          o.opId === create.opId ? { ...o, payload: { ...o.payload, ...entry.payload } } : o
        )
      )
      return
    }
  }

  write([...cachedQueue, entry])
}

export function discardOp(opId) {
  write(cachedQueue.filter((op) => op.opId !== opId))
}

export function retryOp(opId) {
  write(
    cachedQueue.map((op) => (op.opId === opId ? { ...op, status: 'pending', attempts: 0, lastError: null } : op))
  )
  runSync()
}

function updateOp(opId, patch) {
  write(cachedQueue.map((op) => (op.opId === opId ? { ...op, ...patch } : op)))
}

function removeOp(opId) {
  write(cachedQueue.filter((op) => op.opId !== opId))
}

// `date`, when given, resolves that day's historical rate instead of
// today's — matters for an expense queued offline with a backdated date,
// same as the online add/edit path in AddExpenseForm. Settlements don't
// pass one: a payment is recorded as of right now, not a past date, so
// "today's rate" is already the correct rate for those.
async function resolveRate(currency, homeCurrency, date) {
  if (currency === homeCurrency) return 1
  return getRate(currency, homeCurrency, date)
}

async function applyExpenseCreate(op) {
  const { payload } = op
  const finalRate = await resolveRate(payload.currency, payload.homeCurrency, payload.expense_date)
  const amountInHome = Math.round(payload.amount * finalRate * 100) / 100

  // One atomic call (migration 055). The fixed id makes a replay after a lost
  // response return the already-saved expense instead of failing or duplicating.
  const { error: expenseError } = await supabase.rpc('create_expense_with_splits', {
    p_expense: {
      id: op.entityId,
      group_id: op.groupId,
      description: payload.description,
      paid_by: payload.paid_by,
      currency: payload.currency,
      amount: payload.amount,
      exchange_rate: finalRate,
      amount_in_home: amountInHome,
      expense_date: payload.expense_date,
      split_type: payload.split_type,
      category: payload.category,
      note: payload.note,
      items: payload.items,
      tax: payload.tax,
      tip: payload.tip,
      created_by: payload.created_by,
    },
    p_splits: payload.splits.map((s) => ({
      user_id: s.user_id,
      share_amount: s.share_amount,
      share_in_home: Math.round(s.share_amount * finalRate * 100) / 100,
      percentage: s.percentage,
      share_units: s.share_units,
      adjustment: s.adjustment,
    })),
  })
  if (expenseError) throw expenseError

  track('expense_added', { split_type: String(payload.split_type ?? 'equal') })
  if (payload.split_type === 'itemized') track('feature_used', { feature: 'itemized_split' })
  const summary = `${payload.description} — ${payload.amount} ${payload.currency}`
  logActivity({
    groupId: op.groupId,
    actorId: payload.created_by,
    actorName: payload.actorName ?? 'Someone',
    eventType: 'expense_added',
    summary,
    entityId: op.entityId,
  })
  const otherMembers = (payload.memberIds ?? []).filter((id) => id !== payload.created_by)
  notifyGroup({
    groupId: op.groupId,
    targetUserIds: otherMembers,
    title: payload.groupName ?? 'Split Expenses',
    body: `${payload.actorName ?? 'Someone'} added an expense: ${summary}`,
    url: `/trips/${op.groupId}`,
  })
}

async function applyExpenseUpdate(op) {
  const { payload } = op
  const { data: current, error: fetchError } = await supabase
    .from('expenses')
    .select('deleted_at, updated_at, currency, amount, expense_date, exchange_rate')
    .eq('id', op.entityId)
    .single()
  if (fetchError || !current) {
    return { conflict: `"${payload.description}" no longer exists — your edit wasn't applied.` }
  }
  if (current.deleted_at) {
    return { conflict: `"${payload.description}" was deleted elsewhere — your edit wasn't applied.` }
  }

  const rateChanged =
    payload.currency !== current.currency ||
    payload.expense_date !== current.expense_date ||
    Math.abs(payload.amount - current.amount) > 0.005
  const finalRate = rateChanged ? await resolveRate(payload.currency, payload.homeCurrency, payload.expense_date) : null

  // The rate only changes when currency, date or amount did; otherwise the
  // stored rate stays and the splits are converted with it. One atomic call
  // (migration 055) updates the expense and replaces its splits together.
  const effectiveRate = rateChanged ? finalRate : current.exchange_rate
  const { error: updateError } = await supabase.rpc('update_expense_with_splits', {
    p_expense_id: op.entityId,
    p_expense: {
      description: payload.description,
      paid_by: payload.paid_by,
      currency: payload.currency,
      amount: payload.amount,
      ...(rateChanged
        ? { exchange_rate: finalRate, amount_in_home: Math.round(payload.amount * finalRate * 100) / 100 }
        : {}),
      expense_date: payload.expense_date,
      split_type: payload.split_type,
      category: payload.category,
      note: payload.note,
      items: payload.items,
      tax: payload.tax,
      tip: payload.tip,
    },
    p_splits: payload.splits.map((s) => ({
      user_id: s.user_id,
      share_amount: s.share_amount,
      share_in_home: Math.round(s.share_amount * effectiveRate * 100) / 100,
      percentage: s.percentage,
      share_units: s.share_units,
      adjustment: s.adjustment,
    })),
  })
  if (updateError) throw updateError
  if (payload.split_type === 'itemized') track('feature_used', { feature: 'itemized_split' })

  logActivity({
    groupId: op.groupId,
    actorId: payload.created_by,
    actorName: payload.actorName ?? 'Someone',
    eventType: 'expense_edited',
    summary: `${payload.description} — ${payload.amount} ${payload.currency}`,
    entityId: op.entityId,
  })

  const conflictedElsewhere = op.expectedUpdatedAt && current.updated_at !== op.expectedUpdatedAt
  return conflictedElsewhere
    ? { conflict: `Someone else changed "${payload.description}" while you were offline — your edit overwrote theirs.` }
    : {}
}

async function applyExpenseDelete(op) {
  const { payload } = op
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', op.entityId)
  if (error) throw error

  const {
    data: { user },
  } = await supabase.auth.getUser()
  logActivity({
    groupId: op.groupId,
    actorId: user?.id,
    actorName: payload.actorName ?? 'Someone',
    eventType: 'expense_deleted',
    summary: payload.summary ?? 'an expense',
    entityId: op.entityId,
  })
}

async function applySettlementCreate(op) {
  const { payload } = op
  const finalRate = await resolveRate(payload.currency, payload.homeCurrency)
  const { error } = await supabase.from('settlements').insert({
    id: op.entityId,
    group_id: op.groupId,
    from_user: payload.from_user,
    to_user: payload.to_user,
    currency: payload.currency,
    amount: payload.amount,
    exchange_rate: finalRate,
    amount_in_home: Math.round(payload.amount * finalRate * 100) / 100,
    note: payload.note,
    created_by: payload.created_by,
  })
  if (error) throw error

  track('settled_up')
  const actorName = payload.actorName ?? 'Someone'
  const summary = `${payload.amount} ${payload.currency}`
  logActivity({
    groupId: op.groupId,
    actorId: payload.created_by,
    actorName,
    eventType: 'settlement_added',
    summary,
    entityId: op.entityId,
  })
  const otherParty = payload.created_by === payload.from_user ? payload.to_user : payload.from_user
  notifyGroup({
    groupId: op.groupId,
    targetUserIds: [otherParty],
    title: payload.groupName ?? 'Split Expenses',
    body: `${actorName} recorded a payment: ${summary}`,
    url: `/trips/${op.groupId}`,
  })
}

async function applySettlementDelete(op) {
  const { payload } = op
  const { error } = await supabase.from('settlements').delete().eq('id', op.entityId)
  if (error) throw error

  const {
    data: { user },
  } = await supabase.auth.getUser()
  logActivity({
    groupId: op.groupId,
    actorId: user?.id,
    actorName: payload.actorName ?? 'Someone',
    eventType: 'settlement_deleted',
    summary: payload.summary ?? 'a payment',
    entityId: op.entityId,
  })
}

const APPLIERS = {
  'expense.create': applyExpenseCreate,
  'expense.update': applyExpenseUpdate,
  'expense.delete': applyExpenseDelete,
  'settlement.create': applySettlementCreate,
  'settlement.delete': applySettlementDelete,
}

let syncing = false
let lastConflicts = []

export function getLastConflicts() {
  return lastConflicts
}

export function isSyncing() {
  return syncing
}

export async function runSync() {
  if (syncing) return
  if (!navigator.onLine) return
  syncing = true
  lastConflicts = []
  let appliedAny = false
  listeners.forEach((l) => l())
  try {
    // Snapshot once, in arrival order — the collapsing invariant above is
    // what makes strict FIFO safe without a dependency graph. New ops
    // can't arrive mid-run: enqueue() only ever fires while genuinely
    // offline, and this function only runs while `navigator.onLine`, so
    // the two never overlap for the same op. Scoped to the current user's
    // own ops (see filterForCurrentUser above) — someone else's leftover
    // queued op from an earlier session on this device sits untouched
    // until they're the one signed in, rather than silently applying
    // under whoever happens to reconnect first.
    const toProcess = cachedUserQueue.filter((o) => o.status !== 'failed')
    for (const op of toProcess) {
      const applier = APPLIERS[op.type]
      try {
        const result = (await applier(op)) || {}
        if (result.conflict) lastConflicts.push(result.conflict)
        removeOp(op.opId)
        appliedAny = true
      } catch (err) {
        const attempts = op.attempts + 1
        updateOp(op.opId, {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'error',
          lastError: err.message || 'Sync failed',
        })
      }
    }
  } finally {
    syncing = false
    listeners.forEach((l) => l())
    if (appliedAny) track('feature_used', { feature: 'offline_queue' })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => runSync())
  // Covers both "app was already open when connectivity returned" (the
  // online listener above) and "opened online with a leftover queue from
  // last session."
  runSync()
}
