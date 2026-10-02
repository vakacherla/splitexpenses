import { describe, it, expect } from 'vitest'
import { adminMailtoLink, isBannedAuthError } from './suspension'

describe('adminMailtoLink', () => {
  it('returns null when no administrator address is configured', () => {
    expect(adminMailtoLink('me@example.com', '')).toBeNull()
  })

  it('builds a mailto link with the subject and account filled in', () => {
    const link = adminMailtoLink('me@example.com', 'admin@example.org')
    expect(link.startsWith('mailto:admin@example.org?subject=')).toBe(true)
    expect(decodeURIComponent(link)).toContain('Account: me@example.com')
    expect(decodeURIComponent(link)).toContain('account is suspended')
  })

  it('omits the account line when the email is unknown', () => {
    const link = adminMailtoLink('', 'admin@example.org')
    expect(decodeURIComponent(link)).not.toContain('Account:')
  })
})

describe('isBannedAuthError', () => {
  it('recognises the Supabase banned-user message', () => {
    expect(isBannedAuthError({ message: 'User is banned' })).toBe(true)
  })

  it('ignores other sign-in errors', () => {
    expect(isBannedAuthError({ message: 'Invalid login credentials' })).toBe(false)
    expect(isBannedAuthError(null)).toBe(false)
  })
})
