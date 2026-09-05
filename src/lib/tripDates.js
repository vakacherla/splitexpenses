// Trip dates are both optional and independent — a group can have just a
// start, just an end, both, or neither. The one rule that actually matters:
// once both are set, the trip can't end before it begins. A same-day trip
// (start === end) is valid.
export function validateTripDates(startDate, endDate) {
  if (!startDate || !endDate) return { valid: true, error: null }
  if (endDate < startDate) {
    return { valid: false, error: 'End date is before the start date.' }
  }
  return { valid: true, error: null }
}
