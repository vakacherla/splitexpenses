import { describe, it, expect, beforeEach } from 'vitest'
import {
  installMode,
  iosBrowser,
  isInstalledApp,
  wasDismissedRecently,
  shouldOfferInstall,
  readDismissedAt,
  recordDismissed,
  REOFFER_AFTER_DAYS,
} from './installPrompt'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'

describe('installMode', () => {
  it('treats every iPhone browser as the manual iOS route, even with an install event', () => {
    expect(installMode({ userAgent: IPHONE_SAFARI })).toBe('ios')
    expect(installMode({ userAgent: IPHONE_CHROME })).toBe('ios')
    expect(installMode({ userAgent: IPHONE_CHROME, hasDeferredPrompt: true })).toBe('ios')
  })

  it('recognises iPadOS, which reports itself as a Mac with a touch screen', () => {
    expect(installMode({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios')
    expect(installMode({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('other')
  })

  it('offers one-tap install only when the browser supplied the event', () => {
    expect(installMode({ userAgent: ANDROID_CHROME, hasDeferredPrompt: true })).toBe('native')
    expect(installMode({ userAgent: ANDROID_CHROME })).toBe('other')
  })
})

describe('iosBrowser', () => {
  it('tells iPhone browsers apart', () => {
    expect(iosBrowser(IPHONE_SAFARI)).toBe('safari')
    expect(iosBrowser(IPHONE_CHROME)).toBe('chrome')
    expect(iosBrowser('... FxiOS/120 ...')).toBe('firefox')
    expect(iosBrowser('... EdgiOS/120 ...')).toBe('edge')
  })
})

describe('isInstalledApp', () => {
  it('is true when running as an installed app on either platform', () => {
    expect(isInstalledApp({ displayModeStandalone: true })).toBe(true)
    expect(isInstalledApp({ navigatorStandalone: true })).toBe(true)
    expect(isInstalledApp({})).toBe(false)
    expect(isInstalledApp()).toBe(false)
  })
})

describe('shouldOfferInstall', () => {
  const day = 24 * 60 * 60 * 1000
  const now = 1_000_000_000_000

  it('offers to someone who can install and has not dismissed it', () => {
    expect(shouldOfferInstall({ installed: false, mode: 'native', dismissedAt: 0, now })).toBe(true)
    expect(shouldOfferInstall({ installed: false, mode: 'ios', dismissedAt: 0, now })).toBe(true)
  })

  it('never offers when already installed or when there is no way to install', () => {
    expect(shouldOfferInstall({ installed: true, mode: 'native', dismissedAt: 0, now })).toBe(false)
    expect(shouldOfferInstall({ installed: false, mode: 'other', dismissedAt: 0, now })).toBe(false)
  })

  it('stays quiet for two weeks after a dismissal, then asks again', () => {
    expect(wasDismissedRecently(now - 1 * day, now)).toBe(true)
    expect(shouldOfferInstall({ installed: false, mode: 'native', dismissedAt: now - 13 * day, now })).toBe(false)
    expect(shouldOfferInstall({ installed: false, mode: 'native', dismissedAt: now - (REOFFER_AFTER_DAYS + 1) * day, now })).toBe(true)
  })
})

describe('dismissal storage', () => {
  beforeEach(() => localStorage.clear())

  it('remembers when it was dismissed', () => {
    expect(readDismissedAt()).toBe(0)
    recordDismissed(12345)
    expect(readDismissedAt()).toBe(12345)
  })
})
