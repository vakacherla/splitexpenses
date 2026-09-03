// Deep links only work with a payee identifier, which is exactly what
// Splitwise itself doesn't have either — it just links out to whatever
// payment app you already have. Each person sets their own handle once
// (Members tab); everyone in their groups can then pay them with the
// amount already filled in, instead of retyping it in another app.

export const PAYMENT_PROVIDERS = [
  { id: 'upi', label: 'UPI (Google Pay, PhonePe, Paytm…)', placeholder: 'yourname@bank' },
  { id: 'venmo', label: 'Venmo', placeholder: 'your-venmo-username' },
  { id: 'paypal', label: 'PayPal', placeholder: 'your-paypal.me-username' },
]

// `amount` should already be in whatever currency the payer is sending —
// callers pass the settlement's own currency/amount, not the group's home
// currency, since that's what actually gets typed into the payment app.
export function buildPaymentLink(provider, handle, amount, currency, note) {
  if (!provider || !handle) return null
  const amt = Number(amount).toFixed(2)

  if (provider === 'upi') {
    const params = new URLSearchParams({ pa: handle, am: amt, cu: currency })
    if (note) params.set('tn', note)
    return `upi://pay?${params.toString()}`
  }

  if (provider === 'venmo') {
    const params = new URLSearchParams({ txn: 'pay', recipients: handle, amount: amt })
    if (note) params.set('note', note)
    return `venmo://paycharge?${params.toString()}`
  }

  if (provider === 'paypal') {
    return `https://paypal.me/${encodeURIComponent(handle)}/${amt}${currency ? currency.toUpperCase() : ''}`
  }

  return null
}

export function paymentProviderLabel(provider) {
  return PAYMENT_PROVIDERS.find((p) => p.id === provider)?.label ?? provider
}
