// The import counterpart to csvExport.js. Deliberately strict per the
// roadmap: a bad bulk import (wrong person, wrong currency, a silently
// skipped row) is much harder to trust than one bad manual entry, so
// there's no column-guessing and no partial import — see validateImportRows.

import { validateDateInRange } from './tripDates'
import { MAX_AMOUNT, isAmountTooLarge } from './amountBounds'

// The import loop inserts one row at a time (an expense, its splits, and
// an FX-rate lookup — no batching), and the preview table below isn't
// virtualized, so an unbounded file would get slower and heavier to
// render the bigger it gets, with no warning until someone actually
// tried it. Told upfront (the modal's intro text) rather than left open
// and discovered the hard way.
export const MAX_IMPORT_ROWS = 500

export const IMPORT_HEADER = [
  'Date',
  'Description',
  'Category',
  'Paid by (email)',
  'Amount',
  'Currency',
  'Split between',
  'Note',
]

// csvExport.js's own header — same shape, aimed at a different reader: a
// human re-reading their trip, not a machine re-matching it. "Paid by" is
// a display name there (not stable/unique the way an email is), and there's
// an extra home-currency column in the middle. CSV-01 found that an
// export-then-reimport of your own trip failed outright on this mismatch,
// so the importer below now recognizes both shapes rather than forcing a
// human-readable report and a strict machine format to be the same file.
// The 7th column name is dynamic (the trip's home currency), hence the
// prefix/suffix split instead of one fixed array.
const EXPORT_HEADER_PREFIX = ['Date', 'Description', 'Category', 'Paid by', 'Amount', 'Currency']
const EXPORT_HEADER_SUFFIX = ['Split between', 'Note']

function matchesExportHeader(header) {
  if (header.length !== EXPORT_HEADER_PREFIX.length + 1 + EXPORT_HEADER_SUFFIX.length) return false
  const prefixOk = EXPORT_HEADER_PREFIX.every((h, i) => header[i].trim() === h)
  const amountColumnOk = /^Amount \(.+\)$/.test(header[EXPORT_HEADER_PREFIX.length].trim())
  const suffixOk = EXPORT_HEADER_SUFFIX.every(
    (h, i) => header[EXPORT_HEADER_PREFIX.length + 1 + i].trim() === h
  )
  return prefixOk && amountColumnOk && suffixOk
}

function matchesImportHeader(header) {
  return header.length === IMPORT_HEADER.length && header.every((h, i) => h.trim() === IMPORT_HEADER[i])
}

// Returns 'import' | 'export' | null (unrecognized).
function detectHeaderFormat(header) {
  if (!header) return null
  if (matchesImportHeader(header)) return 'import'
  if (matchesExportHeader(header)) return 'export'
  return null
}

export function buildImportTemplate() {
  const example = [
    // The leading `'` isn't part of the date — Excel and Google Sheets
    // both auto-detect a bare "2026-01-15"-looking cell as a real Date
    // and silently redisplay it in the system's locale format (e.g.
    // 1/15/2026 or 15-01-2026) the moment the file is opened, even
    // though the underlying CSV text was already correct. A user who
    // then types their own rows to match what they *see* ends up
    // exporting a format import rejects. A leading apostrophe is the
    // standard CSV convention both apps honor to force the cell to stay
    // plain text — it's stripped below in case it survives back into
    // the uploaded file.
    "'2026-01-15",
    'Dinner at the ghat',
    'Food',
    'a@example.com',
    '1200',
    'INR',
    'a@example.com: 600; b@example.com: 600',
    'Optional note',
  ]
  return [IMPORT_HEADER, example].map((row) => row.map(csvEscape).join(',')).join('\n')
}

