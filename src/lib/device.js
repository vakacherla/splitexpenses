// Usage insights (REQ-USE-03): works out four coarse labels about the device
// the app is running on. Only the labels leave the browser, never the raw
// user-agent string, so there is nothing here that identifies a device.
//
// Why not just parse the user agent: an iPad in Safari reports itself as a Mac,
// Android tablets drop the word "Mobile", and an installed home-screen app on
// iOS drops the "Safari" token. So this combines the UA with touch support,
// the physical screen size, and the standalone display mode. The window width
// is deliberately not used, because resizing a browser window would flip the
// answer.
//
// The function is pure: it takes a plain `env` object and returns labels, so
// it is tested with fake environments. `readDeviceEnv` is the one place that
// touches the real browser.

export const FORM_FACTORS = ['phone', 'tablet', 'desktop']
export const INSTALL_MODES = ['pwa', 'browser']
export const OS_FAMILIES = ['ios', 'android', 'windows', 'macos', 'linux', 'other']
export const BROWSER_FAMILIES = ['chrome', 'safari', 'firefox', 'edge', 'samsung', 'other']

const TABLET_MIN_SHORT_SIDE = 600

function detectOs(ua, platform, touchPoints, uaDataPlatform) {
  const hint = (uaDataPlatform || '').toLowerCase()
  if (hint === 'android') return 'android'
  if (hint === 'ios') return 'ios'
  if (hint === 'windows') return 'windows'
  if (hint === 'macos') return touchPoints > 1 ? 'ios' : 'macos'
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // iPadOS 13+ in Safari reports a Mac; only a touch screen gives it away.
  if (platform === 'MacIntel' && touchPoints > 1) return 'ios'
  if (/windows/i.test(ua)) return 'windows'
  if (/macintosh|mac os x/i.test(ua)) return 'macos'
  if (hint === 'linux' || hint === 'chrome os' || /linux|x11|cros/i.test(ua)) return 'linux'
  return 'other'
}

function detectBrowser(ua, os, installed) {
  if (/edg(e|a|ios)?\//i.test(ua)) return 'edge'
  if (/samsungbrowser/i.test(ua)) return 'samsung'
  if (/opr\/|opera|opios/i.test(ua)) return 'other'
  if (/firefox|fxios/i.test(ua)) return 'firefox'
  if (/chrome|crios/i.test(ua)) return 'chrome'
  if (/safari/i.test(ua)) return 'safari'
  // An installed iOS home-screen app is WebKit without the "Safari" token.
  if (os === 'ios' && installed) return 'safari'
  return 'other'
}

function detectFormFactor(ua, os, platform, touchPoints, shortSide, uaDataMobile) {
  const touch = touchPoints > 0
  if (os === 'ios') {
    const isIpad = /ipad/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1)
    return isIpad ? 'tablet' : 'phone'
  }
  if (touch && os === 'android') {
    if (uaDataMobile === true || /mobile/i.test(ua)) return 'phone'
    if (!shortSide) return 'tablet'
    return shortSide >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone'
  }
  // A phone asking for the "desktop site" claims Linux or Windows but is still
  // a small touch screen.
  if (touch && shortSide && shortSide < TABLET_MIN_SHORT_SIDE && os !== 'windows' && os !== 'macos') {
    return 'phone'
  }
  return 'desktop'
}

// env: { userAgent, platform, maxTouchPoints, screenWidth, screenHeight,
//        uaDataMobile, uaDataPlatform, standalone }
export function detectDevice(env = {}) {
  try {
    const ua = String(env.userAgent || '')
    const platform = String(env.platform || '')
    const touchPoints = Number(env.maxTouchPoints) || 0
    const w = Number(env.screenWidth) || 0
    const h = Number(env.screenHeight) || 0
    const shortSide = w && h ? Math.min(w, h) : 0
    const installed = env.standalone === true
    const os = detectOs(ua, platform, touchPoints, env.uaDataPlatform)
    return {
      form_factor: detectFormFactor(ua, os, platform, touchPoints, shortSide, env.uaDataMobile),
      install_mode: installed ? 'pwa' : 'browser',
      os,
      browser: detectBrowser(ua, os, installed),
    }
  } catch {
    return { form_factor: 'desktop', install_mode: 'browser', os: 'other', browser: 'other' }
  }
}

// The only function that reads the real browser. Anything unavailable is left
// undefined and detectDevice copes.
export function readDeviceEnv(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return {}
  const nav = win.navigator || {}
  const scr = win.screen || {}
  let displayStandalone = false
  try {
    displayStandalone = Boolean(win.matchMedia && win.matchMedia('(display-mode: standalone)').matches)
  } catch {
    // matchMedia unavailable
  }
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    screenWidth: scr.width,
    screenHeight: scr.height,
    uaDataMobile: nav.userAgentData?.mobile,
    uaDataPlatform: nav.userAgentData?.platform,
    standalone: displayStandalone || nav.standalone === true,
  }
}
