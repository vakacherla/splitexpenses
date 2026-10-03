// Per-invite links (REQ-INV-01): the pure logic behind sharing and joining.
// No network and no React here, so it is tested on its own.

export const INVITE_TTL_DAYS = 14
export const INVITE_MAX_USES = 20

const PENDING_KEY = 'ledger_pending_invite'
const TOKEN_IN_TEXT = /\/join\/([A-Za-z0-9_-]{16,64})(?![A-Za-z0-9_-])/
const BARE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/
const CODE = /^[A-Za-z0-9]{6}$/

// The address links are built on. Set VITE_PUBLIC_APP_URL to the app's real
// address once it has one (links made earlier keep working because the old
// address redirects); until then it is whatever address the app is open on.
export function publicAppUrl(env = import.meta.env, location = typeof window === 'undefined' ? undefined : window.location) {
  const configured = String(env?.VITE_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')
  if (configured) return configured
  return location?.origin ?? ''
}

export function buildInviteUrl(base, token) {
  return `${String(base).replace(/\/+$/, '')}/join/${token}`
}

// People paste all sorts of things into "Join with a code": the six-letter code,
// a link, or a whole chat message that contains a link. Returns what it found.
export function parseInviteInput(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const inLink = raw.match(TOKEN_IN_TEXT)
  if (inLink) return { type: 'link', token: inLink[1] }
  if (BARE_TOKEN.test(raw) && raw.length >= 20) return { type: 'link', token: raw }
  if (CODE.test(raw)) return { type: 'code', code: raw.toUpperCase() }
  return { type: 'code', code: raw }
}

// The message that goes out with the link. Written in the inviter's own voice,
// because that is how it arrives. It never contains the "who is this for" name.
export function shareMessage({ kind, name, url }) {
  const where = kind === 'circle' ? `the circle “${name}”` : `“${name}”`
  const lead = kind === 'circle' ? 'Hi! 🏡' : 'Hi! ✈️'
  return `${lead} I've set up ${where} on Split Expenses so we can split costs in any currency and settle up easily. Tap to join 👉 ${url}`
}

export function shareSubject(name) {
  return `Join ${name} on Split Expenses`
}

export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function mailtoUrl(subject, body) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function canNativeShare(nav = typeof navigator === 'undefined' ? undefined : navigator) {
  return typeof nav?.share === 'function'
}

// --- Remembering an invite through sign-up -------------------------------

function days(n) {
  return n * 24 * 60 * 60 * 1000
}

export function setPendingInvite(storage, token, now = Date.now()) {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify({ token, at: now }))
  } catch {
    // storage blocked: the link in the address bar still carries the token
  }
}

export function getPendingInvite(storage, now = Date.now()) {
  try {
    const raw = storage?.getItem(PENDING_KEY)
    if (!raw) return null
    const { token, at } = JSON.parse(raw)
    if (typeof token !== 'string' || !BARE_TOKEN.test(token) || typeof at !== 'number' || now - at > days(INVITE_TTL_DAYS)) {
      storage.removeItem(PENDING_KEY)
      return null
    }
    return token
  } catch {
    return null
  }
}

export function clearPendingInvite(storage) {
  try {
    storage?.removeItem(PENDING_KEY)
  } catch {
    // nothing to clear
  }
}

// Where to go after signing in or signing up: back where the person was headed,
// or into the invite they were part way through, or the dashboard.
export function postAuthPath(from, storage, now = Date.now()) {
  if (from) return from
  const pending = getPendingInvite(storage, now)
  return pending ? `/join/${pending}` : '/dashboard'
}

export function joinPath(token) {
  return `/join/${token}`
}

export function targetPath(kind, id) {
  return kind === 'circle' ? `/circles/${id}` : `/trips/${id}`
}

// What to tell someone whose link cannot be used, by the state the database
// reports. `who` is the inviter's first name when we have it.
export function inviteProblem(state, who, kind = 'trip') {
  const person = who || 'the person who invited you'
  const thing = kind === 'circle' ? 'circle' : 'trip'
  switch (state) {
    case 'expired':
      return { title: 'This invite has expired', body: `Ask ${person} to send you a new one.` }
    case 'revoked':
      return { title: 'This invite is no longer active', body: `Ask ${person} to send you a new one.` }
    case 'full':
      return { title: 'This invite is full', body: `It has already been used by as many people as it allows. Ask ${person} for a new one.` }
    case 'removed':
      return { title: `You are no longer in this ${thing}`, body: `This link cannot be used again. Ask the person who runs the ${thing} if you should be back in.` }
    case 'archived':
      return { title: `This ${thing} has been archived`, body: `It is no longer taking new people. Ask ${person} if there is a new one.` }
    case 'not_found':
    default:
      return { title: 'This link is not valid', body: 'It may have been mistyped or cut short when it was copied. Ask for the link again.' }
  }
}
