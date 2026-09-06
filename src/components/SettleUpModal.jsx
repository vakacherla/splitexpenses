import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney } from '../lib/fx'
import { useLiveRate } from '../lib/useLiveRate'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { enqueue } from '../lib/offlineQueue'
import { buildPaymentLink, paymentProviderLabel } from '../lib/paymentLinks'
import { logActivity, notifyGroup } from '../lib/activity'
import { MAX_AMOUNT, isAmountTooLarge } from '../lib/amountBounds'
import CurrencySelect from './CurrencySelect'

export default function SettleUpModal({ group, suggestion, membersMap, currentUserId, onDone, onClose }) {
  const [currency, setCurrency] = useState(group.home_currency)
  const [amount, setAmount] = useState(suggestion.amount.toFixed(2))
  const [amountTouched, setAmountTouched] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const { rate, loading: rateLoading, error: rateError } = useLiveRate(currency, group.home_currency)
  const isOffline = !useOnlineStatus()

  // Until the person edits the amount by hand, keep it in sync with the
  // suggested debt converted into whatever currency they've picked.
  useEffect(() => {
    if (amountTouched || !rate) return
    setAmount((suggestion.amount / rate).toFixed(2))
  }, [rate, amountTouched, suggestion.amount])

  const fromName = suggestion.from === currentUserId ? 'You' : membersMap[suggestion.from]?.display_name
  const toName = suggestion.to === currentUserId ? 'You' : membersMap[suggestion.to]?.display_name
  const parsedAmount = parseFloat(amount) || 0
  const homeEquivalent = rate ? parsedAmount * rate : null

  // Only meaningful when the current person is the one paying — being
  // owed money isn't something you'd open a payment app for.
  const recipient = membersMap[suggestion.to]
  const isPayer = suggestion.from === currentUserId
  const paymentLink =
    isPayer && recipient?.payment_provider && recipient?.payment_handle && parsedAmount > 0
      ? buildPaymentLink(recipient.payment_provider, recipient.payment_handle, parsedAmount, currency, note || group.name)
      : null

  async function copyHandle() {
    try {
      await navigator.clipboard.writeText(recipient.payment_handle)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — the ID is still visible to copy by hand
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!parsedAmount || parsedAmount <= 0) return setError('Enter an amount greater than zero.')
    if (isAmountTooLarge(parsedAmount)) return setError(`Amount can't be more than ${MAX_AMOUNT.toLocaleString()}.`)

    setError('')
    setSaving(true)

    // Offline: queue it rather than attempting a network call that can't
    // succeed — same reasoning as AddExpenseForm, and the rate itself is
    // resolved for real once the sync engine actually runs, online.
    if (isOffline) {
      enqueue({
        type: 'settlement.create',
        entityId: crypto.randomUUID(),
        groupId: group.id,
        payload: {
          from_user: suggestion.from,
          to_user: suggestion.to,
          currency,
          amount: parsedAmount,
          note: note.trim() || null,
          created_by: currentUserId,
          homeCurrency: group.home_currency,
          // Stashed for the same reason AddExpenseForm stashes these —
          // offlineQueue.js's sync-time apply has no access to membersMap/group.
          actorName: membersMap[currentUserId]?.display_name ?? 'Someone',
          groupName: group.name,
        },
      })
      setSaving(false)
      onDone()
      return
    }

    if (!rate) {
      setSaving(false)
      return setError('Still fetching the exchange rate — try again in a moment.')
    }

    const { data: settlement, error } = await supabase
      .from('settlements')
      .insert({
        group_id: group.id,
        from_user: suggestion.from,
        to_user: suggestion.to,
        currency,
        amount: parsedAmount,
        exchange_rate: rate,
        amount_in_home: Math.round(parsedAmount * rate * 100) / 100,
        note: note.trim() || null,
        created_by: currentUserId,
      })
      .select()
      .single()
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }

    const actorName = membersMap[currentUserId]?.display_name ?? 'Someone'
    const amountText = `${parsedAmount} ${currency}`
    logActivity({
      groupId: group.id,
      actorId: currentUserId,
      actorName,
      eventType: 'settlement_added',
      summary: amountText,
      entityId: settlement.id,
    })
    const otherParty = suggestion.from === currentUserId ? suggestion.to : suggestion.from
    notifyGroup({
      groupId: group.id,
      targetUserIds: [otherParty],
      title: group.name,
      body: `${actorName} recorded a payment: ${amountText}`,
      url: `/groups/${group.id}`,
    })

    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-sm bg-paper-raised rounded-t-3xl sm:rounded-2xl border border-line shadow-raised p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Record payment</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-sm">
            Close
          </button>
        </div>
        <p className="text-sm text-ink-soft">
          <span className="font-medium text-ink">{fromName}</span> paying{' '}
          <span className="font-medium text-ink">{toName}</span>
          {' — the debt is '}
          {formatMoney(suggestion.amount, group.home_currency)}
        </p>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-ink-soft mb-1.5">Amount paid</label>
            <input
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setAmountTouched(true)
              }}
              className="num w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink text-lg focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-ink-soft mb-1.5">In</label>
            <CurrencySelect value={currency} onChange={setCurrency} />
          </div>
        </div>

        {currency !== group.home_currency && (
          <div className="rounded-xl border border-accent/30 bg-accent-tint px-4 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-ink-soft mb-0.5">Equivalent to</p>
              <p className="num font-display text-lg text-ink">
                {rateLoading && !rate
                  ? '…'
                  : homeEquivalent !== null
                    ? formatMoney(homeEquivalent, group.home_currency)
                    : '—'}
              </p>
            </div>
            {rateError && <p className="text-xs text-owe">Rate unavailable</p>}
          </div>
        )}

        {paymentLink && (
          <div className="space-y-2">
            <a
              href={paymentLink}
              className="flex items-center justify-center gap-2 rounded-full border border-primary text-primary text-sm font-medium py-2.5 hover:bg-primary-tint transition-colors"
            >
              Pay {formatMoney(parsedAmount, currency)} via {paymentProviderLabel(recipient.payment_provider)}
            </a>
            {/* Not every payment app registers itself to catch this kind of
                link — bank apps especially, and there's no way to detect
                whether one actually opened. This is the fallback: read or
                copy the ID and pay manually in whatever app you actually
                use. */}
            <div className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2">
              <span className="text-xs text-ink-soft truncate">
                {paymentProviderLabel(recipient.payment_provider)}:{' '}
                <span className="text-ink">{recipient.payment_handle}</span>
              </span>
              <button
                type="button"
                onClick={copyHandle}
                className="text-xs font-medium text-primary hover:underline shrink-0 ml-2"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-ink-soft">
              If the button above doesn't open your payment app, copy the ID and pay manually instead.
            </p>
          </div>
        )}
        {isPayer && !recipient?.payment_handle && (
          <p className="text-xs text-ink-soft">
            {toName} hasn't added a payment handle yet — ask them to add one on the Members tab for a one-tap pay
            link here next time.
          </p>
        )}

        <div>
          <label className="block text-sm text-ink-soft mb-1.5">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cash, UPI, bank transfer…"
            className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
          />
        </div>

        {error && <p className="text-sm text-owe">{error}</p>}

        <button
          type="submit"
          disabled={saving || (rateLoading && !isOffline)}
          className="w-full rounded-full bg-primary text-on-primary font-medium py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Confirm payment'}
        </button>
      </form>
    </div>
  )
}
