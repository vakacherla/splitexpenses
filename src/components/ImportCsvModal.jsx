import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getRate, fetchSupportedCurrencies, FALLBACK_CURRENCIES } from '../lib/fx'
import { CATEGORIES } from '../lib/categories'
import { downloadCSV } from '../lib/csvExport'
import { buildImportTemplate, parseCSV, validateImportRows, MAX_IMPORT_ROWS } from '../lib/csvImport'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { logActivity, notifyGroup } from '../lib/activity'
import HelpLink from './HelpLink'

function OfflineNotice({ children }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-owe/40 bg-owe-tint px-3.5 py-3 text-sm text-owe">
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
        <path d="M10 3.3 17.3 16H2.7L10 3.3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M10 8.3v3.3M10 14h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {children}
    </div>
  )
}

export default function ImportCsvModal({ group, members, currentUserId, onImported, onClose }) {
  const isOffline = !useOnlineStatus()
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
      // Falls back to FALLBACK_CURRENCIES automatically when offline —
      // parsing and previewing a file doesn't need a connection, only
      // the actual import step below does.
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

  // Unlike a single expense add, a bulk import can't be handed to the
  // offline write queue — that queue replays operations independently,
  // one at a time, with no concept of "this batch of N either all lands
  // or none does" (deliberately, so it never needs a dependency graph).
  // The whole point of the mandatory preview above is exactly that
  // all-or-nothing guarantee, so rather than weaken it, import requires
  // a live connection outright, same as receipt scanning does elsewhere
  // in this app. If the connection drops mid-import anyway (a real risk
  // over many sequential rows), whatever this run already created is
  // automatically rolled back rather than left as a silent partial
  // import — see the catch block below.
  async function handleConfirm() {
    if (isOffline) {
      setSubmitError("You're offline — reconnect and try again.")
      return
    }
    const validRows = parsed.rows.filter((r) => !r.error)
    setImporting(true)
    setProgress(0)
    setSubmitError('')
    let batch = null
    let createdCount = 0
    try {
      const { data, error: batchError } = await supabase
        .from('import_batches')
        .insert({ group_id: group.id, created_by: currentUserId, filename: file.name, row_count: validRows.length })
        .select()
        .single()
      if (batchError) throw batchError
      batch = data

      for (let i = 0; i < validRows.length; i++) {
        // navigator.onLine flipping mid-loop is the one case the offline
        // hook's own subscription can't catch fast enough between renders
        // — check it directly before each row, not just once up front.
        if (!navigator.onLine) throw new Error('offline')

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

        createdCount++
        setProgress(i + 1)
      }

      const actorName = members.find((m) => m.user_id === currentUserId)?.display_name ?? 'Someone'
      const summary = `${validRows.length} expense${validRows.length === 1 ? '' : 's'} from ${file.name}`
      logActivity({
        groupId: group.id,
        actorId: currentUserId,
        actorName,
        eventType: 'csv_import',
        summary,
        entityId: batch.id,
      })
      const otherMembers = members.map((m) => m.user_id).filter((id) => id !== currentUserId)
      notifyGroup({
        groupId: group.id,
        targetUserIds: otherMembers,
        title: group.name,
        body: `${actorName} imported ${summary}`,
        url: `/groups/${group.id}`,
      })

      setResult({ batchId: batch.id, count: validRows.length })
    } catch (err) {
      // Soft-delete whatever this run managed to create, and mark the
      // batch itself as undone with the count that's actually true — same
      // mechanism as a normal undo, not a hard delete: expenses.import_batch_id
      // still references this batch row even after the soft-delete (the
      // rows still exist, just hidden), so deleting the batch row here
      // would violate that foreign key and fail silently, since
      // supabase-js resolves a query error rather than throwing it.
      let rolledBack = true
      if (batch) {
        const { error: rollbackExpenseError } = await supabase
          .from('expenses')
          .update({ deleted_at: new Date().toISOString() })
          .eq('import_batch_id', batch.id)
        const { error: rollbackBatchError } = await supabase
          .from('import_batches')
          .update({ undone_at: new Date().toISOString(), row_count: createdCount })
          .eq('id', batch.id)
        rolledBack = !rollbackExpenseError && !rollbackBatchError
      }
      if (rolledBack) {
        setSubmitError(
          !navigator.onLine
            ? "Lost connection partway through the import — the rows it already created were rolled back, so nothing was left half-imported. Reconnect and try again."
            : `Import failed (${err.message}) — rolled back, nothing was left in the ledger. Try again.`
        )
      } else {
        setSubmitError(
          'Import failed, and the automatic cleanup couldn\'t reach the server either — some expenses from this attempt may still be in the ledger. Once you\'re back online, check "CSV imports" in Group settings and undo it there if so.'
        )
      }
      onImported()
    } finally {
      setImporting(false)
      setProgress(0)
    }
  }

  async function handleUndo() {
    if (!result) return
    if (isOffline) {
      setSubmitError("You're offline — reconnect to undo this import.")
      return
    }
    const { error: expenseError } = await supabase
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('import_batch_id', result.batchId)
    const { error: batchError } = await supabase
      .from('import_batches')
      .update({ undone_at: new Date().toISOString() })
      .eq('id', result.batchId)
    if (expenseError || batchError) {
      setSubmitError((expenseError ?? batchError).message)
      return
    }
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
          <div className="flex items-center gap-3">
            <HelpLink to="search-export-import" />
            <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm">
              Close
            </button>
          </div>
        </div>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Imported {result.count} expense{result.count === 1 ? '' : 's'} from {file.name}.
            </p>
            {isOffline && <OfflineNotice>You're offline — undoing this import needs a connection too.</OfflineNotice>}
            {submitError && <p className="text-sm text-owe">{submitError}</p>}
            <div className="flex items-center gap-4">
              <button onClick={handleDone} className="rounded-full bg-primary text-on-primary text-sm font-medium px-4 py-1.5 hover:bg-primary-dark transition-colors">
                Done
              </button>
              <button onClick={handleUndo} disabled={isOffline} className="text-sm text-owe hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline">
                Undo this import
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              Bring in a backlog of expenses already tracked in a spreadsheet. Only this app's own template is
              accepted — download it, fill it in, then upload it below. Every row is validated before anything is
              created; if any row has a problem, nothing is imported until it's fixed. Up to {MAX_IMPORT_ROWS} rows
              per file — split a bigger backlog into a few smaller ones.
            </p>

            {isOffline && (
              <OfflineNotice>
                You're offline — importing needs a connection. You can still prepare and preview a file now; the
                Import button will be enabled again once you're back online.
              </OfflineNotice>
            )}

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
                  disabled={parsed.hasErrors || importing || isOffline}
                  className="rounded-full bg-primary text-on-primary text-sm font-medium px-4 py-1.5 hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {importing
                    ? `Importing ${progress} of ${parsed.rows.length}…`
                    : isOffline
                      ? "Can't import while offline"
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
