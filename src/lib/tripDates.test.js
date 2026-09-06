import { describe, it, expect } from 'vitest'
import { validateTripDates, validateDateInRange, MIN_TRIP_YEAR, MAX_TRIP_YEAR } from './tripDates'

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

  it('rejects a start date typed with an absurdly low year', () => {
    const result = validateTripDates('0005-05-05', '2026-09-10')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Start date/)
  })

  it('rejects an end date typed with a 3-digit-feeling low year', () => {
    const result = validateTripDates('2026-09-01', '0644-04-04')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/End date/)
  })

  it('rejects a year just below the minimum', () => {
    const result = validateTripDates(`${MIN_TRIP_YEAR - 1}-12-31`, null)
    expect(result.valid).toBe(false)
  })

  it('accepts the minimum year exactly', () => {
    const result = validateTripDates(`${MIN_TRIP_YEAR}-01-01`, null)
    expect(result.valid).toBe(true)
  })

  it('rejects a year just above the maximum', () => {
    const result = validateTripDates(null, `${MAX_TRIP_YEAR + 1}-01-01`)
    expect(result.valid).toBe(false)
  })

  it('accepts the maximum year exactly', () => {
    const result = validateTripDates(null, `${MAX_TRIP_YEAR}-12-31`)
    expect(result.valid).toBe(true)
  })

  it('rejects a wildly far-future year typo', () => {
    const result = validateTripDates('9999-01-01', null)
    expect(result.valid).toBe(false)
  })

  it('checks year range even when both dates are otherwise correctly ordered', () => {
    const result = validateTripDates('0005-05-05', '0644-04-04')
    expect(result.valid).toBe(false)
  })

  it('reports the start date first when both dates have a bad year, in start/end order', () => {
    // '0644' < '0005' as calendar order is reversed too, but the year check
    // runs before the ordering check and inspects start before end.
    const result = validateTripDates('0644-04-04', '0005-05-05')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Start date/)
  })

  it('handles no arguments at all without throwing', () => {
    expect(validateTripDates()).toEqual({ valid: true, error: null })
  })

  it('handles undefined explicitly the same as unset', () => {
    expect(validateTripDates(undefined, undefined)).toEqual({ valid: true, error: null })
  })

  it('rejects a whitespace-only date instead of silently treating it as unset', () => {
    const result = validateTripDates('   ', '2026-09-10')
    expect(result.valid).toBe(false)
  })

  it('rejects a non-date garbage string instead of throwing', () => {
    expect(() => validateTripDates('not-a-date', '2026-09-10')).not.toThrow()
    const result = validateTripDates('not-a-date', '2026-09-10')
    expect(result.valid).toBe(false)
  })

  it('accepts a leap-day start date within range', () => {
    const result = validateTripDates('2028-02-29', '2028-03-01')
    expect(result).toEqual({ valid: true, error: null })
  })

  it('accepts the last day of the minimum year', () => {
    const result = validateTripDates(`${MIN_TRIP_YEAR}-12-31`, null)
    expect(result.valid).toBe(true)
  })

  it('accepts the first day of the maximum year', () => {
    const result = validateTripDates(null, `${MAX_TRIP_YEAR}-01-01`)
    expect(result.valid).toBe(true)
  })

  it('rejects a start date the century before the minimum, even with a valid end date', () => {
    const result = validateTripDates('1999-12-31', '2000-01-01')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Start date/)
  })

  it('is order-independent for which side is "start" vs "end" when both are unset', () => {
    expect(validateTripDates('', null)).toEqual({ valid: true, error: null })
    expect(validateTripDates(null, '')).toEqual({ valid: true, error: null })
  })
})

describe('validateDateInRange', () => {
  it('treats an unset date as valid', () => {
    expect(validateDateInRange(null)).toEqual({ valid: true, error: null })
    expect(validateDateInRange('')).toEqual({ valid: true, error: null })
  })

  it('accepts a date within range', () => {
    expect(validateDateInRange('2026-09-10')).toEqual({ valid: true, error: null })
  })

  it('rejects a wildly far-future year typo, using the given label', () => {
    const result = validateDateInRange('9999-01-01', 'Expense date')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Expense date must be between/)
  })

  it('rejects an absurdly low year', () => {
    const result = validateDateInRange('0005-05-05', 'Date')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Date must be between/)
  })

  it('defaults the label to "Date" when none is given', () => {
    const result = validateDateInRange('9999-01-01')
    expect(result.error).toMatch(/^Date must be between/)
  })
})
