import { describe, it, expect, beforeEach } from 'vitest'
import { mergeQueueIntoSettlements } from './offlineCache'

describe('mergeQueueIntoSettlements', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sets amount_in_home for a same-currency pending settlement, not undefined', () => {
    const pendingOps = [
      {
        type: 'settlement.create',
        entityId: 'pending-1',
        groupId: 'g1',
        createdAt: '2026-10-01T00:00:00Z',
        payload: { from_user: 'a', to_user: 'b', currency: 'USD', amount: 10, note: null, created_by: 'a' },
      },
    ]
    const result = mergeQueueIntoSettlements([], pendingOps, 'USD')
    expect(result[0].amount_in_home).toBe(10)
  })

  it('falls back to null (not undefined) amount_in_home when no rate is cached for a foreign-currency pending settlement', () => {
    const pendingOps = [
      {
        type: 'settlement.create',
        entityId: 'pending-1',
        groupId: 'g1',
        createdAt: '2026-10-01T00:00:00Z',
        payload: { from_user: 'a', to_user: 'b', currency: 'EUR', amount: 10, note: null, created_by: 'a' },
      },
    ]
    const result = mergeQueueIntoSettlements([], pendingOps, 'USD')
    // null (which coerces to 0 in arithmetic), never undefined (which
    // would poison computeNetBalances' running sum into NaN) — the exact
    // bug this test guards against (OFF-09).
    expect(result[0].amount_in_home).toBeNull()
  })

  it('leaves already-synced settlements untouched when the op has already landed', () => {
    const existing = [{ id: 'real-1', amount_in_home: 10 }]
    const pendingOps = [
      {
        type: 'settlement.create',
        entityId: 'real-1',
        groupId: 'g1',
        createdAt: '2026-10-01T00:00:00Z',
        payload: { from_user: 'a', to_user: 'b', currency: 'USD', amount: 10, note: null, created_by: 'a' },
      },
    ]
    const result = mergeQueueIntoSettlements(existing, pendingOps, 'USD')
    expect(result).toEqual(existing)
  })

  it('removes a settlement queued for delete', () => {
    const existing = [{ id: 'real-1', amount_in_home: 10 }]
    const pendingOps = [{ type: 'settlement.delete', entityId: 'real-1', groupId: 'g1' }]
    const result = mergeQueueIntoSettlements(existing, pendingOps, 'USD')
    expect(result).toEqual([])
  })
})
