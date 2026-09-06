import { describe, it, expect } from 'vitest'
import { isAmountTooLarge, MAX_AMOUNT } from './amountBounds'

describe('isAmountTooLarge', () => {
  it('accepts a normal amount', () => {
    expect(isAmountTooLarge(100)).toBe(false)
  })

  it('accepts the maximum exactly', () => {
    expect(isAmountTooLarge(MAX_AMOUNT)).toBe(false)
  })

  it('rejects an amount just above the maximum', () => {
    expect(isAmountTooLarge(MAX_AMOUNT + 0.01)).toBe(true)
  })

  it('rejects a wildly large amount', () => {
    expect(isAmountTooLarge(99_999_999_999)).toBe(true)
  })

  it('does not flag NaN or Infinity as "too large" (a different failure mode)', () => {
    expect(isAmountTooLarge(NaN)).toBe(false)
    expect(isAmountTooLarge(Infinity)).toBe(false)
  })

  it('accepts zero and negative amounts (out of scope for this check)', () => {
    expect(isAmountTooLarge(0)).toBe(false)
    expect(isAmountTooLarge(-50)).toBe(false)
  })
})
