import { describe, expect, it } from 'vitest'
import {
  buildInviteUrl,
  canNativeShare,
  clearPendingInvite,
  getPendingInvite,
  inviteProblem,
  joinPath,
  mailtoUrl,
  parseInviteInput,
  postAuthPath,
  publicAppUrl,
  setPendingInvite,
  shareMessage,
  shareSubject,
  targetPath,
  whatsappUrl,
} from './invite'

const TOKEN = '0123456789abcdef0123456789abcdef'

function fakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v },
    removeItem: (k) => { delete data[k] },
    data,
  }
}

describe('publicAppUrl and buildInviteUrl', () => {
  it('uses the configured address, trimmed, else the current origin', () => {
    expect(publicAppUrl({ VITE_PUBLIC_APP_URL: 'https://splitexpenses.example/' }, { origin: 'https://x.test' })).toBe('https://splitexpenses.example')
    expect(publicAppUrl({}, { origin: 'https://x.test' })).toBe('https://x.test')
    expect(publicAppUrl({ VITE_PUBLIC_APP_URL: '  ' }, { origin: 'https://x.test' })).toBe('https://x.test')
    expect(publicAppUrl({}, undefined)).toBe('')
  })
  it('joins base and token without doubled slashes', () => {
    expect(buildInviteUrl('https://a.test/', TOKEN)).toBe(`https://a.test/join/${TOKEN}`)
    expect(buildInviteUrl('https://a.test', TOKEN)).toBe(`https://a.test/join/${TOKEN}`)
  })
})

describe('parseInviteInput', () => {
  it('finds a link, even inside a pasted chat message', () => {
    expect(parseInviteInput(`https://a.test/join/${TOKEN}`)).toEqual({ type: 'link', token: TOKEN })
    expect(parseInviteInput(`Hi! ✈️ I've set up it. Tap to join 👉 https://a.test/join/${TOKEN} see you`)).toEqual({ type: 'link', token: TOKEN })
    expect(parseInviteInput(`  https://a.test/join/${TOKEN}?utm=1  `)).toEqual({ type: 'link', token: TOKEN })
  })
  it('accepts a bare token', () => {
    expect(parseInviteInput(TOKEN)).toEqual({ type: 'link', token: TOKEN })
  })
  it('treats a six-letter code as a code, uppercased', () => {
    expect(parseInviteInput('7kq4mx')).toEqual({ type: 'code', code: '7KQ4MX' })
    expect(parseInviteInput(' AB12CD ')).toEqual({ type: 'code', code: 'AB12CD' })
  })
  it('passes anything else through as a code, so the database can say it does not match', () => {
    expect(parseInviteInput('not a code!')).toEqual({ type: 'code', code: 'not a code!' })
  })
  it('returns null for nothing', () => {
    expect(parseInviteInput('')).toBeNull()
    expect(parseInviteInput('   ')).toBeNull()
    expect(parseInviteInput(null)).toBeNull()
  })
  it('does not mistake a join path with a short id for a link', () => {
    expect(parseInviteInput('https://a.test/join/abc')).toEqual({ type: 'code', code: 'https://a.test/join/abc' })
  })
})

describe('the message that goes out', () => {
  it('names the trip, includes the link, and speaks as the inviter', () => {
    const m = shareMessage({ kind: 'trip', name: 'Goa weekend', url: `https://a.test/join/${TOKEN}` })
    expect(m).toContain('“Goa weekend”')
    expect(m).toContain(`https://a.test/join/${TOKEN}`)
    expect(m.startsWith('Hi!')).toBe(true)
    expect(m).toContain('✈️')
  })
  it('has a circle version', () => {
    const m = shareMessage({ kind: 'circle', name: 'Smith Family', url: 'https://a.test/join/x' })
    expect(m).toContain('the circle “Smith Family”')
    expect(m).toContain('🏡')
  })
  it('never contains the private "who is this for" name, even if one is passed in', () => {
    const m = shareMessage({ kind: 'trip', name: 'Goa weekend', url: 'https://a.test/join/x', label: 'Priya', email: 'priya@example.com' })
    expect(m).not.toContain('Priya')
    expect(m).not.toContain('priya@')
  })
  it('has a subject for email', () => {
    expect(shareSubject('Goa weekend')).toBe('Join Goa weekend on Split Expenses')
  })
})