function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Handles the same quoting csvExport.js's csvEscape produces: fields
// wrapped in "..." when they contain a comma, quote, or newline, with
// internal quotes doubled. A small hand-written parser, symmetric with
// the existing hand-written escaper — no new dependency for this.
export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  // Last field/row (files don't always end with a trailing newline).
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// The "isn't a member" error reads the same whether someone typed a typo'd
// email or, very plausibly, just their display name — the column header
// says "(email)" but that's easy to miss in a spreadsheet. Naming the real
// mistake (name vs. email) up front saves a re-upload to find out. Only
// applies in 'import'-format files; the 'export' format matches by name
// on purpose, so a bare name there is never the mistake.
function memberLookupError(value, context, format) {
  if (format === 'export') return `"${value}" isn't a member of this group`
  const looksLikeEmail = value.includes('@')
  return looksLikeEmail
    ? `"${value}" isn't a member of this group`
    : `"${value}" isn't a member of this group — ${context} needs their email address, not their name (e.g. name@example.com)`
}

function parseSplitBetween(raw) {
  // "email: amount; email2: amount2" (or "Name: amount; …" for an
  // export-format file) — same punctuation csvExport.js uses for "Split
  // between", just swapping which identifier is on the left.
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.lastIndexOf(':')
      if (idx === -1) return { identifier: part.trim(), amountText: '' }
      return { identifier: part.slice(0, idx).trim(), amountText: part.slice(idx + 1).trim() }
    })
}

// Display names, unlike emails, aren't guaranteed unique — two members
// named "Sam" would make a name-based match genuinely ambiguous. Rather
// than silently picking one (wrong half the time) or rejecting every name
// that happens to collide with another trip's roster, this only treats a
// name as ambiguous when the collision is within the SAME group's member
// list, and surfaces that as its own clear error instead of a generic
// "not a member" one.
function buildNameLookup(members) {
  const byName = new Map()
  const ambiguous = new Set()
  for (const m of members) {
    const key = (m.display_name ?? '').trim().toLowerCase()
    if (!key) continue
    if (byName.has(key)) ambiguous.add(key)
    else byName.set(key, m)
  }
  return { byName, ambiguous }
}

