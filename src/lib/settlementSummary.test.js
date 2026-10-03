import { describe, expect, it } from 'vitest'
import { buildSettlementSummary, summaryNames } from './settlementSummary'
import { shareOrCopy } from './shareText'

const NOW = new Date('2026-10-03T12:00:00Z')
const members = [
  { user_id: 'a', display_name: 'Arjun' },
  { user_id: 'm', display_name: 'Maya' },
  { user_id: 'p', display_name: 'Priya' },
]
// Plain "<amount> <currency>" so the tests do not depend on the machine's locale.
const plain = (amount, currency) => `${Number(amount).toFixed(currency === 'JPY' ? 0 : 2)} ${currency}`

describe('buildSettlementSummary', () => {
  it('lists who pays whom, in words, with the date, currency and a footer', () => {
    const text = buildSettlementSummary({
      tripName: 'Tokyo Week',
      homeCurrency: 'USD',
      transactions: [
        { from: 'a', to: 'm', amount: 12.5 },
        { from: 'p', to: 'm', amount: 6.2 },
      ],
      members,
      now: NOW,
      appUrl: 'https://splitexpenses-app.vercel.app',
      format: plain,
    })
    expect(text.split('\n')).toEqual([
      'Tokyo Week — who pays whom (as of 3 Oct 2026)',
      'Arjun pays Maya 12.50 USD',
      'Priya pays Maya 6.20 USD',
      'Amounts in USD.',
      'via Split Expenses · https://splitexpenses-app.vercel.app',
    ])
  })

  it('formats a zero-decimal currency without decimals (JPY) using the real formatter', () => {
    const text = buildSettlementSummary({
      tripName: 'Tokyo',
      homeCurrency: 'JPY',
      transactions: [{ from: 'a', to: 'm', amount: 12400 }],
      members,
      now: NOW,
    })
    expect(text).toContain('Arjun pays Maya')
    expect(text).toMatch(/12,400/)
    expect(text).not.toMatch(/12,400\.00/)
    expect(text).toContain('Amounts in JPY.')
  })

  it('says everyone is settled up when there is nothing to pay', () => {
    const text = buildSettlementSummary({ tripName: 'Goa', homeCurrency: 'INR', transactions: [], members, now: NOW, appUrl: 'https://x.test' })
    expect(text).toBe("Goa — everyone's settled up (as of 3 Oct 2026)\nvia Split Expenses · https://x.test")
    expect(text).not.toContain('pays')
  })

  it('one person owing several people gets one line per payment', () => {
    const text = buildSettlementSummary({
      tripName: 'Trip',
      homeCurrency: 'USD',
      transactions: [
        { from: 'a', to: 'm', amount: 10 },
        { from: 'a', to: 'p', amount: 5 },
      ],
      members,
      now: NOW,
      format: plain,
    })
    const lines = text.split('\n')
    expect(lines.filter((l) => l.startsWith('Arjun pays'))).toEqual(['Arjun pays Maya 10.00 USD', 'Arjun pays Priya 5.00 USD'])
  })

  it('tells two people with the same name apart, the same way on every line', () => {
    const dupes = [
      { user_id: 'p1', display_name: 'Priya' },
      { user_id: 'p2', display_name: 'priya ' },
      { user_id: 'm', display_name: 'Maya' },
    ]
    const text = buildSettlementSummary({
      tripName: 'Trip',
      homeCurrency: 'USD',
      transactions: [
        { from: 'p1', to: 'm', amount: 4 },
        { from: 'p2', to: 'm', amount: 6 },
        { from: 'm', to: 'p1', amount: 1 },
      ],
      members: dupes,
      now: NOW,
      format: plain,
    })
    expect(text).toContain('Priya (1) pays Maya 4.00 USD')
    expect(text).toContain('priya (2) pays Maya 6.00 USD')
    expect(text).toContain('Maya pays Priya (1) 1.00 USD')
    expect(summaryNames(dupes).get('m')).toBe('Maya')
  })

  it('shortens a very long trip name and keeps the lines readable', () => {
    const text = buildSettlementSummary({
      tripName: 'A'.repeat(200),
      homeCurrency: 'USD',
      transactions: [{ from: 'a', to: 'm', amount: 1 }],
      members,
      now: NOW,
      format: plain,
    })
    const title = text.split('\n')[0]
    expect(title.length).toBeLessThan(110)
    expect(title).toContain('…')
    expect(title).toContain('who pays whom')
  })

  it('shows "Former member" for someone who has left, and never says "You"', () => {
    const text = buildSettlementSummary({
      tripName: 'Trip',
      homeCurrency: 'USD',
      transactions: [{ from: 'gone', to: 'm', amount: 3 }],
      members,
      now: NOW,
      format: plain,
    })
    expect(text).toContain('Former member pays Maya 3.00 USD')
    expect(text).not.toMatch(/\bYou\b/)
  })

  it('never carries an invite code, a trip link or a payment link', () => {
    const text = buildSettlementSummary({
      tripName: 'Trip',
      homeCurrency: 'USD',
      transactions: [{ from: 'a', to: 'm', amount: 3 }],
      members,
      now: NOW,
      appUrl: 'https://splitexpenses-app.vercel.app',
      format: plain,
    })
    expect(text).not.toMatch(/\/join\/|\/trips\/|upi:|venmo|paypal|invite/i)
  })

  it('leaves the address out of the footer when there is none', () => {
    const text = buildSettlementSummary({ tripName: 'T', homeCurrency: 'USD', transactions: [], members, now: NOW, appUrl: '' })
    expect(text.split('\n').pop()).toBe('via Split Expenses')
  })

  it('falls back to "Trip" when the trip has no name', () => {
    expect(buildSettlementSummary({ tripName: '  ', homeCurrency: 'USD', transactions: [], members, now: NOW }).startsWith('Trip —')).toBe(true)
  })
})

describe('shareOrCopy', () => {
  const content = { title: 'T', text: 'hello' }

  it('uses the share sheet when there is one', async () => {
    const calls = []
    const nav = { share: async (x) => calls.push(x), clipboard: { writeText: async () => { throw new Error('not used') } } }
    expect(await shareOrCopy(content, nav)).toBe('shared')
    expect(calls).toEqual([content])
  })

  it('treats a closed share sheet as a non-error and does not copy', async () => {
    let copied = false
    const nav = {
      share: async () => { throw Object.assign(new Error('closed'), { name: 'AbortError' }) },
      clipboard: { writeText: async () => { copied = true } },
    }
    expect(await shareOrCopy(content, nav)).toBe('cancelled')
    expect(copied).toBe(false)
  })

  it('copies to the clipboard when there is no share sheet', async () => {
    let copied = ''
    const nav = { clipboard: { writeText: async (t) => { copied = t } } }
    expect(await shareOrCopy(content, nav)).toBe('copied')
    expect(copied).toBe('hello')
  })

  it('falls back to the clipboard when sharing fails for another reason', async () => {
    let copied = ''
    const nav = {
      share: async () => { throw Object.assign(new Error('nope'), { name: 'NotAllowedError' }) },
      clipboard: { writeText: async (t) => { copied = t } },
    }
    expect(await shareOrCopy(content, nav)).toBe('copied')
    expect(copied).toBe('hello')
  })

  it('reports failure when neither works', async () => {
    expect(await shareOrCopy(content, { clipboard: { writeText: async () => { throw new Error('blocked') } } })).toBe('failed')
    expect(await shareOrCopy(content, {})).toBe('failed')
    expect(await shareOrCopy(content, undefined)).toBe('failed')
  })
})
