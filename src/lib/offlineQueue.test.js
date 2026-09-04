import { describe, it, expect, beforeEach } from 'vitest'
import { enqueue, getQueue, discardOp } from './offlineQueue'
import { mergeQueueIntoExpenses, mergeQueueIntoSettlements } from './offlineCache'

function baseExpensePayload(overrides = {}) {
  return {
    description: 'Lunch',
    paid_by: 'u1',
    currency: 'USD',
    amount: 30,
    expense_date: '2026-09-04',
    split_type: 'equal',
    category: 'Food',
    note: null,
    items: null,
    tax: null,
    tip: null,
    created_by: 'u1',
    homeCurrency: 'USD',
    splits: [
      { user_id: 'u1', share_amount: 15, percentage: null },
      { user_id: 'u2', share_amount: 15, percentage: null },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  // Force the module's in-memory cache back in sync with cleared storage —
  // it's a snapshot taken once at import time, not re-read per call.
  getQueue().length = 0
})

describe('offlineQueue enqueue ordering', () => {
  it('keeps ops for different entities in insertion order', () => {
    enqueue({ type: 'expense.create', entityId: 'a', groupId: 'g1', payload: baseExpensePayload() })
    enqueue({ type: 'expense.create', entityId: 'b', groupId: 'g1', payload: baseExpensePayload() })
    enqueue({ type: 'expense.create', entityId: 'c', groupId: 'g1', payload: baseExpensePayload() })
    const queue = getQueue()
    expect(queue.map((op) => op.entityId)).toEqual(['a', 'b', 'c'])
  })
})

describe('offlineQueue collapsing', () => {
  it('cancels a create+delete pair for the same unsynced entity to an empty queue', () => {
    enqueue({ type: 'expense.create', entityId: 'a', groupId: 'g1', payload: baseExpensePayload() })
    enqueue({ type: 'expense.delete', entityId: 'a', groupId: 'g1', payload: {} })
    expect(getQueue()).toEqual([])
  })

  it('merges a create+update pair for the same unsynced entity into one create op', () => {
    enqueue({ type: 'expense.create', entityId: 'a', groupId: 'g1', payload: baseExpensePayload() })
    enqueue({
      type: 'expense.update',
      entityId: 'a',
      groupId: 'g1',
      payload: baseExpensePayload({ description: 'Dinner', amount: 50 }),
    })
    const queue = getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].type).toBe('expense.create')
    expect(queue[0].payload.description).toBe('Dinner')
    expect(queue[0].payload.amount).toBe(50)
  })

  it('does not collapse ops for different entities', () => {
    enqueue({ type: 'expense.create', entityId: 'a', groupId: 'g1', payload: baseExpensePayload() })
    enqueue({ type: 'expense.delete', entityId: 'b', groupId: 'g1', payload: {} })
    const queue = getQueue()
    expect(queue).toHaveLength(2)
  })

  it('leaves an update as its own op when no unsynced create exists for that entity (already-synced row)', () => {
    enqueue({
      type: 'expense.update',
      entityId: 'already-synced',
      groupId: 'g1',
      payload: baseExpensePayload(),
    })
    const queue = getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].type).toBe('expense.update')
  })
})

describe('discardOp', () => {
  it('removes a specific op by id without touching others', () => {
    enqueue({ type: 'expense.create', entityId: 'a', groupId: 'g1', payload: baseExpensePayload() })
    enqueue({ type: 'expense.create', entityId: 'b', groupId: 'g1', payload: baseExpensePayload() })
    const [first] = getQueue()
    discardOp(first.opId)
    const queue = getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].entityId).toBe('b')
  })
})

describe('mergeQueueIntoExpenses', () => {
  it('prepends a pending create not already present in the fetched list', () => {
    enqueue({ type: 'expense.create', entityId: 'a', groupId: 'g1', payload: baseExpensePayload() })
    const merged = mergeQueueIntoExpenses([], getQueue(), 'USD')
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a')
    expect(merged[0]._pendingSync).toBe(true)
    // Same-currency needs no rate estimate at all — exact, not a guess.
    expect(merged[0].amount_in_home).toBe(30)
  })

  it('does not duplicate a create once the real row has been fetched back', () => {
    enqueue({ type: 'expense.create', entityId: 'a', groupId: 'g1', payload: baseExpensePayload() })
    const fetched = [{ id: 'a', description: 'Lunch', expense_splits: [] }]
    const merged = mergeQueueIntoExpenses(fetched, getQueue(), 'USD')
    expect(merged).toHaveLength(1)
  })

  it('excludes a pending delete from the rendered list', () => {
    const fetched = [{ id: 'x', description: 'Old', expense_splits: [] }]
    enqueue({ type: 'expense.delete', entityId: 'x', groupId: 'g1', payload: {} })
    const merged = mergeQueueIntoExpenses(fetched, getQueue(), 'USD')
    expect(merged).toHaveLength(0)
  })

  it('overlays a pending update on the matching fetched row', () => {
    const fetched = [{ id: 'x', description: 'Old', amount: 10, expense_splits: [] }]
    enqueue({ type: 'expense.update', entityId: 'x', groupId: 'g1', payload: { description: 'New', amount: 20 } })
    const merged = mergeQueueIntoExpenses(fetched, getQueue(), 'USD')
    expect(merged).toHaveLength(1)
    expect(merged[0].description).toBe('New')
    expect(merged[0].amount).toBe(20)
    expect(merged[0]._pendingSync).toBe(true)
  })
})

describe('mergeQueueIntoSettlements', () => {
  it('prepends a pending settlement create', () => {
    enqueue({
      type: 'settlement.create',
      entityId: 's1',
      groupId: 'g1',
      payload: { from_user: 'u1', to_user: 'u2', currency: 'USD', amount: 20, note: null, created_by: 'u1' },
    })
    const merged = mergeQueueIntoSettlements([], getQueue())
    expect(merged).toHaveLength(1)
    expect(merged[0]._pendingSync).toBe(true)
  })

  it('excludes a pending settlement delete', () => {
    const fetched = [{ id: 's1' }]
    enqueue({ type: 'settlement.delete', entityId: 's1', groupId: 'g1', payload: {} })
    const merged = mergeQueueIntoSettlements(fetched, getQueue())
    expect(merged).toHaveLength(0)
  })
})
