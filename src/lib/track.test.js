import { describe, expect, it, vi } from 'vitest'
import {
  FLUSH_MS,
  MAX_BATCH,
  createTracker,
  heartbeatDue,
  routePattern,
  takeAppOpen,
} from './track'

function harness(overrides = {}) {
  const sent = []
  const timers = []
  const tracker = createTracker({
    send: vi.fn((events, session) => {
      sent.push({ events, session })
      return Promise.resolve({ data: events.length })
    }),
    getSessionId: () => 'sess-1',
    setTimer: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimer: (id) => {
      if (timers[id - 1]) timers[id - 1].cancelled = true
    },
    ...overrides,
  })
  const fire = () => timers.filter((t) => !t.cancelled && !t.fired).forEach((t) => ((t.fired = true), t.fn()))
  return { tracker, sent, timers, fire }
}

describe('createTracker', () => {
  it('sends nothing until tracking is enabled', async () => {
    const { tracker, sent, fire } = harness()
    tracker.track('app_open')
    fire()
    await tracker.flush()
    expect(sent).toHaveLength(0)
    expect(tracker.pending).toBe(0)
  })

  it('batches events and sends them together on the flush timer', async () => {
    const { tracker, sent, timers, fire } = harness()
    tracker.setEnabled(true)
    tracker.track('app_open', { os: 'ios' })
    tracker.track('page_view', { route: '/dashboard' })
    expect(sent).toHaveLength(0)
    expect(timers[0].ms).toBe(FLUSH_MS)
    fire()
    await Promise.resolve()
    expect(sent).toHaveLength(1)
    expect(sent[0].session).toBe('sess-1')
    expect(sent[0].events).toEqual([
      { name: 'app_open', props: { os: 'ios' } },
      { name: 'page_view', props: { route: '/dashboard' } },
    ])
  })

  it('flushes immediately once a full batch is waiting', () => {
    const { tracker, sent } = harness()
    tracker.setEnabled(true)
    for (let i = 0; i < MAX_BATCH; i++) tracker.track('page_view')
    expect(sent).toHaveLength(1)
    expect(sent[0].events).toHaveLength(MAX_BATCH)
  })

  it('flushes on demand, for example when the page is hidden', async () => {
    const { tracker, sent } = harness()
    tracker.setEnabled(true)
    tracker.track('app_open')
    await tracker.flush()
    expect(sent).toHaveLength(1)
  })

  it('drops events instead of queueing them while offline', async () => {
    const { tracker, sent } = harness({ isOnline: () => false })
    tracker.setEnabled(true)
    tracker.track('app_open')
    await tracker.flush()
    expect(sent).toHaveLength(0)
    expect(tracker.pending).toBe(0)
  })

  it('clears anything waiting when tracking is switched off', async () => {
    const { tracker, sent } = harness()
    tracker.setEnabled(true)
    tracker.track('app_open')
    tracker.setEnabled(false)
    await tracker.flush()
    expect(sent).toHaveLength(0)
    expect(tracker.pending).toBe(0)
  })

  it('never throws or rejects when sending fails', async () => {
    const rejecting = harness({ send: () => Promise.reject(new Error('network')) })
    rejecting.tracker.setEnabled(true)
    rejecting.tracker.track('app_open')
    await expect(rejecting.tracker.flush()).resolves.toBeUndefined()

    const throwing = harness({ send: () => { throw new Error('boom') } })
    throwing.tracker.setEnabled(true)
    throwing.tracker.track('app_open')
    await expect(throwing.tracker.flush()).resolves.toBeUndefined()
  })

  it('never holds more than one batch, because a full batch flushes at once', () => {
    const { tracker } = harness({ send: () => new Promise(() => {}) })
    tracker.setEnabled(true)
    for (let i = 0; i < MAX_BATCH * 3 + 4; i++) tracker.track('page_view')
    expect(tracker.pending).toBe(4)
  })

  it('ignores a non-string event name', () => {
    const { tracker } = harness()
    tracker.setEnabled(true)
    tracker.track(undefined)
    tracker.track(42)
    expect(tracker.pending).toBe(0)
  })

  it('omits props when none are given', async () => {
    const { tracker, sent } = harness()
    tracker.setEnabled(true)
    tracker.track('app_open')
    await tracker.flush()
    expect(sent[0].events).toEqual([{ name: 'app_open' }])
  })
})

describe('routePattern', () => {
  it('keeps known static routes', () => {
    expect(routePattern('/dashboard')).toBe('/dashboard')
    expect(routePattern('/')).toBe('/')
    expect(routePattern('/rates')).toBe('/rates')
  })

  it('replaces ids so they never leave the browser', () => {
    expect(routePattern('/trips/3f0c8a52-1d2e-4c0b-9d7a-0123456789ab')).toBe('/trips/:id')
    expect(routePattern('/groups/abc')).toBe('/trips/:id')
    expect(routePattern('/circles/xyz123')).toBe('/circles/:id')
    expect(routePattern('/join/0123456789abcdef0123456789abcdef')).toBe('/join/:token')
  })

  it('ignores query, hash and a trailing slash', () => {
    expect(routePattern('/trips/abc?tab=reports#top')).toBe('/trips/:id')
    expect(routePattern('/dashboard/')).toBe('/dashboard')
  })

  it('sends unknown paths as /other, never as typed', () => {
    expect(routePattern('/some/secret/Path')).toBe('/other')
    expect(routePattern('/trips/abc/extra')).toBe('/other')
    expect(routePattern(undefined)).toBe('/')
  })

  it('only produces patterns the database accepts', () => {
    const accepted = /^\/[a-z0-9/:_-]*$/
    for (const p of ['/', '/trips/abc', '/circles/x', '/weird PATH', '/admin']) {
      expect(routePattern(p)).toMatch(accepted)
    }
  })
})

describe('heartbeatDue', () => {
  it('is due on the first call when the tab is visible', () => {
    expect(heartbeatDue({ now: 1000, last: null, visible: true })).toBe(true)
  })
  it('is never due while the tab is hidden', () => {
    expect(heartbeatDue({ now: 1e9, last: null, visible: false })).toBe(false)
  })
  it('waits out the interval', () => {
    expect(heartbeatDue({ now: 100_000, last: 50_000, visible: true, minMs: 120_000 })).toBe(false)
    expect(heartbeatDue({ now: 170_000, last: 50_000, visible: true, minMs: 120_000 })).toBe(true)
  })
})

describe('takeAppOpen', () => {
  function fakeStorage() {
    const data = {}
    return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v } }
  }
  it('is true once per session', () => {
    const s = fakeStorage()
    expect(takeAppOpen(s)).toBe(true)
    expect(takeAppOpen(s)).toBe(false)
  })
  it('is true again in a new session', () => {
    expect(takeAppOpen(fakeStorage())).toBe(true)
    expect(takeAppOpen(fakeStorage())).toBe(true)
  })
})
