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

// `useSyncExternalStore` requires a stable (===) snapshot reference when
// nothing has changed, or React re-renders every subscriber on every tick —
// this in-memory cache is what makes `getQueue()` safe to use as a
// `getSnapshot`, on top of also avoiding a JSON round-trip on every read.
let cachedQueue = readFromStorage()

function write(queue) {
  cachedQueue = queue
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // storage unavailable (private browsing, quota) — the queue just
    // won't survive a reload; nothing to recover from here.
  }
  listeners.forEach((l) => l())
}

export function getQueue() {
  return cachedQueue
}

export function listPending(groupId) {
  return cachedQueue.filter((op) => op.groupId === groupId)
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
  const queue = cachedQueue
  const entry = {
    opId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    lastError: null,
    expectedUpdatedAt: null,
    ...op,
  }

  if (entry.type === 'expense.delete' || entry.type === 'settlement.delete') {
    const create = findUnsyncedCreate(queue, entry.type, entry.entityId)
    if (create) {
      write(queue.filter((o) => o.opId !== create.opId))
      return
    }
  }

  if (entry.type === 'expense.update') {
    const create = findUnsyncedCreate(queue, entry.type, entry.entityId)
    if (create) {
      write(
        queue.map((o) =>
          o.opId === create.opId ? { ...o, payload: { ...o.payload, ...entry.payload } } : o
        )
      )
      return
    }
  }

  write([...queue, entry])
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

async function resolveRate(currency, homeCurrency) {
  if (currency === homeCurrency) return 1
  return getRate(currency, homeCurrency)
}

async function applyExpenseCreate(op) {
  const { payload } = op
  const finalRate = await resolveRate(payload.currency, payload.homeCurrency)
  const amountInHome = Math.round(payload.amount * finalRate * 100) / 100

  const { error: expenseError } = await supabase.from('expenses').insert({
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
  })
  if (expenseError) throw expenseError

  const splitRows = payload.splits.map((s) => ({
    expense_id: op.entityId,
    user_id: s.user_id,
    share_amount: s.share_amount,
    share_in_home: Math.round(s.share_amount * finalRate * 100) / 100,
    percentage: s.percentage,
  }))
  const { error: splitError } = await supabase.from('expense_splits').insert(splitRows)
  if (splitError) throw splitError

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
    url: `/groups/${op.groupId}`,
  })
}

async function applyExpenseUpdate(op) {
  const { payload } = op
  const { data: current, error: fetchError } = await supabase
    .from('expenses')
    .select('deleted_at, updated_at, currency, amount')
    .eq('id', op.entityId)
    .single()
  if (fetchError || !current) {
    return { conflict: `"${payload.description}" no longer exists — your edit wasn't applied.` }
  }
  if (current.deleted_at) {
    return { conflict: `"${payload.description}" was deleted elsewhere — your edit wasn't applied.` }
  }

  const rateChanged =
    payload.currency !== current.currency || Math.abs(payload.amount - current.amount) > 0.005
  const finalRate = rateChanged ? await resolveRate(payload.currency, payload.homeCurrency) : null

  const { data: updatedRow, error: updateError } = await supabase
    .from('expenses')
    .update({
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
    })
    .eq('id', op.entityId)
    .select('exchange_rate')
    .single()
  if (updateError) throw updateError

  const { error: deleteError } = await supabase.from('expense_splits').delete().eq('expense_id', op.entityId)
  if (deleteError) throw deleteError

  const effectiveRate = rateChanged ? finalRate : updatedRow.exchange_rate
  const splitRows = payload.splits.map((s) => ({
    expense_id: op.entityId,
    user_id: s.user_id,
    share_amount: s.share_amount,
    share_in_home: Math.round(s.share_amount * effectiveRate * 100) / 100,
    percentage: s.percentage,
  }))
  const { error: splitError } = await supabase.from('expense_splits').insert(splitRows)
  if (splitError) throw splitError

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
    url: `/groups/${op.groupId}`,
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
  listeners.forEach((l) => l())
  try {
    // Snapshot once, in arrival order — the collapsing invariant above is
    // what makes strict FIFO safe without a dependency graph. New ops
    // can't arrive mid-run: enqueue() only ever fires while genuinely
    // offline, and this function only runs while `navigator.onLine`, so
    // the two never overlap for the same op.
    const toProcess = cachedQueue.filter((o) => o.status !== 'failed')
    for (const op of toProcess) {
      const applier = APPLIERS[op.type]
      try {
        const result = (await applier(op)) || {}
        if (result.conflict) lastConflicts.push(result.conflict)
        removeOp(op.opId)
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
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => runSync())
  // Covers both "app was already open when connectivity returned" (the
  // online listener above) and "opened online with a leftover queue from
  // last session."
  runSync()
}
