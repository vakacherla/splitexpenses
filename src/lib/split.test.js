import { describe, it, expect } from 'vitest'
import { splitEvenly, splitByPercentages, splitItemized } from './split'

describe('splitEvenly', () => {
  it('splits an amount that divides cleanly', () => {
    expect(splitEvenly(100, 4)).toEqual([25, 25, 25, 25])
  })

  it('distributes leftover cents so the shares sum to exactly the total', () => {
    const shares = splitEvenly(100, 3)
    const sum = shares.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100) / 100).toBe(100)
    // 100 / 3 = 33.333... — two people should absorb the extra cent between them
    expect(shares.filter((s) => s === 33.34).length).toBeGreaterThanOrEqual(1)
  })

  it('handles an amount with more remainder cents than participants (wraps around)', () => {
    // 10.06 / 4 = 2.515 -> base 2.51, needs 2 extra cents distributed across 4 people
    const shares = splitEvenly(10.06, 4)
    const sum = shares.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100) / 100).toBe(10.06)
  })

  it('returns the full amount as a single share for one participant', () => {
    expect(splitEvenly(47.33, 1)).toEqual([47.33])
  })

  it('returns an empty array for zero or negative participants', () => {
    expect(splitEvenly(100, 0)).toEqual([])
    expect(splitEvenly(100, -1)).toEqual([])
  })

  it('handles a zero amount without error', () => {
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0])
  })

  it('never produces a share that disagrees with the total by more than a cent, across many odd totals', () => {
    for (let cents = 1; cents <= 500; cents += 7) {
      const total = Math.round(cents) / 100
      for (const n of [2, 3, 5, 7]) {
        const shares = splitEvenly(total, n)
        const sum = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100
        expect(sum).toBe(total)
      }
    }
  })
})

describe('splitByPercentages', () => {
  it('splits evenly when percentages are equal and divide cleanly', () => {
    expect(splitByPercentages(200, [50, 50])).toEqual([100, 100])
  })

  it('handles percentages that do not divide cleanly (33.33/33.33/33.34)', () => {
    const shares = splitByPercentages(100, [33.33, 33.33, 33.34])
    const sum = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100
    expect(sum).toBe(100)
  })

  it('gives the larger share to the larger percentage', () => {
    const shares = splitByPercentages(100, [70, 30])
    expect(shares[0]).toBeGreaterThan(shares[1])
    expect(shares[0]).toBeCloseTo(70, 5)
    expect(shares[1]).toBeCloseTo(30, 5)
  })

  it('awards leftover cents to the largest fractional remainder first', () => {
    // 10 split 3 ways at equal 33.33...% each -> raw 3.333 each -> floors to
    // 3.33 each (9.99 total), 1 cent left over, goes to whichever has the
    // largest fractional remainder (all tied here, so goes to the first).
    const shares = splitByPercentages(10, [33.333, 33.333, 33.334])
    const sum = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100
    expect(sum).toBe(10)
  })

  it('handles a single 100% share', () => {
    expect(splitByPercentages(58.5, [100])).toEqual([58.5])
  })

  it('sums to the total across a range of uneven percentage splits', () => {
    const cases = [
      [40, 30, 30],
      [25, 25, 25, 25],
      [1, 1, 98],
      [60, 20, 20],
    ]
    for (const pcts of cases) {
      for (const total of [10, 33.33, 99.99, 250]) {
        const shares = splitByPercentages(total, pcts)
        const sum = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100
        expect(sum).toBe(Math.round(total * 100) / 100)
      }
    }
  })
})

describe('splitItemized', () => {
  it('splits an item evenly among only the people assigned to it', () => {
    const { shares, total } = splitItemized(
      [{ amount: 20, participantIds: ['a', 'b'] }],
      ['a', 'b', 'c']
    )
    expect(shares).toEqual({ a: 10, b: 10, c: 0 })
    expect(total).toBe(20)
  })

  it('sums multiple items per person across different assignments', () => {
    const { shares, total } = splitItemized(
      [
        { amount: 30, participantIds: ['a'] }, // a's dish
        { amount: 20, participantIds: ['b'] }, // b's dish
        { amount: 10, participantIds: ['a', 'b'] }, // shared appetizer
      ],
      ['a', 'b']
    )
    expect(shares).toEqual({ a: 35, b: 25 })
    expect(total).toBe(60)
  })

  it('splits tax proportionally to each person\'s item subtotal', () => {
    // a ordered 75% of the food, b ordered 25% — tax should follow suit
    const { shares, total } = splitItemized(
      [
        { amount: 75, participantIds: ['a'] },
        { amount: 25, participantIds: ['b'] },
      ],
      ['a', 'b'],
      20
    )
    expect(shares.a).toBeCloseTo(90, 5) // 75 + 75% of 20
    expect(shares.b).toBeCloseTo(30, 5) // 25 + 25% of 20
    expect(total).toBe(120)
  })

  it('splits tip proportionally to each person\'s item subtotal, independently of tax', () => {
    const { shares, total } = splitItemized(
      [
        { amount: 75, participantIds: ['a'] },
        { amount: 25, participantIds: ['b'] },
      ],
      ['a', 'b'],
      20, // tax
      10 // tip
    )
    expect(shares.a).toBeCloseTo(97.5, 5) // 75 + 75% of 20 (=15) + 75% of 10 (=7.5)
    expect(shares.b).toBeCloseTo(32.5, 5) // 25 + 25% of 20 (=5) + 25% of 10 (=2.5)
    expect(total).toBe(130)
  })

  it('falls back to an even split of tax/tip when nobody has an item subtotal yet', () => {
    const { shares, total } = splitItemized([], ['a', 'b'], 10, 4)
    expect(shares.a).toBeCloseTo(7, 5)
    expect(shares.b).toBeCloseTo(7, 5)
    expect(total).toBe(14)
  })

  it('ignores an item assigned to nobody in the participant list', () => {
    const { shares } = splitItemized([{ amount: 15, participantIds: ['ghost'] }], ['a', 'b'])
    expect(shares).toEqual({ a: 0, b: 0 })
  })

  it('always sums shares back to exactly the total, across uneven splits', () => {
    const { shares, total } = splitItemized(
      [
        { amount: 33.33, participantIds: ['a', 'b', 'c'] },
        { amount: 10, participantIds: ['a'] },
      ],
      ['a', 'b', 'c'],
      7.77,
      3.21
    )
    const sum = Math.round(Object.values(shares).reduce((s, v) => s + v, 0) * 100) / 100
    expect(sum).toBe(total)
  })
})
