import { describe, it, expect } from 'vitest'
import { nextPasswordRecoveryState, shouldForceResetPassword } from './authRecovery'

describe('nextPasswordRecoveryState', () => {
  it('turns on for PASSWORD_RECOVERY from a false starting state', () => {
    expect(nextPasswordRecoveryState('PASSWORD_RECOVERY', false)).toBe(true)
  })

  it('stays on if PASSWORD_RECOVERY fires again while already true', () => {
    expect(nextPasswordRecoveryState('PASSWORD_RECOVERY', true)).toBe(true)
  })

  it('turns off for SIGNED_OUT from a true starting state', () => {
    expect(nextPasswordRecoveryState('SIGNED_OUT', true)).toBe(false)
  })

  it('stays off if SIGNED_OUT fires while already false', () => {
    expect(nextPasswordRecoveryState('SIGNED_OUT', false)).toBe(false)
  })

  // A recovery session update (the reset-password form's own
  // supabase.auth.updateUser call) fires USER_UPDATED, not SIGNED_OUT — the
  // flag must be cleared explicitly by the page, not by this event.
  it('leaves the flag untouched on USER_UPDATED', () => {
    expect(nextPasswordRecoveryState('USER_UPDATED', true)).toBe(true)
    expect(nextPasswordRecoveryState('USER_UPDATED', false)).toBe(false)
  })

  // A background token refresh (e.g. another tab, or the same tab later)
  // must never flip the flag either direction.
  it('leaves the flag untouched on TOKEN_REFRESHED', () => {
    expect(nextPasswordRecoveryState('TOKEN_REFRESHED', true)).toBe(true)
    expect(nextPasswordRecoveryState('TOKEN_REFRESHED', false)).toBe(false)
  })

  it('leaves the flag untouched on a normal SIGNED_IN', () => {
    expect(nextPasswordRecoveryState('SIGNED_IN', true)).toBe(true)
    expect(nextPasswordRecoveryState('SIGNED_IN', false)).toBe(false)
  })

  it('leaves the flag untouched on the initial getSession() event', () => {
    expect(nextPasswordRecoveryState('INITIAL_SESSION', false)).toBe(false)
    expect(nextPasswordRecoveryState('INITIAL_SESSION', true)).toBe(true)
  })

  it('leaves the flag untouched for an unrecognized/future event name', () => {
    expect(nextPasswordRecoveryState('SOME_FUTURE_EVENT', true)).toBe(true)
    expect(nextPasswordRecoveryState('SOME_FUTURE_EVENT', false)).toBe(false)
  })

  it('leaves the flag untouched for an undefined event', () => {
    expect(nextPasswordRecoveryState(undefined, true)).toBe(true)
  })
})

describe('shouldForceResetPassword', () => {
  it('forces the redirect when a recovery session is active anywhere but the reset page', () => {
    expect(shouldForceResetPassword(true, '/')).toBe(true)
    expect(shouldForceResetPassword(true, '/dashboard')).toBe(true)
    expect(shouldForceResetPassword(true, '/login')).toBe(true)
    expect(shouldForceResetPassword(true, '/trips/abc123')).toBe(true)
  })

  it('does not redirect-loop once already on the reset-password page', () => {
    expect(shouldForceResetPassword(true, '/reset-password')).toBe(false)
  })

  it('is a no-op for a normal (non-recovery) session on any route', () => {
    expect(shouldForceResetPassword(false, '/dashboard')).toBe(false)
    expect(shouldForceResetPassword(false, '/')).toBe(false)
    expect(shouldForceResetPassword(false, '/reset-password')).toBe(false)
  })

  // A trailing slash or different casing is a different string, and this
  // route table doesn't normalize either — pinning that as documented
  // behavior rather than an oversight, since react-router's location.pathname
  // never carries a trailing slash or altered case for a route declared as
  // exactly "/reset-password".
  it('treats a trailing-slash or differently-cased path as distinct from the reset page', () => {
    expect(shouldForceResetPassword(true, '/reset-password/')).toBe(true)
    expect(shouldForceResetPassword(true, '/Reset-Password')).toBe(true)
  })

  it('treats falsy non-boolean recovery values as off', () => {
    expect(shouldForceResetPassword(undefined, '/dashboard')).toBe(false)
    expect(shouldForceResetPassword(null, '/dashboard')).toBe(false)
    expect(shouldForceResetPassword(0, '/dashboard')).toBe(false)
  })
})
