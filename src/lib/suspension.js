// AU-04: what a suspended person sees, and how they reach the administrator.
//
// The administrator's address defaults to the one below; set
// VITE_ADMIN_CONTACT_EMAIL (in .env and the hosting provider's environment
// variables) to override it. It is a fixed address on purpose: a suspended
// person can no longer read any data, so the app could not look up a trip or
// circle admin for them, and platform admins are the ones who suspend.

export const DEFAULT_ADMIN_CONTACT_EMAIL = 'admin@splitexpense.com'
export const ADMIN_CONTACT_EMAIL = (import.meta.env?.VITE_ADMIN_CONTACT_EMAIL ?? '').trim() || DEFAULT_ADMIN_CONTACT_EMAIL

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
