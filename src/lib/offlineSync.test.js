import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// runSync() talks to Supabase; replace the client with a stub whose
// expenses lookup returns whatever each test sets in `currentRow`.
const state = { currentRow: null, updateCalls: 0 }

vi.mock('./supabaseClient', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () =>
      state.currentRow ? { data: state.currentRow, error: null } : { data: null, error: { message: 'not found' } },
    update: () => {
      state.updateCalls += 1
      return chain
    },
  }
  return { supabase: { from: () => chain } }
})
vi.mock('./activity', () => ({ logActivity: vi.fn(), notifyGroup: vi.fn() }))
vi.mock('./fx', () => ({ getRate: vi.fn(async () => 1) }))

const { enqueue, getQueue, runSync, getLastConflicts } = await import('./offlineQueue')

function updatePayload() {
  return {
    description: 'Dinner',
    paid_by: 'u1',
    currency: 'USD',
    amount: 40,
    expense_date: '2026-09-04',
    homeCurrency: 'USD',
    splits: [{ user_id: 'u1', share_amount: 40, percentage: null }],
  }
}

beforeEach(() => {
  localStorage.clear()
  getQueue().length = 0
  state.currentRow = null
  state.updateCalls = 0
  vi.stubGlobal('navigator', { onLine: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runSync: edit of an expense changed remotely while offline', () => {
  it('reports a conflict and applies nothing when the expense was deleted elsewhere (OFF-08)', async () => {
    state.currentRow = { deleted_at: '2026-09-05T00:00:00Z', updated_at: 'x', currency: 'USD', amount: 30, expense_date: '2026-09-04' }
    enqueue({ type: 'expense.update', entityId: 'e1', groupId: 'g1', payload: updatePayload() })
    await runSync()
    expect(getLastConflicts()).toHaveLength(1)
    expect(getLastConflicts()[0]).toMatch(/deleted elsewhere/)
    expect(state.updateCalls).toBe(0)
    expect(getQueue()).toEqual([])
  })

  it('reports a conflict and applies nothing when the expense no longer exists', async () => {
    state.currentRow = null
    enqueue({ type: 'expense.update', entityId: 'e1', groupId: 'g1', payload: updatePayload() })
    await runSync()
    expect(getLastConflicts()[0]).toMatch(/no longer exists/)
    expect(state.updateCalls).toBe(0)
    expect(getQueue()).toEqual([])
  })
})

describe('offlineQueue: add, then edit, then reconnect (OFF-15)', () => {
  it('keeps one create op carrying the latest values after several edits', () => {
    enqueue({ type: 'expense.create', entityId: 'a', groupId: 'g1', payload: { ...updatePayload(), description: 'Lunch', amount: 30 } })
    enqueue({ type: 'expense.update', entityId: 'a', groupId: 'g1', payload: { description: 'Dinner', amount: 40 } })
    enqueue({ type: 'expense.update', entityId: 'a', groupId: 'g1', payload: { amount: 55 } })
    const queue = getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].type).toBe('expense.create')
    expect(queue[0].payload.description).toBe('Dinner')
    expect(queue[0].payload.amount).toBe(55)
  })
})
