import { describe, it, expect } from 'vitest'
import { signupErrorMessage, THROWAWAY_EMAIL_MESSAGE } from './signup'

describe('signupErrorMessage', () => {
  it('explains the hidden database rejection as a temporary-email problem', () => {
    expect(signupErrorMessage({ message: 'Database error saving new user' })).toBe(THROWAWAY_EMAIL_MESSAGE)
  })

  it('passes other errors through untouched', () => {
    expect(signupErrorMessage({ message: 'User already registered' })).toBe('User already registered')
  })

  it('handles a missing error', () => {
    expect(signupErrorMessage(null)).toBe('')
  })
})
