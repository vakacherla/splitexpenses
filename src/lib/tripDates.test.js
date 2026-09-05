import { describe, it, expect } from 'vitest'
import { validateTripDates } from './tripDates'

describe('validateTripDates', () => {
  it('allows neither date set', () => {
    expect(validateTripDates(null, null)).toEqual({ valid: true, error: null })
    expect(validateTripDates('', '')).toEqual({ valid: true, error: null })
  })

  it('allows only a start date', () => {
    expect(validateTripDates('2026-09-10', null)).toEqual({ valid: true, error: null })
    expect(validateTripDates('2026-09-10', '')).toEqual({ valid: true, error: null })
  })

  it('allows only an end date', () => {
    expect(validateTripDates(null, '2026-09-10')).toEqual({ valid: true, error: null })
    expect(validateTripDates('', '2026-09-10')).toEqual({ valid: true, error: null })
  })

  it('allows end date after start date', () => {
    expect(validateTripDates('2026-09-01', '2026-09-10')).toEqual({ valid: true, error: null })
  })

  it('allows a same-day trip', () => {
    expect(validateTripDates('2026-09-10', '2026-09-10')).toEqual({ valid: true, error: null })
  })

  it('rejects an end date before the start date', () => {
    const result = validateTripDates('2026-09-10', '2026-09-01')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects an end date one day before the start date', () => {
    const result = validateTripDates('2026-09-10', '2026-09-09')
    expect(result.valid).toBe(false)
  })

  it('rejects across a year boundary', () => {
    const result = validateTripDates('2027-01-05', '2026-12-30')
    expect(result.valid).toBe(false)
  })
})
