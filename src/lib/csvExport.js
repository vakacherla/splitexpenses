function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// One row per expense, with each participant's share flattened into a
// single semicolon-separated column — keeps the file one-row-per-expense
// (matches how people actually read it) rather than one-row-per-split.
export function expensesToCSV(expenses, membersMap, homeCurrency) {
  const nameOf = (id) => membersMap[id]?.display_name ?? id

  const header = [
    'Date',
    'Description',
    'Category',
    'Paid by',
    'Amount',
    'Currency',
    `Amount (${homeCurrency})`,
    'Split between',
    'Note',
  ]

  const rows = expenses.map((e) => [
    e.expense_date,
    e.description,
    e.category,
    nameOf(e.paid_by),
    e.amount,
    e.currency,
    e.amount_in_home,
    (e.expense_splits ?? []).map((s) => `${nameOf(s.user_id)}: ${s.share_amount}`).join('; '),
    e.note ?? '',
  ])

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
}

export function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
