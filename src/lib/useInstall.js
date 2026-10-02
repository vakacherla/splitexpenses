import { useState, useSyncExternalStore } from 'react'
import {
  getDeferredPrompt,
  subscribeInstallPrompt,
  installMode,
  iosBrowser,
  isInstalledApp,
  promptInstall,
} from './installPrompt'

// Everything the install UI needs about this device, in one place.
export function useInstall() {
  const deferred = useSyncExternalStore(subscribeInstallPrompt, getDeferredPrompt, () => null)
  const [justInstalled, setJustInstalled] = useState(false)

  const nav = typeof navigator === 'undefined' ? {} : navigator
  const mode = installMode({
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    hasDeferredPrompt: Boolean(deferred),
  })
  const installed =
    justInstalled ||
    isInstalledApp({
      displayModeStandalone: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
      navigatorStandalone: nav.standalone,
    })

  async function install() {
    const outcome = await promptInstall()
    if (outcome === 'accepted') setJustInstalled(true)
    return outcome
  }

  return { mode, installed, browser: mode === 'ios' ? iosBrowser(nav.userAgent) : null, install }
}
