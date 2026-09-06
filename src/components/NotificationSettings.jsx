import { useEffect, useState } from 'react'
import { pushSupported, getExistingSubscription, enablePush, disablePush } from '../lib/push'

export default function NotificationSettings({ userId }) {
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!pushSupported()) {
      setChecked(true)
      return
    }
    getExistingSubscription()
      .then((sub) => setSubscribed(Boolean(sub)))
      .finally(() => setChecked(true))
  }, [])

  async function handleToggle() {
    setBusy(true)
    setError('')
    try {
      if (subscribed) {
        await disablePush()
        setSubscribed(false)
      } else {
        await enablePush(userId)
        setSubscribed(true)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    }
    setBusy(false)
  }

  if (!checked) return null

  return (
    <div>
      <h2 className="font-display text-lg text-ink mb-1">Notifications</h2>
      <p className="text-sm text-ink-soft mb-3">
        Get a nudge on this device when something happens in your trips — a new expense, a payment recorded,
        or a settle-up reminder (from someone directly, or automatically once a trip's end date passes).
      </p>
      {!pushSupported() ? (
        <p className="text-sm text-ink-soft italic">
          This browser doesn't support notifications. They still work over email regardless.
        </p>
      ) : (
        <>
          <button
            onClick={handleToggle}
            disabled={busy}
            className={`rounded-full text-sm font-medium px-4 py-2 transition-colors disabled:opacity-60 ${
              subscribed
                ? 'border border-line text-ink hover:border-owe hover:text-owe'
                : 'bg-primary text-on-primary hover:bg-primary-dark'
            }`}
          >
            {busy ? 'Working…' : subscribed ? 'Disable on this device' : 'Enable on this device'}
          </button>
          {error && <p className="mt-2 text-sm text-owe">{error}</p>}
        </>
      )}
    </div>
  )
}
