import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney } from '../lib/fx'
import { useLiveRate } from '../lib/useLiveRate'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { enqueue } from '../lib/offlineQueue'
import { splitEvenly, splitByPercentages, splitItemized } from '../lib/split'
import { logActivity, notifyGroup } from '../lib/activity'
import { CATEGORIES } from '../lib/categories'
import { validateDateInRange, MIN_TRIP_DATE, MAX_TRIP_DATE } from '../lib/tripDates'
import { MAX_AMOUNT, isAmountTooLarge } from '../lib/amountBounds'
import CurrencySelect from './CurrencySelect'
import HelpLink from './HelpLink'

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

export default function AddExpenseForm({ group, members, currentUserId, editingExpense, duplicateFrom, onAdded, onClose }) {
  const defaultSplit = group.default_split ?? null
  const memberIds = members.map((m) => m.user_id)
  // Duplicating pre-fills the same starting fields as editing, but always
  // creates a new expense (editingExpense stays null) — see handleSubmit,
  // which branches on editingExpense alone. Date is deliberately NOT
  // seeded from this — a duplicated expense defaults to today, same as a
  // fresh add, since "log this again" usually means a new occurrence, not
  // a correction to when the original happened.
  const seed = editingExpense ?? duplicateFrom

  const [description, setDescription] = useState(seed?.description ?? '')
  const [category, setCategory] = useState(seed?.category ?? 'Misc')
  const [amount, setAmount] = useState(seed ? String(seed.amount) : '')
  const [currency, setCurrency] = useState(seed?.currency ?? group.home_currency)
  const [paidBy, setPaidBy] = useState(seed?.paid_by ?? currentUserId)
  const [date, setDate] = useState(editingExpense?.expense_date ?? (() => new Date().toISOString().slice(0, 10)))
  const [note, setNote] = useState(editingExpense?.note ?? '')
  const [participantIds, setParticipantIds] = useState(() => {
    if (seed) return seed.expense_splits.map((s) => s.user_id)
    const saved = defaultSplit?.participant_ids?.filter((id) => memberIds.includes(id))
    return saved?.length ? saved : memberIds
  })
  const [splitMode, setSplitMode] = useState(() => seed?.split_type ?? defaultSplit?.split_mode ?? 'equal')
  const [exactShares, setExactShares] = useState(() => {
    if (seed?.split_type === 'exact') {
      return Object.fromEntries(seed.expense_splits.map((s) => [s.user_id, String(s.share_amount)]))
    }
    return {}
  }) // user_id -> string
  const [percentageShares, setPercentageShares] = useState(() => {
    if (seed?.split_type === 'percentage') {
      return Object.fromEntries(seed.expense_splits.map((s) => [s.user_id, String(s.percentage)]))
    }
    if (defaultSplit?.split_mode === 'percentage' && defaultSplit.percentages) {
      return Object.fromEntries(Object.entries(defaultSplit.percentages).map(([k, v]) => [k, String(v)]))
    }
    return {}
  })
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const [items, setItems] = useState(() => {
    if (seed?.split_type === 'itemized' && Array.isArray(seed.items)) {
      return seed.items.map((it) => ({
        id: crypto.randomUUID(),
        description: it.description ?? '',
        amount: String(it.amount),
        participantIds: it.participant_ids ?? [],
      }))
    }
    return []
  }) // { id, description, amount: string, participantIds: string[] }
  const [tax, setTax] = useState(seed?.tax ? String(seed.tax) : '') // split proportionally by item subtotal
  const [tip, setTip] = useState(seed?.tip ? String(seed.tip) : '') // split proportionally by item subtotal
  // True right after switching to Itemized seeds one item with the whole
  // prior total (see handleSplitModeChange) — explains that lump sum
  // rather than letting someone add Tax/Tip on top of it unknowingly.
  const [showSeedHint, setShowSeedHint] = useState(false)

  const [receiptFile, setReceiptFile] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const fileInputRef = useRef(null)

  const [sentenceText, setSentenceText] = useState('')
  const [parsingText, setParsingText] = useState(false)
  const [parseError, setParseError] = useState('')

  // Plain attach (no OCR) while editing — separate from the scan flow
  // above, which stays hidden in edit mode so re-scanning can't overwrite
  // fields being fixed by hand. Tracked locally since `editingExpense` is
  // just a prop snapshot and won't reflect a successful upload on its own.
  const [editReceiptPath, setEditReceiptPath] = useState(editingExpense?.receipt_path ?? null)
  const [attachingReceipt, setAttachingReceipt] = useState(false)
  const [attachReceiptError, setAttachReceiptError] = useState('')
  const editAttachInputRef = useRef(null)

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const { rate, loading: rateLoading, error: rateError } = useLiveRate(currency, group.home_currency)
  const isOffline = !useOnlineStatus()

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
  const percentageOutOfRange =
    splitMode === 'percentage' &&
    participantIds.some((id) => {
      const p = parseFloat(percentageShares[id])
      return Number.isFinite(p) && (p < 0 || p > 100)
    })

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

  // Itemized mode computes its total from line items rather than the
  // plain amount field — switching to it with no items yet otherwise
  // silently drops whatever total was already entered (or, when editing,
  // already saved). Seeding one starting item with that amount means
  // exploring split modes never loses the number you started with.
  function handleSplitModeChange(modeId) {
    if (modeId === 'itemized' && splitMode !== 'itemized' && items.length === 0) {
      const priorTotal = parseFloat(amount) || 0
      if (priorTotal > 0) {
        setItems([
          {
            id: crypto.randomUUID(),
            description: description.trim() || 'Item',
            amount: priorTotal.toFixed(2),
            participantIds: [...participantIds],
          },
        ])
        setShowSeedHint(true)
      }
    }
    setSplitMode(modeId)
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', amount: '', participantIds: [...participantIds] },
    ])
    setShowSeedHint(false)
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id))
    setShowSeedHint(false)
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

  async function handleParseSentence() {
    const text = sentenceText.trim()
    if (!text) return
    setParsingText(true)
    setParseError('')
    try {
      const { data, error } = await supabase.functions.invoke('parse-expense-text', {
        body: {
          text,
          members: members.map((m) => ({ id: m.user_id, name: m.display_name, isSelf: m.user_id === currentUserId })),
          homeCurrency: group.home_currency,
          today: new Date().toISOString().slice(0, 10),
        },
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
      setSplitMode('equal')
      setPaidBy(memberIds.includes(data?.payer_id) ? data.payer_id : currentUserId)
      const parsedParticipants = Array.isArray(data?.participant_ids)
        ? data.participant_ids.filter((id) => memberIds.includes(id))
        : []
      setParticipantIds(parsedParticipants.length > 0 ? parsedParticipants : memberIds)
    } catch (err) {
      setParseError(err.message || "Couldn't parse that — you can still fill this in by hand.")
    } finally {
      setParsingText(false)
    }
  }

  function removeReceipt() {
    setReceiptFile(null)
    setScanError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleAttachReceiptInEdit(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachingReceipt(true)
    setAttachReceiptError('')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${group.id}/${editingExpense.id}.${ext}`
    const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file, { upsert: true })
    if (uploadError) {
      setAttachingReceipt(false)
      setAttachReceiptError(uploadError.message)
      return
    }
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ receipt_path: path })
      .eq('id', editingExpense.id)
    setAttachingReceipt(false)
    if (updateError) {
      setAttachReceiptError(updateError.message)
      return
    }
    setEditReceiptPath(path)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!description.trim()) return setError('Give the expense a short description.')
    const dateCheck = validateDateInRange(date, 'Date')
    if (!dateCheck.valid) return setError(dateCheck.error)
    if (taxNum < 0) return setError('Tax cannot be negative.')
    if (tipNum < 0) return setError('Tip cannot be negative.')
    if (splitMode === 'itemized') {
      if (items.length === 0) return setError('Add at least one item.')
      if (items.some((it) => !it.description.trim() || !(parseFloat(it.amount) > 0))) {
        return setError('Give every item a description and an amount greater than zero.')
      }
      if (items.some((it) => isAmountTooLarge(parseFloat(it.amount)))) {
        return setError(`An item's amount can't be more than ${MAX_AMOUNT.toLocaleString()}.`)
      }
      if (items.some((it) => it.participantIds.filter((id) => participantIds.includes(id)).length === 0)) {
        return setError('Assign every item to at least one person.')
      }
    }
    if (parsedAmount <= 0) return setError('Enter an amount greater than zero.')
    if (isAmountTooLarge(parsedAmount)) return setError(`Amount can't be more than ${MAX_AMOUNT.toLocaleString()}.`)
    if (participantIds.length === 0) return setError('Pick at least one person to split with.')
    if (percentageOutOfRange) return setError('Each person’s percentage must be between 0 and 100.')
    if (exactMismatch) return setError(`Exact shares add up to ${exactTotal.toFixed(2)}, not ${parsedAmount.toFixed(2)}.`)
    if (percentageMismatch) return setError(`Percentages add up to ${percentageTotal.toFixed(1)}%, not 100%.`)

    const shareSourceOriginal =
      splitMode === 'equal'
        ? equalShares
        : splitMode === 'percentage'
          ? percentageShareAmounts
          : splitMode === 'itemized'
            ? itemizedShares
            : Object.fromEntries(participantIds.map((id) => [id, parseFloat(exactShares[id]) || 0]))

    const itemsPayload =
      splitMode === 'itemized'
        ? items.map((it) => ({
            description: it.description.trim(),
            amount: Math.round((parseFloat(it.amount) || 0) * 100) / 100,
            participant_ids: it.participantIds.filter((id) => participantIds.includes(id)),
          }))
        : null

    const splitsPayload = participantIds.map((userId) => ({
      user_id: userId,
      share_amount: shareSourceOriginal[userId] ?? 0,
      percentage: splitMode === 'percentage' ? parseFloat(percentageShares[userId]) || 0 : null,
    }))

    // Offline: the whole insert/update round trip needs a network call it
    // doesn't have, not just the exchange rate — so this branches before
    // ever touching Supabase, queuing the write instead. The rate itself
    // is deliberately left unresolved here (see offlineQueue.js) and
    // computed for real once the sync engine actually runs, online.
    if (isOffline) {
      setSaving(true)
      const entityId = editingExpense?.id ?? crypto.randomUUID()
      const payload = {
        description: description.trim(),
        paid_by: paidBy,
        currency,
        amount: parsedAmount,
        expense_date: date,
        split_type: splitMode,
        category,
        note: note.trim() || null,
        items: itemsPayload,
        tax: splitMode === 'itemized' ? taxNum : null,
        tip: splitMode === 'itemized' ? tipNum : null,
        created_by: currentUserId,
        homeCurrency: group.home_currency,
        splits: splitsPayload,
        // Stashed here since offlineQueue.js's sync-time apply has no
        // access to `members`/`group` — same reasoning homeCurrency is
        // already stashed for the rate lookup it also can't otherwise do.
        actorName: members.find((m) => m.user_id === currentUserId)?.display_name ?? 'Someone',
        groupName: group.name,
        memberIds,
      }
      enqueue(
        editingExpense
          ? {
              type: 'expense.update',
              entityId,
              groupId: group.id,
              expectedUpdatedAt: editingExpense.updated_at ?? null,
              payload,
            }
          : { type: 'expense.create', entityId, groupId: group.id, payload }
      )
      setSaving(false)
      onAdded()
      return
    }

    // Only the amount and currency actually determine whether a fresh
    // exchange rate is needed — fixing a typo in the description or
    // reassigning the split shouldn't silently shift amount_in_home just
    // because today's rate happens to differ from the day this was
    // entered. That's the same "locked-in historical rate" principle the
    // add flow already relies on, just also honored on the way back out.
    const rateChanged =
      !editingExpense || currency !== editingExpense.currency || Math.abs(parsedAmount - editingExpense.amount) > 0.005
    if (rateChanged && !rate) return setError('Still fetching the exchange rate — try again in a moment.')

    setSaving(true)

    const finalRate = rateChanged ? rate : editingExpense.exchange_rate
    const amountInHome = rateChanged ? Math.round(parsedAmount * finalRate * 100) / 100 : editingExpense.amount_in_home

    const expensePayload = {
      description: description.trim(),
      paid_by: paidBy,
      currency,
      amount: parsedAmount,
      exchange_rate: finalRate,
      amount_in_home: amountInHome,
      expense_date: date,
      split_type: splitMode,
      category,
      note: note.trim() || null,
      items: itemsPayload,
      tax: splitMode === 'itemized' ? taxNum : null,
      tip: splitMode === 'itemized' ? tipNum : null,
    }

    const { data: expense, error: expenseError } = editingExpense
      ? await supabase.from('expenses').update(expensePayload).eq('id', editingExpense.id).select().single()
      : await supabase
          .from('expenses')
          .insert({ ...expensePayload, group_id: group.id, created_by: currentUserId })
          .select()
          .single()

    if (expenseError) {
      setError(expenseError.message)
      setSaving(false)
      return
    }

    // Editing replaces the whole split rather than diffing row by row —
    // simpler, and correct here since a fresh set is always computed from
    // the current form state anyway (same as a new expense would be).
    if (editingExpense) {
      const { error: deleteError } = await supabase.from('expense_splits').delete().eq('expense_id', expense.id)
      if (deleteError) {
        setSaving(false)
        setError(deleteError.message)
        return
      }
    }

    const splitRows = splitsPayload.map((s) => ({
      expense_id: expense.id,
      user_id: s.user_id,
      share_amount: s.share_amount,
      share_in_home: Math.round(s.share_amount * finalRate * 100) / 100,
      percentage: s.percentage,
    }))

    const { error: splitError } = await supabase.from('expense_splits').insert(splitRows)
    if (splitError) {
      setSaving(false)
      setError(splitError.message)
      return
    }

    // Best-effort extras — the expense itself is already safely saved, so a
    // failure in either of these shouldn't block closing the form.
    const actorName = members.find((m) => m.user_id === currentUserId)?.display_name ?? 'Someone'
    const expenseSummary = `${description.trim()} — ${parsedAmount} ${currency}`
    if (editingExpense) {
      logActivity({
        groupId: group.id,
        actorId: currentUserId,
        actorName,
        eventType: 'expense_edited',
        summary: expenseSummary,
        entityId: expense.id,
      })
    } else {
      logActivity({
        groupId: group.id,
        actorId: currentUserId,
        actorName,
        eventType: 'expense_added',
        summary: expenseSummary,
        entityId: expense.id,
      })
      const otherMembers = memberIds.filter((id) => id !== currentUserId)
      notifyGroup({
        groupId: group.id,
        targetUserIds: otherMembers,
        title: group.name,
        body: `${actorName} added an expense: ${expenseSummary}`,
        url: `/trips/${group.id}`,
      })
    }

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
          <h2 className="font-display text-xl text-ink">
            {editingExpense ? 'Edit expense' : duplicateFrom ? 'Duplicate expense' : 'Add an expense'}
          </h2>
          <div className="flex items-center gap-3">
            <HelpLink to="adding-expense" />
            <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm">
              Close
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-6 pb-6 space-y-5">
          {!editingExpense && isOffline && (
            <div className="flex items-center gap-2 rounded-xl border border-owe/40 bg-owe-tint px-3.5 py-3 text-sm text-owe">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path d="M10 3.3 17.3 16H2.7L10 3.3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M10 8.3v3.3M10 14h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Scanning a receipt or parsing a sentence needs a connection — fill this in by hand for now, and
              attach a photo later by editing it.
            </div>
          )}

          {!editingExpense && !isOffline && (
            <div>
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5">
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true">
                  <path
                    d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v6A1.5 1.5 0 0 1 15.5 13H9l-3 2.5V13H4.5A1.5 1.5 0 0 1 3 11.5v-6Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
                <input
                  value={sentenceText}
                  onChange={(e) => setSentenceText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleParseSentence()
                    }
                  }}
                  placeholder="Or describe it: “lunch 24.50 split with Anna and Ben”"
                  disabled={parsingText}
                  className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-soft outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleParseSentence}
                  disabled={parsingText || !sentenceText.trim()}
                  className="text-xs font-medium text-primary hover:underline shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {parsingText ? 'Parsing…' : 'Parse'}
                </button>
              </div>
              {parseError && <p className="mt-1.5 text-xs text-owe">{parseError}</p>}
            </div>
          )}

          {!editingExpense && !isOffline && (
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
          )}

          {editingExpense && editingExpense._pendingSync && !editReceiptPath && (
            <p className="text-xs text-ink-soft italic">Attach a receipt once this syncs.</p>
          )}

          {editingExpense && !editingExpense._pendingSync && (
            <div>
              <input
                ref={editAttachInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAttachReceiptInEdit}
              />
              {editReceiptPath ? (
                <p className="text-sm text-ink-soft">📎 Receipt attached</p>
              ) : (
                <button
                  type="button"
                  onClick={() => editAttachInputRef.current?.click()}
                  disabled={attachingReceipt}
                  className="text-sm font-medium text-accent hover:underline disabled:opacity-50"
                >
                  {attachingReceipt ? 'Attaching…' : '+ Attach a receipt'}
                </button>
              )}
              {attachReceiptError && <p className="mt-1.5 text-xs text-owe">{attachReceiptError}</p>}
            </div>
          )}

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
                {isOffline && !rate ? (
                  "We'll fetch today's rate once you're back online"
                ) : rateError ? (
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
                min={MIN_TRIP_DATE}
                max={MAX_TRIP_DATE}
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
                    onClick={() => handleSplitModeChange(mode.id)}
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

                {showSeedHint && (
                  <p className="text-xs text-accent">
                    Includes the full original amount — split it into real items and add Tax/Tip below if you want a
                    detailed breakdown.
                  </p>
                )}

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

            {!editingExpense && splitMode !== 'exact' && splitMode !== 'itemized' && (
              <label className="mt-2.5 flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(e) => setSaveAsDefault(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Save this as the default split for this trip
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
            disabled={saving || (rateLoading && !isOffline)}
            className="w-full rounded-full bg-primary text-on-primary font-medium py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : editingExpense ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </form>
    </div>
  )
}
