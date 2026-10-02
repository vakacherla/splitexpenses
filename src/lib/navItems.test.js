import { describe, it, expect } from 'vitest'
import { NAV_ITEMS, activeNavId, dashboardView, tripCrumbs, circleCrumbs } from './navItems'

describe('dashboardView', () => {
  it('defaults to trips and only switches for view=circles', () => {
    expect(dashboardView('')).toBe('trips')
    expect(dashboardView('?view=circles')).toBe('circles')
    expect(dashboardView('?view=nonsense')).toBe('trips')
  })
})

describe('activeNavId', () => {
  it('maps the dashboard views', () => {
    expect(activeNavId('/dashboard')).toBe('trips')
    expect(activeNavId('/dashboard', '?view=circles')).toBe('circles')
  })

  it('keeps the section highlighted inside a trip or circle', () => {
    expect(activeNavId('/trips/abc')).toBe('trips')
    expect(activeNavId('/groups/abc')).toBe('trips')
    expect(activeNavId('/circles/abc')).toBe('circles')
  })

  it('maps the other top-level pages', () => {
    expect(activeNavId('/rates')).toBe('rates')
    expect(activeNavId('/help')).toBe('help')
    expect(activeNavId('/profile')).toBe('profile')
  })

  it('has no active item for pages without a menu entry', () => {
    expect(activeNavId('/admin')).toBeNull()
    expect(activeNavId('/login')).toBeNull()
  })

  it('every menu item can be reached as the active item', () => {
    const reached = new Set(
      NAV_ITEMS.map((i) => {
        const [path, query = ''] = i.to.split('?')
        return activeNavId(path, query ? `?${query}` : '')
      })
    )
    expect(reached).toEqual(new Set(NAV_ITEMS.map((i) => i.id)))
  })
})

describe('breadcrumbs', () => {
  it('a standalone trip hangs off Trips', () => {
    expect(tripCrumbs({ tripName: 'Goa' })).toEqual([{ label: 'Trips', to: '/dashboard' }, { label: 'Goa' }])
  })

  it('a trip in a circle goes Circles > circle > trip', () => {
    const crumbs = tripCrumbs({ tripName: 'Goa', circleId: 'c1', circleName: 'Crew' })
    expect(crumbs.map((c) => c.label)).toEqual(['Circles', 'Crew', 'Goa'])
    expect(crumbs[1].to).toBe('/circles/c1')
    expect(crumbs[2].to).toBeUndefined()
  })

  it('falls back to Trips if the circle name has not loaded yet', () => {
    expect(tripCrumbs({ tripName: 'Goa', circleId: 'c1', circleName: '' }).map((c) => c.label)).toEqual(['Trips', 'Goa'])
  })

  it('a circle page hangs off Circles', () => {
    expect(circleCrumbs({ circleName: 'Crew' }).map((c) => c.label)).toEqual(['Circles', 'Crew'])
  })
})
