// AU-04: what a suspended person sees, and how they reach the administrator.
//
// The administrator's address comes from VITE_ADMIN_CONTACT_EMAIL (set it in
// .env and in the hosting provider's environment variables). Without it the
// suspended screen still explains what happened, just without an email link.

export const ADMIN_CONTACT_EMAIL = (import.meta.env?.VITE_ADMIN_CONTACT_EMAIL ?? '').trim()

// Builds a mailto: link that opens the person's own email app with the
// subject and the account they are writing about already filled in.
export function adminMailtoLink(accountEmail, adminEmail = ADMIN_CONTACT_EMAIL) {
  if (!adminEmail) return null
  const subject = 'My Split Expenses account is suspended'
  const body = [
    'Hello,',
    '',
    'My Split Expenses account has been suspended and I would like to know why.',
    accountEmail ? `Account: ${accountEmail}` : null,
    '',
    'Thank you.',
  ]
    .filter((line) => line !== null)
    .join('\n')
  return `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// Supabase Auth calls this a "ban" ("User is banned"); the app only ever says
// "suspended".
export function isBannedAuthError(error) {
  return /banned/i.test(error?.message ?? '')
}

export const SUSPENDED_MESSAGE =
  'Your account has been suspended by the administrator, so you cannot sign in right now.'
