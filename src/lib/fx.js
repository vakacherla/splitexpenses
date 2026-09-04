// Live exchange rates via the Frankfurter API (https://frankfurter.dev),
// a free, keyless service built on European Central Bank reference rates.
// Rates publish once per weekday, so we cache aggressively.

const API_BASE = 'https://api.frankfurter.dev/v1'
const rateCache = new Map() // `${from}_${to}` -> { rate, date }
const CACHE_KEY = 'ledger_fx_cache_v1'

function loadPersistedCache() {
  try {
    // localStorage, not sessionStorage — a rate from yesterday is far more
    // useful than losing it every time the tab closes, which matters for
    // offline mode's "stale is better than nothing" fallback below over a
    // multi-day trip with intermittent connectivity.
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    Object.entries(parsed).forEach(([key, value]) => rateCache.set(key, value))
  } catch {
    // ignore malformed cache
  }
}

function persistCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(rateCache)))
  } catch {
    // storage unavailable (private browsing, quota) — safe to skip
  }
}

loadPersistedCache()

// A practical fallback list in case the /currencies endpoint is unreachable.
export const FALLBACK_CURRENCIES = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', INR: 'Indian Rupee',
  JPY: 'Japanese Yen', CAD: 'Canadian Dollar', AUD: 'Australian Dollar',
  CHF: 'Swiss Franc', CNY: 'Chinese Yuan', SGD: 'Singapore Dollar',
  AED: 'UAE Dirham', MXN: 'Mexican Peso', ZAR: 'South African Rand',
  BRL: 'Brazilian Real', SEK: 'Swedish Krona', NZD: 'New Zealand Dollar',
  THB: 'Thai Baht', HKD: 'Hong Kong Dollar', KRW: 'South Korean Won',
  IDR: 'Indonesian Rupiah',
}

export async function fetchSupportedCurrencies() {
  try {
    const res = await fetch(`${API_BASE}/currencies`)
    if (!res.ok) throw new Error('bad response')
    const data = await res.json()
    return data
  } catch {
    return FALLBACK_CURRENCIES
  }
}

// Returns the multiplier such that `amount * rate` converts `from` -> `to`.
export async function getRate(from, to) {
  if (from === to) return 1
  const key = `${from}_${to}`
  const cached = rateCache.get(key)
  const today = new Date().toISOString().slice(0, 10)
  if (cached && cached.date === today) return cached.rate

  const res = await fetch(`${API_BASE}/latest?base=${from}&symbols=${to}`)
  if (!res.ok) {
    if (cached) return cached.rate // stale but better than nothing
    throw new Error(`Could not fetch exchange rate for ${from} → ${to}`)
  }
  const data = await res.json()
  const rate = data.rates?.[to]
  if (typeof rate !== 'number') {
    if (cached) return cached.rate
    throw new Error(`No rate available for ${from} → ${to}`)
  }
  rateCache.set(key, { rate, date: today })
  persistCache()
  return rate
}

// Synchronous, no network — reads whatever's already in the (persisted)
// cache without fetching. Used for optimistic display of an offline-queued
// expense's home-currency estimate before the sync engine resolves the
// real rate; returns null when nothing's cached yet for this pair, so
// callers can show "pending" rather than a fabricated number.
export function peekCachedRate(from, to) {
  if (from === to) return 1
  return rateCache.get(`${from}_${to}`)?.rate ?? null
}

export async function convert(amount, from, to) {
  const rate = await getRate(from, to)
  return amount * rate
}

// Fetches every rate for a base currency in one call, rather than one
// call per currency — what the rates page needs, and also warms the
// pair cache above for any of those pairs getRate() asks for later.
export async function getAllRates(base) {
  const cacheKey = `all_${base}`
  const cached = rateCache.get(cacheKey)
  const today = new Date().toISOString().slice(0, 10)
  if (cached && cached.date === today) return cached.rates

  const res = await fetch(`${API_BASE}/latest?base=${base}`)
  if (!res.ok) {
    if (cached) return cached.rates
    throw new Error(`Could not fetch exchange rates for ${base}`)
  }
  const data = await res.json()
  const rates = data.rates ?? {}
  rateCache.set(cacheKey, { rates, date: today })
  persistCache()
  return rates
}

export function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}
