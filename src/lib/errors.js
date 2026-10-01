// Supabase/PostgREST error messages are written for developers, not the
// person using the app — "new row violates row-level security policy for
// table \"expenses\"" tells a user nothing except that something broke.
// This maps the handful of technical patterns actually seen in this app
// to plain language. Anything unrecognized falls through to the original
// message rather than hiding a problem we don't have a better explanation
// for — better an odd-sounding real error than a wrong friendly one.
export function friendlyError(error, fallback = 'Something went wrong — please try again.') {
  const message = error?.message ?? ''
  if (!message) return fallback

  if (/row-level security policy/i.test(message)) {
    return "You don't have permission to do that."
  }
  if (/violates foreign key constraint/i.test(message)) {
    return "That can't be completed right now — something it depends on may have just changed. Try refreshing and trying again."
  }
  if (/violates unique constraint/i.test(message)) {
    return 'That already exists.'
  }
  if (/^(Failed to fetch|Load failed|NetworkError)/i.test(message)) {
    return "Couldn't reach the server — check your connection and try again."
  }
  return message
}
