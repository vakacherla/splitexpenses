import { describe, it, expect, beforeEach } from 'vitest'
import {
  WELCOME_CARDS,
  welcomeTitle,
  shouldShowWelcome,
  isWelcomeDismissed,
  dismissWelcome,
  resetWelcome,
} from './welcomeTour'

describe('welcome cards', () => {
  it('has four cards with unique ids and a Trip-first default', () => {
    expect(WELCOME_CARDS).toHaveLength(4)
    expect(new Set(WELCOME_CARDS.map((c) => c.id)).size).toBe(4)
    expect(WELCOME_CARDS.find((c) => c.id === 'trip').highlight).toMatch(/start with a Trip/i)
  })

  it('personalises the first title and falls back to "there"', () => {
    expect(welcomeTitle(WELCOME_CARDS[0], 'Priya')).toBe('Welcome to Split Expenses, Priya')
    expect(welcomeTitle(WELCOME_CARDS[0], '')).toBe('Welcome to Split Expenses, there')
    expect(welcomeTitle(WELCOME_CARDS[1], 'Priya')).toBe(WELCOME_CARDS[1].title)
  })
})

describe('shouldShowWelcome', () => {
  const base = { groups: [], circles: [], dismissed: false, forced: false }

  it('shows to a brand-new account', () => {
    expect(shouldShowWelcome(base)).toBe(true)
  })

  it('waits until trips and circles have loaded', () => {
    expect(shouldShowWelcome({ ...base, groups: null })).toBe(false)
    expect(shouldShowWelcome({ ...base, circles: null })).toBe(false)
  })

  it('never shows to someone who already has a trip or a circle', () => {
    expect(shouldShowWelcome({ ...base, groups: [{ id: 1 }] })).toBe(false)
    expect(shouldShowWelcome({ ...base, circles: [{ id: 1 }] })).toBe(false)
  })

  it('stays hidden once dismissed', () => {
    expect(shouldShowWelcome({ ...base, dismissed: true })).toBe(false)
  })

  it('a replay shows it to anyone, once loaded', () => {
    expect(shouldShowWelcome({ groups: [{ id: 1 }], circles: [], dismissed: true, forced: true })).toBe(true)
    expect(shouldShowWelcome({ groups: null, circles: [], dismissed: false, forced: true })).toBe(false)
  })
})

describe('dismissal storage', () => {
  beforeEach(() => localStorage.clear())

  it('remembers a dismissal per user and can be reset', () => {
    expect(isWelcomeDismissed('u1')).toBe(false)
    dismissWelcome('u1')
    expect(isWelcomeDismissed('u1')).toBe(true)
    expect(isWelcomeDismissed('u2')).toBe(false)
    resetWelcome('u1')
    expect(isWelcomeDismissed('u1')).toBe(false)
  })
})
