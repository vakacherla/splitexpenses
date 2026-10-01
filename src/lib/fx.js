// Live exchange rates via the Frankfurter API (https://frankfurter.dev),
// a free, keyless service built on European Central Bank reference rates.
// Rates publish once per weekday, so we cache aggressively.

const API_BASE = 'https://api.frankfurter.dev/v1'
const rateCache = new Map() // `${from}_${to}` -> { rate, date }
const CACHE_KEY = 'ledger_fx_cache_v1'
// Separate, unpersisted cache for historical (backdated) lookups, keyed by
// the specific date asked for. Kept apart from rateCache above so every
// existing "give me the current rate" caller (CSV import, the rates page,
// the offline-optimistic-display peek) is untouched by this — a historical
// rate for a specific past day never goes stale, but it's also only ever
// useful for that one day, so there's no reason to persist it across
// sessions the way "today's rate" is.
const historicalRateCache = new Map() // `${from}_${to}_${date}` -> rate

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
//
// `date` (optional, YYYY-MM-DD) is the day the conversion should reflect —
// an expense dated last week should convert at last week's rate, not
// today's, since the two can differ meaningfully even over a few days.
// Omitted, or today/in the future (a rate for tomorrow doesn't exist yet),
// this falls back to the existing "latest rate" behavior unchanged.
export async function getRate(from, to, date) {
  if (from === to) return 1
  const today = new Date().toISOString().slice(0, 10)
  const isHistorical = !!date && date < today

  if (isHistorical) {
    const historicalKey = `${from}_${to}_${date}`
    const cachedHistorical = historicalRateCache.get(historicalKey)
    if (cachedHistorical !== undefined) return cachedHistorical

    const res = await fetch(`${API_BASE}/${date}?base=${from}&symbols=${to}`)
    if (!res.ok) throw new Error(`Could not fetch the ${date} exchange rate for ${from} → ${to}`)
    const data = await res.json()
    const rate = data.rates?.[to]
    if (typeof rate !== 'number') throw new Error(`No rate available for ${from} → ${to} on ${date}`)
    historicalRateCache.set(historicalKey, rate)
    return rate
  }

  const key = `${from}_${to}`
  const cached = rateCache.get(key)
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

export async function convert(amount, from, to, date) {
  const rate = await getRate(from, to, date)
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
