import { describe, it, expect } from 'vitest'
import { rateForKey } from './useLiveRate'

describe('rateForKey', () => {
  it('is always 1 when the currencies match, regardless of any stored result', () => {
    expect(rateForKey({ key: null, rate: null }, 'USD|USD|', true)).toBe(1)
    expect(rateForKey({ key: 'EUR|USD|', rate: 1.13 }, 'USD|USD|', true)).toBe(1)
  })
  it('returns the stored rate only for the exact key it was fetched for', () => {
    expect(rateForKey({ key: 'EUR|USD|', rate: 1.13 }, 'EUR|USD|', false)).toBe(1.13)
  })
  it('never reuses a rate across a currency or date change (the RES-10 bug)', () => {
    expect(rateForKey({ key: 'EUR|USD|', rate: 1.13 }, 'GBP|USD|', false)).toBeNull()
    expect(rateForKey({ key: 'EUR|USD|', rate: 1.13 }, 'EUR|USD|2026-09-01', false)).toBeNull()
    expect(rateForKey({ key: null, rate: null }, 'EUR|USD|', false)).toBeNull()
  })
})
