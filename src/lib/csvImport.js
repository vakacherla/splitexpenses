// The import counterpart to csvExport.js. Deliberately strict per the
// roadmap: a bad bulk import (wrong person, wrong currency, a silently
// skipped row) is much harder to trust than one bad manual entry, so
// there's no column-guessing and no partial import — see validateImportRows.

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

export function buildImportTemplate() {
  const example = [
    '2026-01-15',
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

function parseSplitBetween(raw) {
  // "email: amount; email2: amount2" — same "Name: amount" punctuation
  // csvExport.js uses for "Split between", with email instead of name.
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.lastIndexOf(':')
      if (idx === -1) return { email: part.trim(), amountText: '' }
      return { email: part.slice(0, idx).trim(), amountText: part.slice(idx + 1).trim() }
    })
}

// rows: parsed CSV rows INCLUDING the header row.
// options.members: [{ user_id, email }] for the target group.
// options.categories: array of allowed category strings.
// options.currencies: Set (or object with keys) of allowed 3-letter codes.
export function validateImportRows(rows, { members, categories, currencies }) {
  const [header, ...dataRows] = rows
  const headerError =
    !header || header.length !== IMPORT_HEADER.length || header.some((h, i) => h.trim() !== IMPORT_HEADER[i])
      ? `Header row doesn't match the template. Expected: ${IMPORT_HEADER.join(', ')}`
      : null

  const emailToMember = new Map(members.map((m) => [m.email.toLowerCase(), m]))
  const currencySet = currencies instanceof Set ? currencies : new Set(Object.keys(currencies))

  const parsedRows = dataRows.map((cols, i) => {
    const rowNumber = i + 2 // 1-indexed, plus the header row
    if (cols.length !== IMPORT_HEADER.length) {
      return { rowNumber, raw: cols, error: `Expected ${IMPORT_HEADER.length} columns, found ${cols.length}` }
    }

    const [dateText, description, category, payerEmail, amountText, currency, splitText, note] = cols.map((c) =>
      c.trim()
    )

    if (!DATE_RE.test(dateText) || Number.isNaN(new Date(dateText).getTime())) {
      return { rowNumber, raw: cols, error: `Invalid date "${dateText}" — expected YYYY-MM-DD` }
    }
    if (!description) {
      return { rowNumber, raw: cols, error: 'Description is required' }
    }
    if (!categories.includes(category)) {
      return { rowNumber, raw: cols, error: `Unknown category "${category}" — must be one of: ${categories.join(', ')}` }
    }
    const payer = emailToMember.get(payerEmail.toLowerCase())
    if (!payer) {
      return { rowNumber, raw: cols, error: `"${payerEmail}" isn't a member of this group` }
    }
    const amount = Number(amountText)
    if (!Number.isFinite(amount) || amount <= 0) {
      return { rowNumber, raw: cols, error: `Invalid amount "${amountText}"` }
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
      const member = emailToMember.get(part.email.toLowerCase())
      if (!member) {
        return { rowNumber, raw: cols, error: `"${part.email}" in the split isn't a member of this group` }
      }
      const shareAmount = Number(part.amountText)
      if (!Number.isFinite(shareAmount) || shareAmount <= 0) {
        return { rowNumber, raw: cols, error: `Invalid split amount for "${part.email}"` }
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
