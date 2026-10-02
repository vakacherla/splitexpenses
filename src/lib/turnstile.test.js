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
