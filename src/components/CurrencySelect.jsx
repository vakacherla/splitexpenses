import { useEffect, useState } from 'react'
import { fetchSupportedCurrencies, FALLBACK_CURRENCIES } from '../lib/fx'

export default function CurrencySelect({ value, onChange, id, className = '' }) {
  const [currencies, setCurrencies] = useState(FALLBACK_CURRENCIES)

  useEffect(() => {
    let cancelled = false
    fetchSupportedCurrencies().then((data) => {
      if (!cancelled) setCurrencies(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-line bg-paper px-3 py-2.5 text-ink focus:border-primary outline-none ${className}`}
    >
      {Object.entries(currencies)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, name]) => (
          <option key={code} value={code}>
            {code} — {name}
          </option>
        ))}
    </select>
  )
}
