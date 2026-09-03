import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchSupportedCurrencies, FALLBACK_CURRENCIES, getAllRates } from '../lib/fx'
import CurrencySelect from '../components/CurrencySelect'

export default function RatesPage() {
  const { user } = useAuth()
  const [base, setBase] = useState('USD')
  const [target, setTarget] = useState('INR')
  const [amount, setAmount] = useState('1')
  const [rates, setRates] = useState(null)
  const [currencies, setCurrencies] = useState(FALLBACK_CURRENCIES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSupportedCurrencies().then(setCurrencies)
  }, [])

  // Defaults the base to whatever currency shows up most among the
  // user's own groups, rather than an arbitrary USD — makes the page
  // useful immediately instead of needing to be reconfigured first.
  useEffect(() => {
    async function loadDefaultBase() {
      const { data } = await supabase.from('group_members').select('groups(home_currency)').eq('user_id', user.id)
      const counts = {}
      for (const row of data ?? []) {
        const c = row.groups?.home_currency
        if (c) counts[c] = (counts[c] ?? 0) + 1
      }
      const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (mostCommon) {
        setBase(mostCommon)
        setTarget((t) => (t === mostCommon ? 'USD' : t))
      }
    }
    loadDefaultBase()
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    getAllRates(base)
      .then((data) => {
        if (!cancelled) setRates(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [base])

  const parsedAmount = parseFloat(amount) || 0
  const convertedAmount = rates && typeof rates[target] === 'number' ? parsedAmount * rates[target] : null

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <div className="mb-6">
        <Link to="/dashboard" className="text-sm text-ink-soft hover:text-ink">
          ← Your groups
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Exchange rates</h1>
        <p className="text-sm text-ink-soft mt-0.5">
          The same source this app uses when converting an expense — Frankfurter, built on European Central
          Bank reference rates, refreshed each weekday. Informational only; it doesn't affect any expense
          you've already logged.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-paper-raised p-5 mb-8">
        <p className="text-xs text-ink-soft mb-2.5">Quick convert</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="num w-24 rounded-lg border border-line bg-paper px-3 py-2 text-ink focus:border-primary outline-none"
          />
          <CurrencySelect value={base} onChange={setBase} />
          <span className="text-ink-soft px-1">=</span>
          <span className="num font-display text-xl text-ink min-w-[5rem]">
            {convertedAmount !== null ? convertedAmount.toFixed(2) : '…'}
          </span>
          <CurrencySelect value={target} onChange={setTarget} />
        </div>
      </div>

      {error && <p className="text-sm text-owe mb-4">{error}</p>}

      <div>
        <h2 className="font-display text-lg text-ink mb-3">1 {base} equals</h2>
        {loading ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {Object.entries(currencies)
              .filter(([code]) => code !== base)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([code, name]) => (
                <li key={code} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">
                    {code} <span className="text-ink-soft">— {name}</span>
                  </span>
                  <span className="num text-ink-soft">
                    {typeof rates?.[code] === 'number' ? rates[code].toFixed(4) : '—'}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}
