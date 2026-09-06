// Trip dates are both optional and independent — a group can have just a
// start, just an end, both, or neither. Two rules matter: each date has to
// fall in a sane range (a native <input type="date"> happily accepts a
// typed year like "0005" or "0644" with no complaint), and once both are
// set, the trip can't end before it begins. A same-day trip (start ===
// end) is valid.
export const MIN_TRIP_YEAR = 2000
export const MAX_TRIP_YEAR = 2100
export const MIN_TRIP_DATE = `${MIN_TRIP_YEAR}-01-01`
export const MAX_TRIP_DATE = `${MAX_TRIP_YEAR}-12-31`

function yearOf(dateStr) {
  return Number(dateStr.slice(0, 4))
}

// Same year-range check trip dates need, generalized so any other single
// date field in the app (an expense's date, a CSV-imported date) can reuse
// the identical bound instead of a second copy of the same magic numbers.
export function validateDateInRange(dateStr, label = 'Date') {
  if (!dateStr) return { valid: true, error: null }
  const year = yearOf(dateStr)
  if (!Number.isFinite(year) || year < MIN_TRIP_YEAR || year > MAX_TRIP_YEAR) {
    return { valid: false, error: `${label} must be between ${MIN_TRIP_YEAR} and ${MAX_TRIP_YEAR}.` }
  }
  return { valid: true, error: null }
}

export function validateTripDates(startDate, endDate) {
  for (const [label, date] of [
    ['Start date', startDate],
    ['End date', endDate],
  ]) {
    const result = validateDateInRange(date, label)
    if (!result.valid) return result
  }
  if (startDate && endDate && endDate < startDate) {
    return { valid: false, error: 'End date is before the start date.' }
  }
  return { valid: true, error: null }
}
