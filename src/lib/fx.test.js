import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatMoney, getRate } from './fx'

describe('formatMoney', () => {
  it('formats a valid currency without throwing', () => {
    expect(() => formatMoney(1234.5, 'INR')).not.toThrow()
    expect(() => formatMoney(1234.5, 'USD')).not.toThrow()
  })

  it('includes the numeric amount for a valid currency', () => {
    const result = formatMoney(1234.5, 'USD')
    expect(result).toMatch(/1,?234\.50/)
  })

  it('falls back to "amount CODE" for an unrecognized currency code rather than throwing', () => {
    const result = formatMoney(42, 'NOTACURRENCY')
    expect(result).toBe('42.00 NOTACURRENCY')
  })

  it('rounds to two decimal places in the fallback path', () => {
    const result = formatMoney(9.999, 'NOTACURRENCY')
    expect(result).toBe('10.00 NOTACURRENCY')
  })
})

describe('getRate', () => {
  const today = new Date().toISOString().slice(0, 10)

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('returns 1 immediately for same-currency pairs, without hitting the network', async () => {
    const rate = await getRate('USD', 'USD')
    expect(rate).toBe(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('hits the latest endpoint, not a historical one, when no date is given', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ rates: { EUR: 0.9 } }) })
    const rate = await getRate('USD', 'EUR')
    expect(rate).toBe(0.9)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/latest?base=USD&symbols=EUR'))
  })

  it("hits the latest endpoint for today's date explicitly, not a historical one", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ rates: { GBP: 0.8 } }) })
    const rate = await getRate('USD', 'GBP', today)
    expect(rate).toBe(0.8)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/latest?base=USD&symbols=GBP'))
  })

  it('hits the historical endpoint for that specific date when it is in the past', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ rates: { JPY: 150 } }) })
    const rate = await getRate('USD', 'JPY', '2020-01-15')
    expect(rate).toBe(150)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/2020-01-15?base=USD&symbols=JPY'))
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/latest'))
  })

  it('caches a historical rate so a repeat lookup for the same date does not refetch', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ rates: { INR: 83 } }) })
    const first = await getRate('USD', 'INR', '2021-06-01')
    const second = await getRate('USD', 'INR', '2021-06-01')
    expect(first).toBe(83)
    expect(second).toBe(83)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('treats a future date the same as no date, using the latest rate', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ rates: { CAD: 1.35 } }) })
    const farFuture = '2099-01-01'
    const rate = await getRate('USD', 'CAD', farFuture)
    expect(rate).toBe(1.35)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/latest?base=USD&symbols=CAD'))
  })

  it('throws a clear error when the historical endpoint responds with a failure', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false })
    await expect(getRate('USD', 'AUD', '2019-03-03')).rejects.toThrow(/2019-03-03/)
  })
})

describe('back-up rate sources (currencies the ECB lacks)', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('uses open.er-api.com when the ECB feed has no rate (AED)', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'not found' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 'success', rates: { AED: 3.6725 } }) })
    expect(await getRate('USD', 'AED')).toBe(3.6725)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('open.er-api.com/v6/latest/USD'))
  })

  it('falls through to the CDN source when open.er-api.com fails', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ usd: { sar: 3.75 } }) })
    expect(await getRate('USD', 'SAR')).toBe(3.75)
  })

  it('a past date for an ECB-less currency comes from the dated CDN source only', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ usd: { pkr: 276.5 } }) })
    expect(await getRate('USD', 'PKR', '2026-09-30')).toBe(276.5)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('@2026-09-30/v1/currencies/usd.json'))
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('open.er-api.com'))
  })

  it('still throws a plain error when every source fails', async () => {
    global.fetch.mockResolvedValue({ ok: false })
    await expect(getRate('USD', 'QAR')).rejects.toThrow(/exchange rate/)
  })

  it('ignores zero, negative and non-numeric back-up rates', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 'success', rates: { BDT: 0 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ usd: { bdt: 'x' } }) })
    await expect(getRate('USD', 'BDT')).rejects.toThrow()
  })
})
