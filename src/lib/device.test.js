import { describe, expect, it } from 'vitest'
import {
  BROWSER_FAMILIES,
  FORM_FACTORS,
  INSTALL_MODES,
  OS_FAMILIES,
  detectDevice,
  readDeviceEnv,
} from './device'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  iphoneInstalled:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidPhoneChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidTabletChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  samsungPhone:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidDesktopSite:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
}

describe('detectDevice', () => {
  it('iPhone in Safari is a phone on iOS', () => {
    expect(
      detectDevice({ userAgent: UA.iphoneSafari, platform: 'iPhone', maxTouchPoints: 5, screenWidth: 390, screenHeight: 844 }),
    ).toEqual({ form_factor: 'phone', install_mode: 'browser', os: 'ios', browser: 'safari' })
  })

  it('iPhone in Chrome is still iOS and Chrome', () => {
    const d = detectDevice({ userAgent: UA.iphoneChrome, platform: 'iPhone', maxTouchPoints: 5, screenWidth: 390, screenHeight: 844 })
    expect(d).toMatchObject({ form_factor: 'phone', os: 'ios', browser: 'chrome' })
  })

  it('installed iOS home-screen app is pwa and still reads as Safari', () => {
    const d = detectDevice({
      userAgent: UA.iphoneInstalled, platform: 'iPhone', maxTouchPoints: 5, screenWidth: 390, screenHeight: 844, standalone: true,
    })
    expect(d).toEqual({ form_factor: 'phone', install_mode: 'pwa', os: 'ios', browser: 'safari' })
  })

  it('an iPad that identifies as a Mac is a tablet on iOS', () => {
    const d = detectDevice({ userAgent: UA.ipadAsMac, platform: 'MacIntel', maxTouchPoints: 5, screenWidth: 820, screenHeight: 1180 })
    expect(d).toMatchObject({ form_factor: 'tablet', os: 'ios', browser: 'safari' })
  })

  it('a real Mac laptop is desktop on macOS', () => {
    const d = detectDevice({ userAgent: UA.macSafari, platform: 'MacIntel', maxTouchPoints: 0, screenWidth: 1512, screenHeight: 982 })
    expect(d).toMatchObject({ form_factor: 'desktop', os: 'macos', browser: 'safari' })
  })

  it('Android phone in Chrome', () => {
    const d = detectDevice({
      userAgent: UA.androidPhoneChrome, platform: 'Linux armv81', maxTouchPoints: 5, screenWidth: 412, screenHeight: 915, uaDataMobile: true, uaDataPlatform: 'Android',
    })
    expect(d).toEqual({ form_factor: 'phone', install_mode: 'browser', os: 'android', browser: 'chrome' })
  })

  it('Android tablet has no "Mobile" in the UA and a wide screen', () => {
    const d = detectDevice({
      userAgent: UA.androidTabletChrome, platform: 'Linux armv81', maxTouchPoints: 5, screenWidth: 800, screenHeight: 1280, uaDataMobile: false, uaDataPlatform: 'Android',
    })
    expect(d).toMatchObject({ form_factor: 'tablet', os: 'android', browser: 'chrome' })
  })

  it('Samsung Internet on a phone', () => {
    const d = detectDevice({ userAgent: UA.samsungPhone, platform: 'Linux armv81', maxTouchPoints: 5, screenWidth: 384, screenHeight: 832 })
    expect(d).toMatchObject({ form_factor: 'phone', os: 'android', browser: 'samsung' })
  })

  it('a phone asking for the desktop site is still a phone', () => {
    const d = detectDevice({ userAgent: UA.androidDesktopSite, platform: 'Linux x86_64', maxTouchPoints: 5, screenWidth: 412, screenHeight: 915 })
    expect(d).toMatchObject({ form_factor: 'phone', os: 'linux' })
  })

  it('a Windows touch-screen laptop is desktop', () => {
    const d = detectDevice({ userAgent: UA.windowsChrome, platform: 'Win32', maxTouchPoints: 10, screenWidth: 1920, screenHeight: 1080 })
    expect(d).toMatchObject({ form_factor: 'desktop', os: 'windows', browser: 'chrome' })
  })

  it('Edge on Windows', () => {
    const d = detectDevice({ userAgent: UA.windowsEdge, platform: 'Win32', maxTouchPoints: 0, screenWidth: 1920, screenHeight: 1080 })
    expect(d).toMatchObject({ form_factor: 'desktop', os: 'windows', browser: 'edge' })
  })

  it('Firefox on Linux', () => {
    const d = detectDevice({ userAgent: UA.linuxFirefox, platform: 'Linux x86_64', maxTouchPoints: 0, screenWidth: 1920, screenHeight: 1080 })
    expect(d).toMatchObject({ form_factor: 'desktop', os: 'linux', browser: 'firefox' })
  })

  it('uses the physical screen, not the window, so a tiny window on a laptop stays desktop', () => {
    const d = detectDevice({ userAgent: UA.windowsChrome, platform: 'Win32', maxTouchPoints: 0, screenWidth: 1920, screenHeight: 1080 })
    expect(d.form_factor).toBe('desktop')
  })

  it('an installed Android app reports pwa', () => {
    const d = detectDevice({ userAgent: UA.androidPhoneChrome, platform: 'Linux armv81', maxTouchPoints: 5, screenWidth: 412, screenHeight: 915, standalone: true })
    expect(d.install_mode).toBe('pwa')
  })

  it('an empty or broken environment falls back to safe labels', () => {
    const safe = { form_factor: 'desktop', install_mode: 'browser', os: 'other', browser: 'other' }
    expect(detectDevice()).toEqual(safe)
    expect(detectDevice({})).toEqual(safe)
    expect(detectDevice(null)).toEqual(safe)
  })

  it('only ever returns allowlisted values', () => {
    for (const ua of Object.values(UA)) {
      const d = detectDevice({ userAgent: ua, platform: 'x', maxTouchPoints: 3, screenWidth: 500, screenHeight: 900 })
      expect(FORM_FACTORS).toContain(d.form_factor)
      expect(INSTALL_MODES).toContain(d.install_mode)
      expect(OS_FAMILIES).toContain(d.os)
      expect(BROWSER_FAMILIES).toContain(d.browser)
    }
  })

  it('never includes the raw user agent in its output', () => {
    const d = detectDevice({ userAgent: UA.iphoneSafari, platform: 'iPhone', maxTouchPoints: 5 })
    expect(JSON.stringify(d)).not.toMatch(/Mozilla|AppleWebKit|15E148/)
  })
})

describe('readDeviceEnv', () => {
  it('reads the browser globals it is given', () => {
    const win = {
      navigator: { userAgent: 'ua', platform: 'p', maxTouchPoints: 2, standalone: true, userAgentData: { mobile: true, platform: 'Android' } },
      screen: { width: 400, height: 800 },
      matchMedia: () => ({ matches: false }),
    }
    expect(readDeviceEnv(win)).toEqual({
      userAgent: 'ua', platform: 'p', maxTouchPoints: 2, screenWidth: 400, screenHeight: 800, uaDataMobile: true, uaDataPlatform: 'Android', standalone: true,
    })
  })

  it('treats display-mode standalone as installed and survives a missing matchMedia', () => {
    expect(readDeviceEnv({ navigator: {}, screen: {}, matchMedia: () => ({ matches: true }) }).standalone).toBe(true)
    expect(readDeviceEnv({ navigator: {}, screen: {} }).standalone).toBe(false)
    expect(readDeviceEnv({ navigator: {}, screen: {}, matchMedia: () => { throw new Error('x') } }).standalone).toBe(false)
  })

  it('returns an empty env without a window', () => {
    expect(readDeviceEnv(undefined)).toEqual({})
  })
})
