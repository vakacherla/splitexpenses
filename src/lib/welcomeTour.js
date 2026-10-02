// First-time welcome tour for the dashboard: what a Trip is, what a Circle
// is, and which one to start with. Shown once to brand-new accounts (no
// trips, no circles) and replayable from Help.

export const WELCOME_CARDS = [
  {
    id: 'welcome',
    title: 'Welcome to Split Expenses, {name}',
    body: "Split costs with friends, family or roommates, in any currency. Nobody needs to do the math or chase anyone. This takes 30 seconds.",
  },
  {
    id: 'trip',
    title: 'A Trip is where expenses live',
    body: 'One trip per outing or shared household: "Goa weekend", "Flat 4B". Add expenses, see who owes whom, and settle up.',
    highlight: 'Not sure where to start? Start with a Trip.',
  },
  {
    id: 'circle',
    title: 'A Circle is for groups that travel again and again',
    body: 'Roommates, a yearly trip crew, a family. Join once, then spin up new trips inside it, with no new invite code each time.',
    highlight: "You can add a trip to a Circle later, so you don't have to decide now.",
  },
  {
    id: 'start',
    title: 'Invite people, then add your first expense',
    body: 'After creating a trip, share its 6-digit code. Then type something like "lunch 24.50 split with Priya and Tom" and we\'ll fill it in for you.',
  },
]

export function welcomeTitle(card, firstName) {
  return card.title.replace('{name}', firstName || 'there')
}

const KEY_PREFIX = 'welcome_tour_dismissed_v1:'

// localStorage can be unavailable (private mode, blocked): treat that as
// "not dismissed" and never throw.
export function isWelcomeDismissed(userId) {
  try {
    return localStorage.getItem(KEY_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

export function dismissWelcome(userId) {
  try {
    localStorage.setItem(KEY_PREFIX + userId, '1')
  } catch {
    // nothing to do: the tour just reappears next visit
  }
}

// "Show this tour every time I open the app": a per-user choice made on the
// tour itself, so people don't have to find it in Help.
const ALWAYS_PREFIX = 'welcome_tour_always_v1:'

export function isWelcomeAlways(userId) {
  try {
    return localStorage.getItem(ALWAYS_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

export function setWelcomeAlways(userId, on) {
  try {
    if (on) localStorage.setItem(ALWAYS_PREFIX + userId, '1')
    else localStorage.removeItem(ALWAYS_PREFIX + userId)
  } catch {
    // ignore: the choice just won't stick
  }
}

export function resetWelcome(userId) {
  try {
    localStorage.removeItem(KEY_PREFIX + userId)
  } catch {
    // ignore
  }
}

// Brand-new accounts (nothing created or joined yet) who haven't dismissed
// it see the tour; `forced` (a replay, or the person chose "show every
// time") shows it to anyone. `groups` / `circles` are null while loading.
export function shouldShowWelcome({ groups, circles, dismissed, forced }) {
  if (groups === null || circles === null) return false
  if (forced) return true
  return groups.length === 0 && circles.length === 0 && !dismissed
}
