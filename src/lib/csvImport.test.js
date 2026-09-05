import { describe, it, expect } from 'vitest'
import { parseCSV, validateImportRows, buildImportTemplate, IMPORT_HEADER, MAX_IMPORT_ROWS } from './csvImport'

const MEMBERS = [
  { user_id: 'u1', email: 'a@example.com' },
  { user_id: 'u2', email: 'b@example.com' },
]
const CATEGORIES = ['Food', 'Lodging', 'Misc']
const CURRENCIES = new Set(['USD', 'INR'])

describe('parseCSV', () => {
  it('parses plain comma-separated rows', () => {
    const text = 'Date,Description\n2026-01-01,Lunch\n2026-01-02,Dinner'
    expect(parseCSV(text)).toEqual([
      ['Date', 'Description'],
      ['2026-01-01', 'Lunch'],
      ['2026-01-02', 'Dinner'],
    ])
  })

  it('round-trips a quoted field containing a comma', () => {
    const text = 'Date,Note\n2026-01-01,"Coffee, tea, and snacks"'
    expect(parseCSV(text)).toEqual([
      ['Date', 'Note'],
      ['2026-01-01', 'Coffee, tea, and snacks'],
    ])
  })

  it('round-trips a quoted field containing an embedded newline', () => {
    const text = 'Date,Note\n2026-01-01,"line one\nline two"'
    expect(parseCSV(text)).toEqual([
      ['Date', 'Note'],
      ['2026-01-01', 'line one\nline two'],
    ])
  })

  it('round-trips a quoted field with doubled internal quotes', () => {
    const text = 'Date,Note\n2026-01-01,"She said ""hi"""'
    expect(parseCSV(text)).toEqual([
      ['Date', 'Note'],
      ['2026-01-01', 'She said "hi"'],
    ])
  })

  it('handles a file with no trailing newline', () => {
    const text = 'Date,Note\n2026-01-01,ok'
    expect(parseCSV(text)).toEqual([
      ['Date', 'Note'],
      ['2026-01-01', 'ok'],
    ])
  })
})

describe('buildImportTemplate', () => {
  it('produces a header matching IMPORT_HEADER plus one example row', () => {
    const parsed = parseCSV(buildImportTemplate())
    expect(parsed[0]).toEqual(IMPORT_HEADER)
    expect(parsed.length).toBe(2)
  })
})

function validRow() {
  return ['2026-01-15', 'Dinner', 'Food', 'a@example.com', '100', 'USD', 'a@example.com: 50; b@example.com: 50', '']
}

function validate(dataRows) {
  return validateImportRows([IMPORT_HEADER, ...dataRows], {
    members: MEMBERS,
    categories: CATEGORIES,
    currencies: CURRENCIES,
  })
}

describe('validateImportRows', () => {
  it('accepts a well-formed row', () => {
    const { hasErrors, rows } = validate([validRow()])
    expect(hasErrors).toBe(false)
    expect(rows[0].error).toBeNull()
    expect(rows[0].amount).toBe(100)
    expect(rows[0].currency).toBe('USD')
    expect(rows[0].paid_by).toBe('u1')
    expect(rows[0].splits).toEqual([
      { user_id: 'u1', email: 'a@example.com', share_amount: 50 },
      { user_id: 'u2', email: 'b@example.com', share_amount: 50 },
    ])
  })

  it('rejects a header that does not match the template', () => {
    const { hasErrors, rows } = validateImportRows([['Wrong', 'Header'], validRow()], {
      members: MEMBERS,
      categories: CATEGORIES,
      currencies: CURRENCIES,
    })
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/Header row/)
  })

  it('rejects an unknown payer email', () => {
    const row = validRow()
    row[3] = 'stranger@example.com'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/isn't a member/)
  })

  it('rejects an unknown category', () => {
    const row = validRow()
    row[2] = 'Nonsense'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/Unknown category/)
  })

  it('rejects an unsupported currency', () => {
    const row = validRow()
    row[5] = 'ZZZ'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/Unsupported currency/)
  })

  it('rejects a non-positive amount', () => {
    const row = validRow()
    row[4] = '0'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/Invalid amount/)
  })

  it('rejects a malformed date', () => {
    const row = validRow()
    row[0] = '15/01/2026'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/Invalid date/)
  })

  it('rejects when split amounts do not sum to the total', () => {
    const row = validRow()
    row[6] = 'a@example.com: 40; b@example.com: 40'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/don't add up/)
  })

  it('rejects a split naming someone outside the group', () => {
    const row = validRow()
    row[6] = 'a@example.com: 50; stranger@example.com: 50'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/isn't a member/)
  })

  it('is all-or-nothing: one bad row marks the whole file as having errors', () => {
    const good = validRow()
    const bad = validRow()
    bad[4] = '-5'
    const { hasErrors, rows } = validate([good, bad])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toBeNull()
    expect(rows[1].error).toMatch(/Invalid amount/)
  })

  it('rejects a file over the row limit without validating every row', () => {
    const tooMany = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => validRow())
    const { hasErrors, rows } = validate(tooMany)
    expect(hasErrors).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].error).toMatch(new RegExp(`limited to ${MAX_IMPORT_ROWS}`))
  })

  it('accepts a file exactly at the row limit', () => {
    const exactly = Array.from({ length: MAX_IMPORT_ROWS }, () => validRow())
    const { hasErrors, rows } = validate(exactly)
    expect(hasErrors).toBe(false)
    expect(rows).toHaveLength(MAX_IMPORT_ROWS)
  })
})
