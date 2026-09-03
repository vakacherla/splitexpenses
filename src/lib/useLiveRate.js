import { useEffect, useState } from 'react'
import { getRate } from './fx'

// Debounced live exchange-rate lookup: `from` -> `to`, such that
// `amount * rate` gives the converted amount. Returns 1 immediately when
// the currencies match, without hitting the network.
export function useLiveRate(from, to, { debounceMs = 300 } = {}) {
  const [rate, setRate] = useState(from === to ? 1 : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (from === to) {
      setRate(1)
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const handle = setTimeout(() => {
      getRate(from, to)
        .then((r) => {
          if (!cancelled) setRate(r)
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
  }, [from, to, debounceMs])

  return { rate, loading, error }
}
