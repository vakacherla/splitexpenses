import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney } from '../lib/fx'
import { useLiveRate } from '../lib/useLiveRate'
import { splitEvenly, splitByPercentages, splitItemized } from '../lib/split'
import { CATEGORIES } from '../lib/categories'
import CurrencySelect from './CurrencySelect'

const SPLIT_MODES = [
  { id: 'equal', label: 'Equal' },
  { id: 'percentage', label: 'Percentage' },
  { id: 'exact', label: 'Exact amounts' },
  { id: 'itemized', label: 'Itemized' },
]

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function AddExpenseForm({ group, members, currentUserId, onAdded, onClose }) {
  const defaultSplit = group.default_split ?? null
  const memberIds = members.map((m) => m.user_id)

  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Misc')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(group.home_currency)
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [participantIds, setParticipantIds] = useState(() => {
    const saved = defaultSplit?.participant_ids?.filter((id) => memberIds.includes(id))
    return saved?.length ? saved : memberIds
  })
  const [splitMode, setSplitMode] = useState(() => defaultSplit?.split_mode ?? 'equal')
  const [exactShares, setExactShares] = useState({}) // user_id -> string
  const [percentageShares, setPercentageShares] = useState(() => {
    if (defaultSplit?.split_mode === 'percentage' && defaultSplit.percentages) {
      return Object.fromEntries(Object.entries(defaultSplit.percentages).map(([k, v]) => [k, String(v)]))
    }
    return {}
  })
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const [items, setItems] = useState([]) // { id, description, amount: string, participantIds: string[] }
  const [tax, setTax] = useState('') // split proportionally by item subtotal
  const [tip, setTip] = useState('') // split proportionally by item subtotal

  const [receiptFile, setReceiptFile] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const fileInputRef = useRef(null)

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const { rate, loading: rateLoading, error: rateError } = useLiveRate(currency, group.home_currency)

  const taxNum = parseFloat(tax) || 0
  const tipNum = parseFloat(tip) || 0
  const itemsTotal = useMemo(
    () => items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0),
    [items]
  )
  const itemizedTotal = Math.round((itemsTotal + taxNum + tipNum) * 100) / 100

  const parsedAmount = splitMode === 'itemized' ? itemizedTotal : parseFloat(amount) || 0
  const homeEquivalent = rate ? parsedAmount * rate : null

  const equalShares = useMemo(() => {
    if (participantIds.length === 0) return {}
    const shares = splitEvenly(parsedAmount, participantIds.length)
    return Object.fromEntries(participantIds.map((id, i) => [id, shares[i]]))
  }, [parsedAmount, participantIds])

  const percentageTotal = participantIds.reduce((sum, id) => sum + (parseFloat(percentageShares[id]) || 0), 0)
  const percentageMismatch = splitMode === 'percentage' && Math.abs(percentageTotal - 100) > 0.5

  const percentageShareAmounts = useMemo(() => {
    if (participantIds.length === 0) return {}
    const pcts = participantIds.map((id) => parseFloat(percentageShares[id]) || 0)
    const amounts = splitByPercentages(parsedAmount, pcts)
    return Object.fromEntries(participantIds.map((id, i) => [id, amounts[i]]))
  }, [parsedAmount, participantIds, percentageShares])

  const exactTotal = participantIds.reduce((sum, id) => sum + (parseFloat(exactShares[id]) || 0), 0)
  const exactMismatch = splitMode === 'exact' && Math.abs(exactTotal - parsedAmount) > 0.01

  const itemizedShares = useMemo(() => {
    if (splitMode !== 'itemized' || participantIds.length === 0) return {}
    return splitItemized(
      items.map((it) => ({ amount: parseFloat(it.amount) || 0, participantIds: it.participantIds })),
      participantIds,
      taxNum,
      tipNum
    ).shares
  }, [splitMode, items, participantIds, taxNum, tipNum])

  function toggleParticipant(id) {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', amount: '', participantIds: [...participantIds] },
    ])
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function toggleItemParticipant(itemId, userId) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              participantIds: it.participantIds.includes(userId)
                ? it.participantIds.filter((id) => id !== userId)
                : [...it.participantIds, userId],
            }
          : it
      )
    )
  }

  async function handleReceiptSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptFile(file)
    setScanning(true)
    setScanError('')
    try {
      const imageBase64 = await fileToBase64(file)
      const { data, error } = await supabase.functions.invoke('receipt-scan', {
        body: { imageBase64, mimeType: file.type },
      })
      if (error) {
        let message = error.message
        try {
          const body = await error.context?.json?.()
          if (body?.error) message = body.error
        } catch {
          // no JSON body — fall back to error.message
        }
        throw new Error(message)
      }
      if (data?.error) throw new Error(data.error)

      if (data?.description) setDescription(data.description)
      if (typeof data?.amount === 'number' && data.amount > 0) setAmount(String(data.amount))
      if (data?.currency) setCurrency(data.currency)
      if (data?.date) setDate(data.date)
      if (data?.category && CATEGORIES.includes(data.category)) setCategory(data.category)

      // Itemized receipts are the higher-fidelity result — switch straight
      // to that split mode rather than leaving a good extraction unused.
      // Every item starts assigned to everyone; the user narrows it down
      // to whoever actually ordered each thing.
      const usableItems = Array.isArray(data?.items)
        ? data.items.filter((it) => it && typeof it.amount === 'number' && it.amount > 0)
        : []
      if (usableItems.length > 0) {
        setSplitMode('itemized')
        setItems(
          usableItems.map((it) => ({
            id: crypto.randomUUID(),
            description: typeof it.description === 'string' ? it.description : '',
            amount: String(it.amount),
            participantIds: [...participantIds],
          }))
        )
        if (typeof data?.tax === 'number' && data.tax >= 0) setTax(String(data.tax))
        if (typeof data?.tip === 'number' && data.tip >= 0) setTip(String(data.tip))
      }
    } catch (err) {
      setScanError(err.message || 'Could not read that receipt — you can still fill this in by hand.')
    } finally {
      setScanning(false)
    }
  }

  function removeReceipt() {
    setReceiptFile(null)
    setScanError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!description.trim()) return setError('Give the expense a short description.')
    if (splitMode === 'itemized') {
      if (items.length === 0) return setError('Add at least one item.')
      if (items.some((it) => !it.description.trim() || !(parseFloat(it.amount) > 0))) {
        return setError('Give every item a description and an amount greater than zero.')
      }
      if (items.some((it) => it.participantIds.filter((id) => participantIds.includes(id)).length === 0)) {
        return setError('Assign every item to at least one person.')
      }
    }
    if (parsedAmount <= 0) return setError('Enter an amount greater than zero.')
    if (participantIds.length === 0) return setError('Pick at least one person to split with.')
    if (!rate) return setError('Still fetching the exchange rate — try again in a moment.')
    if (exactMismatch) return setError(`Exact shares add up to ${exactTotal.toFixed(2)}, not ${parsedAmount.toFixed(2)}.`)
    if (percentageMismatch) return setError(`Percentages add up to ${percentageTotal.toFixed(1)}%, not 100%.`)

    setSaving(true)

    const amountInHome = Math.round(parsedAmount * rate * 100) / 100
    const shareSourceOriginal =
      splitMode === 'equal'
        ? equalShares
        : splitMode === 'percentage'
          ? percentageShareAmounts
          : splitMode === 'itemized'
            ? itemizedShares
            : Object.fromEntries(participantIds.map((id) => [id, parseFloat(exactShares[id]) || 0]))

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        group_id: group.id,
        description: description.trim(),
        paid_by: paidBy,
        currency,
        amount: parsedAmount,
        exchange_rate: rate,
        amount_in_home: amountInHome,
        expense_date: date,
        split_type: splitMode,
        category,
        note: note.trim() || null,
        items:
          splitMode === 'itemized'
            ? items.map((it) => ({
                description: it.description.trim(),
                amount: Math.round((parseFloat(it.amount) || 0) * 100) / 100,
                participant_ids: it.participantIds.filter((id) => participantIds.includes(id)),
              }))
            : null,
        tax: splitMode === 'itemized' ? taxNum : null,
        tip: splitMode === 'itemized' ? tipNum : null,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (expenseError) {
      setError(expenseError.message)
      setSaving(false)
      return
    }

    const splitRows = participantIds.map((userId) => {
      const shareOriginal = shareSourceOriginal[userId] ?? 0
      return {
        expense_id: expense.id,
        user_id: userId,
        share_amount: shareOriginal,
        share_in_home: Math.round(shareOriginal * rate * 100) / 100,
        percentage: splitMode === 'percentage' ? parseFloat(percentageShares[userId]) || 0 : null,
      }
    })

    const { error: splitError } = await supabase.from('expense_splits').insert(splitRows)
    if (splitError) {
      setSaving(false)
      setError(splitError.message)
      return
    }

    // Best-effort extras — the expense itself is already safely saved, so a
    // failure in either of these shouldn't block closing the form.
    if (saveAsDefault && splitMode !== 'exact' && splitMode !== 'itemized') {
      await supabase.rpc('update_default_split', {
        gid: group.id,
        config: {
          participant_ids: participantIds,
          split_mode: splitMode,
          percentages:
            splitMode === 'percentage'
              ? Object.fromEntries(participantIds.map((id) => [id, parseFloat(percentageShares[id]) || 0]))
              : null,
        },
      })
    }

    if (receiptFile) {
      const ext = receiptFile.name.split('.').pop() || 'jpg'
      const path = `${group.id}/${expense.id}.${ext}`
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, receiptFile, {
        upsert: true,
      })
      if (!uploadError) {
        await supabase.from('expenses').update({ receipt_path: path }).eq('id', expense.id)
      }
    }

    setSaving(false)
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-lg bg-paper-raised rounded-t-3xl sm:rounded-2xl border border-line shadow-raised max-h-[92dvh] overflow-y-auto"
      >
        <div className="px-5 sm:px-6 pt-5 pb-2 flex items-center justify-between sticky top-0 bg-paper-raised">
          <h2 className="font-display text-xl text-ink">Add an expense</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm">
            Close
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-6 space-y-5">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleReceiptSelected}
            />
            {!receiptFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-line py-3 text-sm text-ink-soft hover:text-ink hover:border-primary transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M4 7.5h2.5L8 5h4l1.5 2.5H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <circle cx="10" cy="11.5" r="2.25" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                Scan a receipt to fill this in
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5">
                <span className="text-sm text-ink-soft truncate">
                  {scanning ? 'Reading receipt…' : `📎 ${receiptFile.name}`}
                </span>
                <button
                  type="button"
                  onClick={removeReceipt}
                  className="text-xs text-owe hover:underline shrink-0 ml-2"
                >
                  Remove
                </button>
              </div>
            )}
            {scanError && <p className="mt-1.5 text-xs text-owe">{scanError}</p>}
          </div>

          <div>
            <label className="block text-sm text-ink-soft mb-1.5">What was it for?</label>
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dinner, taxi, hotel deposit…"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-ink-soft mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm text-ink-soft mb-1.5">
                {splitMode === 'itemized' ? 'Total (from items)' : 'Amount'}
              </label>
              {splitMode === 'itemized' ? (
                <div className="num w-full rounded-lg border border-line bg-paper-raised px-3.5 py-2.5 text-ink text-lg">
                  {parsedAmount.toFixed(2)}
                </div>
              ) : (
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="num w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink text-lg focus:border-primary outline-none"
                />
              )}
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Currency</label>
              <CurrencySelect value={currency} onChange={setCurrency} />
            </div>
          </div>

          {/* Signature moment: live conversion to the group's home currency */}
          {currency !== group.home_currency && (
            <div className="rounded-xl border border-accent/30 bg-accent-tint px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-ink-soft mb-0.5">Converts to</p>
                <p className="num font-display text-2xl text-ink">
                  {rateLoading && !rate
                    ? '…'
                    : homeEquivalent !== null
                      ? formatMoney(homeEquivalent, group.home_currency)
                      : '—'}
                </p>
              </div>
              <p className="text-xs text-ink-soft text-right">
                {rateError ? (
                  <span className="text-owe">Rate unavailable</span>
                ) : rate ? (
                  <>
                    1 {currency} = {rate.toFixed(4)} {group.home_currency}
                    <br />
                    today's rate
                  </>
                ) : (
                  'fetching rate…'
                )}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm text-ink-soft mb-1.5">Paid by</label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === currentUserId ? 'You' : m.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="block text-sm text-ink-soft">Split between</label>
              <div className="flex rounded-full border border-line p-0.5 text-xs">
                {SPLIT_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSplitMode(mode.id)}
                    className={`px-3 py-1 rounded-full transition-colors whitespace-nowrap ${
                      splitMode === mode.id ? 'bg-primary text-on-primary' : 'text-ink-soft'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden">
              {members.map((m) => {
                const checked = participantIds.includes(m.user_id)
                return (
                  <li key={m.user_id} className="flex items-center justify-between px-3.5 py-2.5 gap-3">
                    <label className="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleParticipant(m.user_id)}
                        className="h-4 w-4 accent-primary shrink-0"
                      />
                      <span className="text-sm text-ink truncate">
                        {m.user_id === currentUserId ? 'You' : m.display_name}
                      </span>
                    </label>

                    {checked && splitMode === 'equal' && (
                      <span className="num text-sm text-ink-soft shrink-0">
                        {currency} {(equalShares[m.user_id] ?? 0).toFixed(2)}
                      </span>
                    )}

                    {checked && splitMode === 'percentage' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          inputMode="decimal"
                          value={percentageShares[m.user_id] ?? ''}
                          onChange={(e) =>
                            setPercentageShares((prev) => ({ ...prev, [m.user_id]: e.target.value }))
                          }
                          placeholder="0"
                          className="num w-16 text-right rounded-md border border-line bg-paper px-2 py-1 text-sm focus:border-primary outline-none"
                        />
                        <span className="text-sm text-ink-soft">%</span>
                        <span className="num text-xs text-ink-soft w-16 text-right">
                          {(percentageShareAmounts[m.user_id] ?? 0).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {checked && splitMode === 'exact' && (
                      <input
                        inputMode="decimal"
                        value={exactShares[m.user_id] ?? ''}
                        onChange={(e) => setExactShares((prev) => ({ ...prev, [m.user_id]: e.target.value }))}
                        placeholder="0.00"
                        className="num w-24 text-right rounded-md border border-line bg-paper px-2 py-1 text-sm focus:border-primary outline-none shrink-0"
                      />
                    )}
                  </li>
                )
              })}
            </ul>

            {splitMode === 'exact' && (
              <p className={`mt-1.5 text-xs ${exactMismatch ? 'text-owe' : 'text-ink-soft'}`}>
                {exactTotal.toFixed(2)} of {parsedAmount.toFixed(2)} {currency} assigned
              </p>
            )}
            {splitMode === 'percentage' && (
              <p className={`mt-1.5 text-xs ${percentageMismatch ? 'text-owe' : 'text-ink-soft'}`}>
                {percentageTotal.toFixed(1)}% of 100% assigned
              </p>
            )}

            {splitMode === 'itemized' && (
              <div className="mt-3 space-y-3">
                <ul className="space-y-2.5">
                  {items.map((it) => (
                    <li key={it.id} className="rounded-xl border border-line p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={it.description}
                          onChange={(e) => updateItem(it.id, { description: e.target.value })}
                          placeholder="Item"
                          className="flex-1 min-w-0 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm focus:border-primary outline-none"
                        />
                        <input
                          inputMode="decimal"
                          value={it.amount}
                          onChange={(e) => updateItem(it.id, { amount: e.target.value })}
                          placeholder="0.00"
                          className="num w-20 shrink-0 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm text-right focus:border-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          className="shrink-0 text-ink-soft hover:text-owe text-lg leading-none px-1"
                          aria-label="Remove item"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {participantIds.map((id) => {
                          const member = members.find((m) => m.user_id === id)
                          const active = it.participantIds.includes(id)
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => toggleItemParticipant(it.id, id)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                active
                                  ? 'bg-primary text-on-primary border-primary'
                                  : 'border-line text-ink-soft hover:border-primary'
                              }`}
                            >
                              {id === currentUserId ? 'You' : (member?.display_name ?? '—')}
                            </button>
                          )
                        })}
                      </div>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={addItem}
                  className="w-full rounded-xl border border-dashed border-line py-2 text-sm text-ink-soft hover:text-ink hover:border-primary transition-colors"
                >
                  + Add item
                </button>

                <div className="flex gap-3">
                  <div className="flex-1 flex items-center gap-2">
                    <label className="text-sm text-ink-soft shrink-0">Tax</label>
                    <input
                      inputMode="decimal"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      placeholder="0.00"
                      className="num flex-1 min-w-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-right focus:border-primary outline-none"
                    />
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <label className="text-sm text-ink-soft shrink-0">Tip</label>
                    <input
                      inputMode="decimal"
                      value={tip}
                      onChange={(e) => setTip(e.target.value)}
                      placeholder="0.00"
                      className="num flex-1 min-w-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-right focus:border-primary outline-none"
                    />
                  </div>
                </div>
                {(taxNum > 0 || tipNum > 0) && (
                  <p className="text-xs text-ink-soft">Both split proportionally to what each person ordered.</p>
                )}

                {participantIds.length > 0 && (
                  <ul className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                    {participantIds.map((id) => (
                      <li key={id} className="flex items-center justify-between px-3.5 py-2 text-sm">
                        <span className="text-ink truncate">
                          {id === currentUserId ? 'You' : members.find((m) => m.user_id === id)?.display_name}
                        </span>
                        <span className="num text-ink-soft shrink-0">
                          {currency} {(itemizedShares[id] ?? 0).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {splitMode !== 'exact' && splitMode !== 'itemized' && (
              <label className="mt-2.5 flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(e) => setSaveAsDefault(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Save this as the default split for this group
              </label>
            )}
          </div>

          <div>
            <label className="block text-sm text-ink-soft mb-1.5">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any extra context…"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
            />
          </div>

          {error && <p className="text-sm text-owe">{error}</p>}

          <button
            type="submit"
            disabled={saving || rateLoading}
            className="w-full rounded-full bg-primary text-on-primary font-medium py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </form>
    </div>
  )
}
