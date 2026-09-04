import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney } from '../lib/fx'
import { CATEGORY_COLORS } from '../lib/categories'
import CategoryIcon from './CategoryIcon'

const SPLIT_LABELS = { percentage: 'split by %', exact: 'custom split', itemized: 'itemized' }

export default function ExpenseRow({
  expense,
  membersMap,
  currentUserId,
  homeCurrency,
  isMember,
  onEdit,
  onDelete,
  onDuplicate,
  onAttached,
}) {
  const [open, setOpen] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState('')
  const attachInputRef = useRef(null)
  const canEdit = expense.created_by === currentUserId || expense.paid_by === currentUserId
  const payerName = expense.paid_by === currentUserId ? 'You' : membersMap[expense.paid_by]?.display_name ?? '—'
  const dateLabel = new Date(expense.expense_date + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  useEffect(() => {
    if (!open || !expense.receipt_path || receiptUrl) return
    supabase.storage
      .from('receipts')
      .createSignedUrl(expense.receipt_path, 300)
      .then(({ data }) => {
        if (data?.signedUrl) setReceiptUrl(data.signedUrl)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense.receipt_path])

  async function handleAttachReceipt(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAttaching(true)
    setAttachError('')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${expense.group_id}/${expense.id}.${ext}`
    const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file, { upsert: true })
    if (uploadError) {
      setAttaching(false)
      setAttachError(uploadError.message)
      return
    }
    const { error: updateError } = await supabase.from('expenses').update({ receipt_path: path }).eq('id', expense.id)
    setAttaching(false)
    if (updateError) {
      setAttachError(updateError.message)
      return
    }
    if (attachInputRef.current) attachInputRef.current.value = ''
    onAttached?.()
  }

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 py-3.5 text-left hover:bg-paper-raised transition-colors -mx-2 px-2 rounded-lg"
      >
        <div className="w-11 shrink-0 text-center">
          <p className="text-xs uppercase text-ink-soft leading-tight">{dateLabel.split(' ')[0]}</p>
          <p className="font-display text-lg text-ink leading-tight">{dateLabel.split(' ')[1]}</p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CategoryIcon category={expense.category} color={CATEGORY_COLORS[expense.category] ?? '#9a958a'} />
            <p className="text-ink truncate">{expense.description}</p>
            {expense.receipt_path && (
              <span className="text-ink-soft shrink-0" aria-label="Has receipt photo" title="Has receipt photo">
                📎
              </span>
            )}
            {expense._pendingSync && (
              <span
                className="text-xs text-accent border border-accent/30 bg-accent-tint rounded-full px-2 py-0.5 shrink-0"
                title="Saved on this device — will sync once you're back online"
              >
                Pending sync
              </span>
            )}
          </div>
          <p className="text-xs text-ink-soft mt-0.5 pl-3.5">
            {payerName} paid · {expense.category}
            {expense.split_type && expense.split_type !== 'equal' ? ` · ${SPLIT_LABELS[expense.split_type]}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="num text-ink">{formatMoney(expense.amount, expense.currency)}</p>
          {expense.currency !== homeCurrency && (
            <p className="num text-xs text-ink-soft">
              {expense.amount_in_home != null ? formatMoney(expense.amount_in_home, homeCurrency) : '≈ pending'}
            </p>
          )}
        </div>
      </button>

      {open && (
        <div className="pb-4 pl-[3.75rem] pr-2 -mt-1">
          {expense.note && <p className="text-sm text-ink-soft italic mb-2">{expense.note}</p>}
          {expense.split_type === 'itemized' && Array.isArray(expense.items) && expense.items.length > 0 && (
            <ul className="mb-2.5 space-y-0.5">
              {expense.items.map((item, i) => (
                <li key={i} className="flex justify-between text-xs text-ink-soft">
                  <span className="truncate pr-2">
                    {item.description}
                    {' — '}
                    {item.participant_ids
                      .map((id) => (id === currentUserId ? 'You' : (membersMap[id]?.display_name ?? '—')))
                      .join(', ')}
                  </span>
                  <span className="num shrink-0">{formatMoney(item.amount, expense.currency)}</span>
                </li>
              ))}
              {expense.tax > 0 && (
                <li className="flex justify-between text-xs text-ink-soft">
                  <span>Tax</span>
                  <span className="num">{formatMoney(expense.tax, expense.currency)}</span>
                </li>
              )}
              {expense.tip > 0 && (
                <li className="flex justify-between text-xs text-ink-soft">
                  <span>Tip</span>
                  <span className="num">{formatMoney(expense.tip, expense.currency)}</span>
                </li>
              )}
            </ul>
          )}
          <ul className="space-y-1">
            {expense.expense_splits.map((s) => (
              <li key={s.user_id} className="flex justify-between text-sm text-ink-soft">
                <span>{s.user_id === currentUserId ? 'You' : membersMap[s.user_id]?.display_name ?? 'Unknown'}</span>
                <span className="num">
                  {formatMoney(s.share_amount, expense.currency)}
                  {expense.split_type === 'percentage' && s.percentage != null && (
                    <span className="text-ink-soft/70"> ({s.percentage}%)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {expense.receipt_path && (
              <a
                href={receiptUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className={`text-xs text-primary hover:underline ${!receiptUrl ? 'pointer-events-none opacity-50' : ''}`}
              >
                {receiptUrl ? 'View receipt' : 'Loading receipt…'}
              </a>
            )}
            {!expense.receipt_path && canEdit && !expense._pendingSync && (
              <>
                <input
                  ref={attachInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAttachReceipt}
                />
                <button
                  onClick={() => attachInputRef.current?.click()}
                  disabled={attaching}
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                >
                  {attaching ? 'Attaching…' : 'Attach receipt'}
                </button>
              </>
            )}
            {!expense.receipt_path && canEdit && expense._pendingSync && (
              <span className="text-xs text-ink-soft italic">Attach a receipt once this syncs</span>
            )}
            {isMember && (
              <button onClick={() => onDuplicate(expense)} className="text-xs text-primary hover:underline">
                Duplicate
              </button>
            )}
            {canEdit && (
              <>
                <button onClick={() => onEdit(expense)} className="text-xs text-primary hover:underline">
                  Edit
                </button>
                <button onClick={() => onDelete(expense.id)} className="text-xs text-owe hover:underline">
                  Delete this expense
                </button>
              </>
            )}
          </div>
          {attachError && <p className="mt-1.5 text-xs text-owe">{attachError}</p>}
        </div>
      )}
    </li>
  )
}
