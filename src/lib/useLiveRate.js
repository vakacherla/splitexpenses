import { useEffect, useState } from 'react'
import { getRate } from './fx'

// The rate is only valid for the exact (from, to, date) it was fetched for.
// RES-10: the hook used to keep whatever `rate` it last held when the
// currency changed, so a form opened in the home currency (rate 1) and then
// switched to EUR kept using 1.0 until — or, if the FX API was down,
// instead of — a real lookup, and a EUR expense could be saved as if it
// were the same amount in the home currency. Keying the result makes a
// stale rate unreachable by construction.
export function rateForKey(result, key, sameCurrency) {
  if (sameCurrency) return 1
  return result.key === key ? result.rate : null
}

// Debounced live exchange-rate lookup: `from` -> `to`, such that
// `amount * rate` gives the converted amount. Returns 1 immediately when
// the currencies match, without hitting the network. `date` (optional),
// when it's in the past, fetches that day's historical rate instead of
// today's — see getRate in fx.js.
export function useLiveRate(from, to, { date, debounceMs = 300 } = {}) {
  const key = `${from}|${to}|${date ?? ''}`
  const [result, setResult] = useState({ key: null, rate: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (from === to) {
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const handle = setTimeout(() => {
      getRate(from, to, date)
        .then((r) => {
          if (!cancelled) setResult({ key, rate: r })
        })
        .catch((err) => {
          if (!cancelled) setError(err.message)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, debounceMs)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [from, to, date, debounceMs, key])

  return { rate: rateForKey(result, key, from === to), loading, error }
}
