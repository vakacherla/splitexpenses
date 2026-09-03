import { describe, it, expect } from 'vitest'
import { computeNetBalances, simplifyDebts } from './balances'

const members = (...ids) => ids.map((user_id) => ({ user_id }))

describe('computeNetBalances', () => {
  it('credits the payer and debits each split participant for a simple 50/50 expense', () => {
    const net = computeNetBalances(
      members('a', 'b'),
      [{ paid_by: 'a', amount_in_home: 100, expense_splits: [{ user_id: 'a', share_in_home: 50 }, { user_id: 'b', share_in_home: 50 }] }],
      []
    )
    expect(net.get('a')).toBe(50) // fronted 100, owes back only their own 50 share
    expect(net.get('b')).toBe(-50) // owes their 50 share
  })

  it('accumulates correctly across multiple expenses paid by different people', () => {
    const net = computeNetBalances(
      members('a', 'b'),
      [
        { paid_by: 'a', amount_in_home: 100, expense_splits: [{ user_id: 'a', share_in_home: 50 }, { user_id: 'b', share_in_home: 50 }] },
        { paid_by: 'b', amount_in_home: 60, expense_splits: [{ user_id: 'a', share_in_home: 30 }, { user_id: 'b', share_in_home: 30 }] },
      ],
      []
    )
    expect(net.get('a')).toBe(20) // +100 paid -50 own share -30 other expense's share
    expect(net.get('b')).toBe(-20)
  })

  it('members with no expenses or settlements start and stay at zero', () => {
    const net = computeNetBalances(members('a', 'b', 'c'), [], [])
    expect(net.get('a')).toBe(0)
    expect(net.get('b')).toBe(0)
    expect(net.get('c')).toBe(0)
  })

  it('a full settlement zeroes out both parties', () => {
    let net = computeNetBalances(
      members('a', 'b'),
      [{ paid_by: 'a', amount_in_home: 100, expense_splits: [{ user_id: 'a', share_in_home: 50 }, { user_id: 'b', share_in_home: 50 }] }],
      [{ from_user: 'b', to_user: 'a', amount_in_home: 50 }]
    )
    expect(net.get('a')).toBe(0)
    expect(net.get('b')).toBe(0)
  })

  it('a partial settlement reduces but does not zero the balance', () => {
    const net = computeNetBalances(
      members('a', 'b'),
      [{ paid_by: 'a', amount_in_home: 100, expense_splits: [{ user_id: 'a', share_in_home: 50 }, { user_id: 'b', share_in_home: 50 }] }],
      [{ from_user: 'b', to_user: 'a', amount_in_home: 20 }]
    )
    expect(net.get('a')).toBe(30)
    expect(net.get('b')).toBe(-30)
  })

  it('an expense split among only some members still credits the full amount to the payer', () => {
    // a pays 90 for a dinner only a and b attended; c is in the group but not this expense
    const net = computeNetBalances(
      members('a', 'b', 'c'),
      [{ paid_by: 'a', amount_in_home: 90, expense_splits: [{ user_id: 'a', share_in_home: 45 }, { user_id: 'b', share_in_home: 45 }] }],
      []
    )
    expect(net.get('a')).toBe(45)
    expect(net.get('b')).toBe(-45)
    expect(net.get('c')).toBe(0)
  })
})

describe('simplifyDebts', () => {
  it('produces no transactions when everyone is already settled', () => {
    const net = new Map([['a', 0], ['b', 0]])
    expect(simplifyDebts(net)).toEqual([])
  })

  it('treats amounts within the epsilon as settled (floating point noise)', () => {
    const net = new Map([['a', 0.004], ['b', -0.004]])
    expect(simplifyDebts(net)).toEqual([])
  })

  it('produces a single payment for the simplest two-person case', () => {
    const net = new Map([['a', 50], ['b', -50]])
    const result = simplifyDebts(net)
    expect(result).toEqual([{ from: 'b', to: 'a', amount: 50 }])
  })

  it('routes a debtor directly to a creditor even when a third person nets to zero — the whole point of simplifying', () => {
    const net = new Map([['a', -30], ['b', 0], ['c', 30]])
    const result = simplifyDebts(net)
    expect(result).toEqual([{ from: 'a', to: 'c', amount: 30 }])
  })

  it('pays the largest creditor first when there are multiple debtors and one creditor', () => {
    const net = new Map([['a', 100], ['b', -60], ['c', -40]])
    const result = simplifyDebts(net)
    expect(result).toHaveLength(2)
    const total = result.reduce((sum, t) => sum + t.amount, 0)
    expect(Math.round(total * 100) / 100).toBe(100)
    expect(result.every((t) => t.to === 'a')).toBe(true)
  })

  it('fully resolves every balance to zero when the suggested transactions are applied', () => {
    // A stress case: 4 debtors, 2 creditors with uneven amounts. This is the
    // property that actually matters — not the exact transaction count, but
    // that following the suggestions genuinely settles everyone up.
    const net = new Map([
      ['a', 120],
      ['b', 80],
      ['c', -50],
      ['d', -50],
      ['e', -60],
      ['f', -40],
    ])
    const result = simplifyDebts(net)
    expect(result.length).toBeLessThanOrEqual(5) // never worse than one payment per debtor

    const resolved = new Map(net)
    for (const t of result) {
      resolved.set(t.from, (resolved.get(t.from) ?? 0) + t.amount)
      resolved.set(t.to, (resolved.get(t.to) ?? 0) - t.amount)
    }
    for (const [, amount] of resolved) {
      expect(Math.abs(amount)).toBeLessThan(0.01)
    }
  })
})
