// Live exchange rates via the Frankfurter API (https://frankfurter.dev),
// a free, keyless service built on European Central Bank reference rates.
// Rates publish once per weekday, so we cache aggressively.

const API_BASE = 'https://api.frankfurter.dev/v1'
// Back-up sources, used only when the ECB feed has no rate (it covers 30 currencies and leaves out
// AED, SAR, PKR and others). Same chain as the mobile app (checked against the ECB on 2026-10-07:
// majors within 0.1%-0.7%, and the two agree with each other on the Gulf / South Asian currencies).
const ER_API = 'https://open.er-api.com/v6/latest'
const CDN_API = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api'
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

// Currencies the back-up sources add to the ECB's 30.
export const EXTRA_CURRENCIES = {
  AED: 'UAE Dirham', SAR: 'Saudi Riyal', QAR: 'Qatari Riyal', KWD: 'Kuwaiti Dinar', BHD: 'Bahraini Dinar',
  OMR: 'Omani Rial', PKR: 'Pakistani Rupee', LKR: 'Sri Lankan Rupee', BDT: 'Bangladeshi Taka',
  NPR: 'Nepalese Rupee', EGP: 'Egyptian Pound', VND: 'Vietnamese Dong', MMK: 'Myanmar Kyat',
  KES: 'Kenyan Shilling', NGN: 'Nigerian Naira', MAD: 'Moroccan Dirham', JOD: 'Jordanian Dinar',
}

export async function fetchSupportedCurrencies() {
  try {
    const res = await fetch(`${API_BASE}/currencies`)
    if (!res.ok) throw new Error('bad response')
    const data = await res.json()
    return { ...EXTRA_CURRENCIES, ...data }
  } catch {
    return { ...EXTRA_CURRENCIES, ...FALLBACK_CURRENCIES }
  }
}

const isRate = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0

async function getJson(url) {
  try {
    const res = await fetch(url)
    return res && res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function backupTable(base, date) {
  if (!date) {
    const er = await getJson(`${ER_API}/${encodeURIComponent(base)}`)
    if (er && er.result !== 'error' && er.rates) return er.rates
  }
  const lower = base.toLowerCase()
  const cdn = await getJson(`${CDN_API}@${date ?? 'latest'}/v1/currencies/${lower}.json`)
  const table = cdn?.[lower]
  if (!table) return null
  return Object.fromEntries(Object.entries(table).map(([k, v]) => [k.toUpperCase(), v]))
}

// One pair from the back-up sources; null when neither has it. A past date can only come from the CDN source.
async function backupRate(from, to, date) {
  const table = await backupTable(from, date)
  const rate = table?.[to]
  if (isRate(rate)) return rate
  if (!date) {
    const cdn = await backupTable(from, undefined) // er-api failed or lacked it: try the CDN table too
    return isRate(cdn?.[to]) ? cdn[to] : null
  }
  return null
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
    let rate = null
    let failed = !res || !res.ok
    if (!failed) {
      const data = await res.json()
      rate = data.rates?.[to]
    }
    if (typeof rate !== 'number') {
      rate = await backupRate(from, to, date)
      if (rate === null) {
        throw new Error(failed ? `Could not fetch the ${date} exchange rate for ${from} → ${to}` : `No rate available for ${from} → ${to} on ${date}`)
      }
    }
    historicalRateCache.set(historicalKey, rate)
    return rate
  }

  const key = `${from}_${to}`
  const cached = rateCache.get(key)
  if (cached && cached.date === today) return cached.rate

  const res = await fetch(`${API_BASE}/latest?base=${from}&symbols=${to}`)
  const ecbFailed = !res || !res.ok
  let rate = ecbFailed ? undefined : (await res.json()).rates?.[to]
  if (typeof rate !== 'number') {
    rate = await backupRate(from, to)
    if (rate === null) {
      if (cached) return cached.rate // stale but better than nothing
      throw new Error(ecbFailed ? `Could not fetch exchange rate for ${from} → ${to}` : `No rate available for ${from} → ${to}`)
    }
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
  let rates
  if (!res || !res.ok) {
    rates = (await backupTable(base)) ?? null
    if (!rates) {
      if (cached) return cached.rates
      throw new Error(`Could not fetch exchange rates for ${base}`)
    }
  } else {
    const data = await res.json()
    rates = { ...(data.rates ?? {}) }
    if (Object.keys(EXTRA_CURRENCIES).some((c) => c !== base && rates[c] === undefined)) {
      const extra = await backupTable(base)
      if (extra) for (const c of Object.keys(EXTRA_CURRENCIES)) if (rates[c] === undefined && isRate(extra[c])) rates[c] = extra[c]
    }
  }
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
