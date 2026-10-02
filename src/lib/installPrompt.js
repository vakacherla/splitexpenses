// "Install the app" prompt. Android and desktop Chrome/Edge fire a
// `beforeinstallprompt` event we can hold and replay from our own button.
// iPhone/iPad have no such event (every iOS browser runs on WebKit), so the
// person has to use Share > Add to Home Screen by hand; we show instructions.

const DISMISSED_KEY = 'install_prompt_dismissed_at_v1'
export const REOFFER_AFTER_DAYS = 14

// 'ios' | 'native' (browser can install with one tap) | 'other'
export function installMode({ userAgent = '', platform = '', maxTouchPoints = 0, hasDeferredPrompt = false }) {
  const isIos =
    /iPhone|iPad|iPod/.test(userAgent) ||
    // iPadOS reports itself as a Mac but has a touch screen.
    (platform === 'MacIntel' && maxTouchPoints > 1)
  if (isIos) return 'ios'
  if (hasDeferredPrompt) return 'native'
  return 'other'
}

// Which iPhone browser, so the instructions can say where the Share button is.
export function iosBrowser(userAgent = '') {
  if (/CriOS/.test(userAgent)) return 'chrome'
  if (/FxiOS/.test(userAgent)) return 'firefox'
  if (/EdgiOS/.test(userAgent)) return 'edge'
  return 'safari'
}

// Never nag about installing something that is already installed.
export function isInstalledApp({ displayModeStandalone = false, navigatorStandalone = false } = {}) {
  return Boolean(displayModeStandalone || navigatorStandalone)
}

export function wasDismissedRecently(dismissedAt, now = Date.now(), days = REOFFER_AFTER_DAYS) {
  if (!dismissedAt) return false
  return now - Number(dismissedAt) < days * 24 * 60 * 60 * 1000
}

// Banner rule: not installed, there is a way to install, and not dismissed
// within the last two weeks.
export function shouldOfferInstall({ installed, mode, dismissedAt, now = Date.now() }) {
  if (installed) return false
  if (mode === 'other') return false
  return !wasDismissedRecently(dismissedAt, now)
}

// Storage is per device (not per account): installing is a device decision.
export function readDismissedAt() {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY)) || 0
  } catch {
    return 0
  }
}

export function recordDismissed(now = Date.now()) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(now))
  } catch {
    // nothing to do: the banner just comes back next visit
  }
}

// The install event can fire before React has mounted, so it is captured
// here, early, and handed to whoever asks.
let deferredPrompt = null
const listeners = new Set()

function notify() {
  listeners.forEach((fn) => fn())
}

export function captureInstallPrompt() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function getDeferredPrompt() {
  return deferredPrompt
}

export function subscribeInstallPrompt(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Shows the browser's own install dialog. Returns 'accepted' | 'dismissed'.
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return 'unavailable'
  event.prompt()
  const { outcome } = await event.userChoice
  // The event can only be used once.
  deferredPrompt = null
  notify()
  return outcome
}
