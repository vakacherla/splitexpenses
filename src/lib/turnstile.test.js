import { describe, it, expect } from 'vitest'
import { captchaOptions, TURNSTILE_SITE_KEY } from './turnstile'

describe('captchaOptions', () => {
  it('wraps a token for supabase-js', () => {
    expect(captchaOptions('abc')).toEqual({ captchaToken: 'abc' })
  })

  it('adds nothing when there is no token', () => {
    expect(captchaOptions(null)).toEqual({})
    expect(captchaOptions('')).toEqual({})
  })

  it('has a site key', () => {
    expect(TURNSTILE_SITE_KEY.length).toBeGreaterThan(10)
  })
})

import { assertNoTestKeyInProduction, isTestSiteKey, TEST_SITE_KEYS } from './turnstileKeys'

describe('Turnstile test keys must never reach production', () => {
  it('recognises Cloudflare\'s three published test keys', () => {
    for (const k of TEST_SITE_KEYS) expect(isTestSiteKey(k)).toBe(true)
    expect(isTestSiteKey(' 1x00000000000000000000AA ')).toBe(true)
  })

  it('does not mistake the real key, or nothing, for a test key', () => {
    expect(isTestSiteKey(TURNSTILE_SITE_KEY)).toBe(false)
    expect(isTestSiteKey('')).toBe(false)
    expect(isTestSiteKey(undefined)).toBe(false)
  })

  it('refuses a production build that carries a test key', () => {
    expect(() => assertNoTestKeyInProduction({ VERCEL_ENV: 'production', VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' })).toThrow(/production build/)
    expect(() => assertNoTestKeyInProduction({ VERCEL_ENV: 'production', VITE_TURNSTILE_SITE_KEY: '3x00000000000000000000FF' })).toThrow()
  })

  it('allows a test key on preview and local builds', () => {
    expect(() => assertNoTestKeyInProduction({ VERCEL_ENV: 'preview', VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' })).not.toThrow()
    expect(() => assertNoTestKeyInProduction({ VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' })).not.toThrow()
  })

  it('allows the real key or no key in production', () => {
    expect(() => assertNoTestKeyInProduction({ VERCEL_ENV: 'production', VITE_TURNSTILE_SITE_KEY: 'real-looking-key' })).not.toThrow()
    expect(() => assertNoTestKeyInProduction({ VERCEL_ENV: 'production' })).not.toThrow()
  })
})
