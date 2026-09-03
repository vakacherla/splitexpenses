import { describe, it, expect } from 'vitest'
import { formatMoney } from './fx'

describe('formatMoney', () => {
  it('formats a valid currency without throwing', () => {
    expect(() => formatMoney(1234.5, 'INR')).not.toThrow()
    expect(() => formatMoney(1234.5, 'USD')).not.toThrow()
  })

  it('includes the numeric amount for a valid currency', () => {
    const result = formatMoney(1234.5, 'USD')
    expect(result).toMatch(/1,?234\.50/)
  })

  it('falls back to "amount CODE" for an unrecognized currency code rather than throwing', () => {
    const result = formatMoney(42, 'NOTACURRENCY')
    expect(result).toBe('42.00 NOTACURRENCY')
  })

  it('rounds to two decimal places in the fallback path', () => {
    const result = formatMoney(9.999, 'NOTACURRENCY')
    expect(result).toBe('10.00 NOTACURRENCY')
  })
})
