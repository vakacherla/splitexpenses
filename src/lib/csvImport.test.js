import { describe, it, expect } from 'vitest'
import { parseCSV, validateImportRows, buildImportTemplate, IMPORT_HEADER, MAX_IMPORT_ROWS } from './csvImport'
import { expensesToCSV } from './csvExport'

const MEMBERS = [
  { user_id: 'u1', email: 'a@example.com', display_name: 'Alice' },
  { user_id: 'u2', email: 'b@example.com', display_name: 'Bob' },
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

  // Regression test for the Excel/Sheets date-reformatting trap: those
  // apps auto-detect a bare date-looking cell and redisplay it in the
  // system locale, silently corrupting the example the moment a user
  // opens the downloaded file — the raw CSV text alone isn't enough
  // proof, the *parsed* example row has to actually validate clean.
  it('example row parses and validates with no errors', () => {
    const parsed = parseCSV(buildImportTemplate())
    const result = validateImportRows(parsed, {
      members: MEMBERS,
      categories: CATEGORIES,
      currencies: CURRENCIES,
    })
    expect(result.hasErrors).toBe(false)
    expect(result.rows[0].expense_date).toBe('2026-01-15')
  })
})

// CSV-01: exporting a trip and re-importing that exact file used to fail
// outright on a header mismatch (export and import were never meant to be
// the same file). The importer now recognizes the export's own shape too.
describe('validateImportRows — accepts the app\'s own export format', () => {
  const membersMap = { u1: { display_name: 'Alice' }, u2: { display_name: 'Bob' } }

  it('round-trips a real export: same expense, matched by name instead of email', () => {
    const expenses = [
      {
        expense_date: '2026-01-15',
        description: 'Dinner',
        category: 'Food',
        paid_by: 'u1',
        amount: 100,
        currency: 'USD',
        amount_in_home: 100,
        expense_splits: [
          { user_id: 'u1', share_amount: 50 },
          { user_id: 'u2', share_amount: 50 },
        ],
        note: null,
      },
    ]
    const csv = expensesToCSV(expenses, membersMap, 'USD')
    const parsed = parseCSV(csv)
    const result = validateImportRows(parsed, { members: MEMBERS, categories: CATEGORIES, currencies: CURRENCIES })
    expect(result.hasErrors).toBe(false)
    expect(result.rows[0].paid_by).toBe('u1')
    expect(result.rows[0].splits).toHaveLength(2)
  })

  it('rejects a name that matches more than one member in this group', () => {
    const dupeMembers = [
      { user_id: 'u1', email: 'a@example.com', display_name: 'Sam' },
      { user_id: 'u2', email: 'b@example.com', display_name: 'Sam' },
    ]
    const header = ['Date', 'Description', 'Category', 'Paid by', 'Amount', 'Currency', 'Amount (USD)', 'Split between', 'Note']
    const row = ['2026-01-15', 'Dinner', 'Food', 'Sam', '100', 'USD', '100', 'Sam: 100', '']
    const result = validateImportRows([header, row], { members: dupeMembers, categories: CATEGORIES, currencies: CURRENCIES })
    expect(result.hasErrors).toBe(true)
    expect(result.rows[0].error).toMatch(/matches more than one member/)
  })

  it('still rejects a name typo as "not a member" (not as an email-vs-name hint)', () => {
    const header = ['Date', 'Description', 'Category', 'Paid by', 'Amount', 'Currency', 'Amount (USD)', 'Split between', 'Note']
    const row = ['2026-01-15', 'Dinner', 'Food', 'Alicee', '100', 'USD', '100', 'Alicee: 100', '']
    const result = validateImportRows([header, row], { members: MEMBERS, categories: CATEGORIES, currencies: CURRENCIES })
    expect(result.hasErrors).toBe(true)
    expect(result.rows[0].error).toBe('"Alicee" isn\'t a member of this group')
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

  it('rejects a well-formed but implausible date (year out of range)', () => {
    const row = validRow()
    row[0] = '9999-01-01'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/Date must be between/)
  })

  it('rejects an amount above the plausibility ceiling', () => {
    const row = validRow()
    row[4] = '50000000'
    row[6] = 'a@example.com: 25000000; b@example.com: 25000000'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/can't be more than/)
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

describe('amount and line-ending edge cases', () => {
  it('rejects an amount with a thousands separator rather than misreading it (CSV-06)', () => {
    const row = validRow()
    row[4] = '1,234.56'
    const { hasErrors, rows } = validate([row])
    expect(hasErrors).toBe(true)
    expect(rows[0].error).toMatch(/Invalid amount/)
  })

  it('accepts the same amount written without the separator', () => {
    const row = validRow()
    row[4] = '1234.56'
    row[6] = 'a@example.com: 1234.56'
    const { rows } = validate([row])
    expect(rows[0].amount).toBe(1234.56)
  })

  it('parses CRLF line endings the same as LF (CSV-07)', () => {
    const lf = 'a,b\n1,2\n3,4\n'
    expect(parseCSV(lf.replace(/\n/g, '\r\n'))).toEqual(parseCSV(lf))
  })

  it('parses lone CR line endings the same as LF', () => {
    const lf = 'a,b\n1,2\n'
    expect(parseCSV(lf.replace(/\n/g, '\r'))).toEqual(parseCSV(lf))
  })

  it('does not strip a literal BOM itself: the browser decoder in ImportCsvModal does', () => {
    expect(parseCSV('\uFEFFa,b\n1,2')[0][0]).toBe('\uFEFFa')
  })
})