// rows: parsed CSV rows INCLUDING the header row.
// options.members: [{ user_id, email, display_name }] for the target group.
// options.categories: array of allowed category strings.
// options.currencies: Set (or object with keys) of allowed 3-letter codes.
export function validateImportRows(rows, { members, categories, currencies }) {
  const [header, ...dataRows] = rows
  const format = detectHeaderFormat(header)
  const headerError = !format
    ? `Header row doesn't match either accepted template. Expected either: ${IMPORT_HEADER.join(', ')} — or the app's own CSV export format (Date, Description, Category, Paid by, Amount, Currency, Amount (<currency>), Split between, Note).`
    : null

  if (!headerError && dataRows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [
        {
          rowNumber: 1,
          raw: header,
          error: `This file has ${dataRows.length} rows — imports are limited to ${MAX_IMPORT_ROWS} at a time. Split it into smaller files and import each separately.`,
        },
      ],
      hasErrors: true,
    }
  }

  const expectedColumns = format === 'export' ? EXPORT_HEADER_PREFIX.length + 1 + EXPORT_HEADER_SUFFIX.length : IMPORT_HEADER.length
  const emailToMember = new Map(members.map((m) => [m.email.toLowerCase(), m]))
  const nameLookup = buildNameLookup(members)
  const currencySet = currencies instanceof Set ? currencies : new Set(Object.keys(currencies))

  // One lookup used for both "Paid by" and each "Split between" entry —
  // only the map/error wording differs between the two accepted formats.
  function resolveMember(identifier, context) {
    if (format === 'export') {
      const key = identifier.toLowerCase()
      if (nameLookup.ambiguous.has(key)) {
        return { error: `"${identifier}" matches more than one member of this group — rename them so each has a unique name, or re-export after doing so.` }
      }
      const member = nameLookup.byName.get(key)
      return member ? { member } : { error: memberLookupError(identifier, context, format) }
    }
    const member = emailToMember.get(identifier.toLowerCase())
    return member ? { member } : { error: memberLookupError(identifier, context, format) }
  }

  const parsedRows = dataRows.map((cols, i) => {
    const rowNumber = i + 2 // 1-indexed, plus the header row
    if (cols.length !== expectedColumns) {
      return { rowNumber, raw: cols, error: `Expected ${expectedColumns} columns, found ${cols.length}` }
    }

    const trimmed = cols.map((c) => c.trim())
    const [dateTextRaw, description, category, payerIdentifier, amountText, currency] = trimmed
    // Export-format rows have an extra home-currency amount column between
    // "Currency" and "Split between" that import never needs — the fresh
    // row being created gets its own live rate, same as any other import.
    const [splitText, note] = format === 'export' ? trimmed.slice(7) : trimmed.slice(6)
    // Strip the text-forcing apostrophe the template seeds (see
    // buildImportTemplate) in case it survived a round trip through a
    // spreadsheet app instead of being hidden by it.
    const dateText = dateTextRaw.replace(/^'/, '')

    if (!DATE_RE.test(dateText) || Number.isNaN(new Date(dateText).getTime())) {
      return { rowNumber, raw: cols, error: `Invalid date "${dateText}" — expected YYYY-MM-DD` }
    }
    const dateCheck = validateDateInRange(dateText, 'Date')
    if (!dateCheck.valid) {
      return { rowNumber, raw: cols, error: dateCheck.error }
    }
    if (!description) {
      return { rowNumber, raw: cols, error: 'Description is required' }
    }
    if (!categories.includes(category)) {
      return { rowNumber, raw: cols, error: `Unknown category "${category}" — must be one of: ${categories.join(', ')}` }
    }
    const payerResult = resolveMember(payerIdentifier, '"Paid by"')
    if (payerResult.error) {
      return { rowNumber, raw: cols, error: payerResult.error }
    }
    const payer = payerResult.member
    const amount = Number(amountText)
    if (!Number.isFinite(amount) || amount <= 0) {
      return { rowNumber, raw: cols, error: `Invalid amount "${amountText}"` }
    }
    if (isAmountTooLarge(amount)) {
      return { rowNumber, raw: cols, error: `Amount "${amountText}" can't be more than ${MAX_AMOUNT.toLocaleString()}` }
    }
    if (!currencySet.has(currency.toUpperCase())) {
      return { rowNumber, raw: cols, error: `Unsupported currency "${currency}"` }
    }
    if (!splitText) {
      return { rowNumber, raw: cols, error: 'Split between is required' }
    }

    const splitParts = parseSplitBetween(splitText)
    const splits = []
    for (const part of splitParts) {
      const splitResult = resolveMember(part.identifier, '"Split between"')
      if (splitResult.error) {
        return { rowNumber, raw: cols, error: splitResult.error }
      }
      const member = splitResult.member
      const shareAmount = Number(part.amountText)
      if (!Number.isFinite(shareAmount) || shareAmount <= 0) {
        return { rowNumber, raw: cols, error: `Invalid split amount for "${part.identifier}"` }
      }
      splits.push({ user_id: member.user_id, email: member.email, share_amount: shareAmount })
    }
    if (splits.length === 0) {
      return { rowNumber, raw: cols, error: 'Split between must list at least one person' }
    }
    const splitSum = Math.round(splits.reduce((sum, s) => sum + s.share_amount, 0) * 100) / 100
    if (Math.abs(splitSum - amount) > 0.01) {
      return { rowNumber, raw: cols, error: `Split amounts (${splitSum}) don't add up to the total (${amount})` }
    }

    return {
      rowNumber,
      raw: cols,
      error: null,
      description,
      category,
      paid_by: payer.user_id,
      expense_date: dateText,
      amount,
      currency: currency.toUpperCase(),
      note: note || null,
      splits,
    }
  })

  const rowsWithHeaderCheck = headerError
    ? [{ rowNumber: 1, raw: header ?? [], error: headerError }]
    : parsedRows

  const hasErrors = rowsWithHeaderCheck.some((r) => r.error)
  return { rows: rowsWithHeaderCheck, hasErrors }
}