describe('share links', () => {
  it('builds a WhatsApp link with the text encoded', () => {
    const u = whatsappUrl('Hi! 👉 https://a.test/join/x?y=1&z=2')
    expect(u.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(u.split('text=')[1])).toBe('Hi! 👉 https://a.test/join/x?y=1&z=2')
  })
  it('builds a mailto link with subject and body encoded', () => {
    const u = mailtoUrl('Join Goa & friends', 'Line one\nLine two')
    expect(u.startsWith('mailto:?subject=')).toBe(true)
    expect(u).toContain('Join%20Goa%20%26%20friends')
    expect(u).toContain('body=Line%20one%0ALine%20two')
  })
  it('detects the phone share sheet', () => {
    expect(canNativeShare({ share: () => {} })).toBe(true)
    expect(canNativeShare({})).toBe(false)
    expect(canNativeShare(undefined)).toBe(false)
  })
})

describe('remembering an invite through sign-up', () => {
  it('stores, reads and clears the token', () => {
    const s = fakeStorage()
    expect(getPendingInvite(s)).toBeNull()
    setPendingInvite(s, TOKEN, 1000)
    expect(getPendingInvite(s, 2000)).toBe(TOKEN)
    clearPendingInvite(s)
    expect(getPendingInvite(s, 2000)).toBeNull()
  })
  it('forgets it after 14 days', () => {
    const s = fakeStorage()
    setPendingInvite(s, TOKEN, 0)
    const day = 24 * 60 * 60 * 1000
    expect(getPendingInvite(s, 13 * day)).toBe(TOKEN)
    expect(getPendingInvite(s, 15 * day)).toBeNull()
    expect(s.data.ledger_pending_invite).toBeUndefined()
  })
  it('ignores corrupt or hostile stored values', () => {
    expect(getPendingInvite(fakeStorage({ ledger_pending_invite: 'not json' }))).toBeNull()
    expect(getPendingInvite(fakeStorage({ ledger_pending_invite: JSON.stringify({ token: '../../etc', at: Date.now() }) }))).toBeNull()
    expect(getPendingInvite(fakeStorage({ ledger_pending_invite: JSON.stringify({ token: TOKEN }) }))).toBeNull()
  })
  it('survives storage that throws or is missing', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    expect(() => setPendingInvite(broken, TOKEN)).not.toThrow()
    expect(getPendingInvite(broken)).toBeNull()
    expect(() => clearPendingInvite(broken)).not.toThrow()
    expect(getPendingInvite(undefined)).toBeNull()
  })
})

describe('postAuthPath', () => {
  it('prefers where the person was going', () => {
    const s = fakeStorage()
    setPendingInvite(s, TOKEN)
    expect(postAuthPath('/trips/abc', s)).toBe('/trips/abc')
  })
  it('then the invite they were part way through', () => {
    const s = fakeStorage()
    setPendingInvite(s, TOKEN)
    expect(postAuthPath(undefined, s)).toBe(`/join/${TOKEN}`)
  })
  it('then the dashboard', () => {
    expect(postAuthPath(undefined, fakeStorage())).toBe('/dashboard')
  })
})

describe('paths and problem messages', () => {
  it('builds paths', () => {
    expect(joinPath(TOKEN)).toBe(`/join/${TOKEN}`)
    expect(targetPath('trip', 'g1')).toBe('/trips/g1')
    expect(targetPath('circle', 'c1')).toBe('/circles/c1')
  })
  it('explains each failure and names the inviter when known', () => {
    for (const state of ['expired', 'revoked', 'full', 'removed', 'archived', 'not_found']) {
      const p = inviteProblem(state, 'Sunil')
      expect(p.title.length).toBeGreaterThan(5)
      expect(p.body.length).toBeGreaterThan(10)
    }
    expect(inviteProblem('expired', 'Sunil').body).toContain('Sunil')
    expect(inviteProblem('expired', '').body).toContain('the person who invited you')
    expect(inviteProblem('removed', 'Sunil', 'circle').title).toContain('circle')
    expect(inviteProblem('something-new', 'Sunil').title).toBe('This link is not valid')
  })
})
