// Pure decision logic for the password-recovery guard, pulled out of
// AuthContext/App so it can be unit tested without a React/DOM harness.

// Supabase fires PASSWORD_RECOVERY exactly once when a session is created
// from a "reset your password" email link, and SIGNED_OUT when the user
// signs out. Every other event (SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED,
// INITIAL_SESSION, MFA_CHALLENGE_VERIFIED, ...) must leave the flag alone —
// a normal token refresh on an unrelated tab, or the USER_UPDATED event
// fired by the recovery page's own `updateUser` call, must not silently
// flip it back on or off.
export function nextPasswordRecoveryState(event, current) {
  if (event === 'PASSWORD_RECOVERY') return true
  if (event === 'SIGNED_OUT') return false
  return current
}

// True when the current route needs to be overridden to force the user to
// /reset-password. Only fires while a recovery session is active and the
// user isn't already there — so it never redirect-loops on the reset page
// itself, and never fires at all for a normal (non-recovery) session.
export function shouldForceResetPassword(passwordRecovery, pathname) {
  return Boolean(passwordRecovery) && pathname !== '/reset-password'
}
