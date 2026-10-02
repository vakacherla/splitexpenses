// Main navigation: one list drives both the top bar (desktop) and the bottom
// tab bar (phones), so they can never disagree about where things are.

export const NAV_ITEMS = [
  { id: 'trips', label: 'Trips', to: '/dashboard' },
  { id: 'circles', label: 'Circles', to: '/dashboard?view=circles' },
  { id: 'rates', label: 'Rates', to: '/rates' },
  { id: 'help', label: 'Help', to: '/help' },
  { id: 'profile', label: 'Profile', to: '/profile' },
]

// Which dashboard view is showing: "trips" (default) or "circles".
export function dashboardView(search) {
  return new URLSearchParams(search).get('view') === 'circles' ? 'circles' : 'trips'
}

// Which top-level section a URL belongs to. Trip pages count as "Trips" and
// circle pages as "Circles", so the menu keeps showing where you are while
// you are inside one. Pages with no menu entry (admin) return null.
export function activeNavId(pathname, search = '') {
  if (pathname === '/dashboard') return dashboardView(search) === 'circles' ? 'circles' : 'trips'
  if (pathname.startsWith('/trips/') || pathname.startsWith('/groups/')) return 'trips'
  if (pathname.startsWith('/circles/')) return 'circles'
  if (pathname.startsWith('/rates')) return 'rates'
  if (pathname.startsWith('/help')) return 'help'
  if (pathname.startsWith('/profile')) return 'profile'
  return null
}

// Breadcrumb trails. The last crumb is the current page (no link).
export function tripCrumbs({ tripName, circleId, circleName }) {
  if (circleId && circleName) {
    return [
      { label: 'Circles', to: '/dashboard?view=circles' },
      { label: circleName, to: `/circles/${circleId}` },
      { label: tripName },
    ]
  }
  return [{ label: 'Trips', to: '/dashboard' }, { label: tripName }]
}

export function circleCrumbs({ circleName }) {
  return [{ label: 'Circles', to: '/dashboard?view=circles' }, { label: circleName }]
}
