import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getRate, fetchSupportedCurrencies, FALLBACK_CURRENCIES } from '../lib/fx'
import { CATEGORIES } from '../lib/categories'
import { downloadCSV } from '../lib/csvExport'
import { buildImportTemplate, parseCSV, validateImportRows } from '../lib/csvImport'

export default function ImportCsvModal({ group, members, currentUserId, onImported, onClose }) {
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null) // { rows, hasErrors }
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null) // { batchId, count }
  const [submitError, setSubmitError] = useState('')

  const memberEmails = members.map((m) => ({ user_id: m.user_id, email: m.email }))

  async function handleFile(f) {
    setFile(f)
    setParsed(null)
    setParseError('')
    setResult(null)
    setSubmitError('')
    try {
      const text = await f.text()
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setParseError('That file has no rows.')
        return
      }
      const currencies = await fetchSupportedCurrencies().catch(() => FALLBACK_CURRENCIES)
      const validated = validateImportRows(rows, {
        members: memberEmails,
        categories: CATEGORIES,
        currencies,
      })
      setParsed(validated)
    } catch {
      setParseError("Couldn't read that file as CSV.")
    }
  }

  function handleDownloadTemplate() {
    downloadCSV('split-expenses-import-template.csv', buildImportTemplate())
  }

  async function handleConfirm() {
    const validRows = parsed.rows.filter((r) => !r.error)
    setImporting(true)
    setProgress(0)
    setSubmitError('')
    try {
      const { data: batch, error: batchError } = await supabase
        .from('import_batches')
        .insert({ group_id: group.id, created_by: currentUserId, filename: file.name, row_count: validRows.length })
        .select()
        .single()
      if (batchError) throw batchError

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i]
        const rate = await getRate(row.currency, group.home_currency)
        const amountInHome = Math.round(row.amount * rate * 100) / 100

        const { data: expense, error: expenseError } = await supabase
          .from('expenses')
          .insert({
            group_id: group.id,
            description: row.description,
            paid_by: row.paid_by,
            currency: row.currency,
            amount: row.amount,
            exchange_rate: rate,
            amount_in_home: amountInHome,
            expense_date: row.expense_date,
            split_type: 'exact',
            category: row.category,
            note: row.note,
            created_by: batch.created_by,
            import_batch_id: batch.id,
          })
          .select()
          .single()
        if (expenseError) throw expenseError

        const splitRows = row.splits.map((s) => ({
          expense_id: expense.id,
          user_id: s.user_id,
          share_amount: s.share_amount,
          share_in_home: Math.round(s.share_amount * rate * 100) / 100,
          percentage: null,
        }))
        const { error: splitError } = await supabase.from('expense_splits').insert(splitRows)
        if (splitError) throw splitError

        setProgress(i + 1)
      }

      setResult({ batchId: batch.id, count: validRows.length })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setImporting(false)
    }
  }

  async function handleUndo() {
    if (!result) return
    await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('import_batch_id', result.batchId)
    await supabase.from('import_batches').update({ undone_at: new Date().toISOString() }).eq('id', result.batchId)
    setResult(null)
    onImported()
  }

  function handleDone() {
    onImported()
    onClose()
  }

  const nameOf = (userId) => members.find((m) => m.user_id === userId)?.display_name ?? userId

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
      <div className="w-full sm:max-w-2xl bg-paper-raised rounded-t-3xl sm:rounded-2xl border border-line shadow-raised p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Import expenses from CSV</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm">
            Close
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Imported {result.count} expense{result.count === 1 ? '' : 's'} from {file.name}.
            </p>
            <div className="flex items-center gap-4">
              <button onClick={handleDone} className="rounded-full bg-primary text-on-primary text-sm font-medium px-4 py-1.5 hover:bg-primary-dark transition-colors">
                Done
              </button>
              <button onClick={handleUndo} className="text-sm text-owe hover:underline">
                Undo this import
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              Bring in a backlog of expenses already tracked in a spreadsheet. Only this app's own template is
              accepted — download it, fill it in, then upload it below. Every row is validated before anything is
              created; if any row has a problem, nothing is imported until it's fixed.
            </p>

            <button onClick={handleDownloadTemplate} className="text-sm text-primary hover:underline">
              Download template
            </button>

            <div>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                className="text-sm text-ink-soft"
              />
            </div>

            {parseError && <p className="text-sm text-owe">{parseError}</p>}

            {parsed && (
              <div className="space-y-3">
                <p className="text-sm text-ink">
                  {parsed.hasErrors
                    ? `${parsed.rows.filter((r) => r.error).length} of ${parsed.rows.length} row(s) have a problem — fix the file and re-upload. Nothing will be imported until every row is valid.`
                    : `${parsed.rows.length} row(s) ready to import.`}
                </p>

                <div className="overflow-x-auto border border-line rounded-lg max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-paper sticky top-0">
                      <tr className="text-left text-ink-soft">
                        <th className="px-2 py-1.5">Row</th>
                        <th className="px-2 py-1.5">Date</th>
                        <th className="px-2 py-1.5">Description</th>
                        <th className="px-2 py-1.5">Paid by</th>
                        <th className="px-2 py-1.5">Amount</th>
                        <th className="px-2 py-1.5">Split</th>
                        <th className="px-2 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.map((r) => (
                        <tr key={r.rowNumber} className="border-t border-line">
                          <td className="px-2 py-1.5 text-ink-soft">{r.rowNumber}</td>
                          {r.error ? (
                            <td colSpan={5} className="px-2 py-1.5 text-owe">
                              {r.error}
                            </td>
                          ) : (
                            <>
                              <td className="px-2 py-1.5 text-ink">{r.expense_date}</td>
                              <td className="px-2 py-1.5 text-ink">{r.description}</td>
                              <td className="px-2 py-1.5 text-ink">{nameOf(r.paid_by)}</td>
                              <td className="px-2 py-1.5 text-ink">
                                {r.amount} {r.currency}
                              </td>
                              <td className="px-2 py-1.5 text-ink">
                                {r.splits.map((s) => `${nameOf(s.user_id)}: ${s.share_amount}`).join('; ')}
                              </td>
                            </>
                          )}
                          <td className="px-2 py-1.5">
                            {r.error ? (
                              <span className="text-owe font-medium">Error</span>
                            ) : (
                              <span className="text-owed font-medium">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {submitError && <p className="text-sm text-owe">{submitError}</p>}

                <button
                  onClick={handleConfirm}
                  disabled={parsed.hasErrors || importing}
                  className="rounded-full bg-primary text-on-primary text-sm font-medium px-4 py-1.5 hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {importing
                    ? `Importing ${progress} of ${parsed.rows.length}…`
                    : `Import ${parsed.rows.length} expense${parsed.rows.length === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
