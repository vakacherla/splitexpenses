import { useSyncExternalStore } from 'react'

function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

// `navigator.onLine` only reflects whether the device has *a* network
// interface up, not whether Supabase is actually reachable — but it's a
// reliable, zero-cost signal for "definitely offline" (airplane mode, no
// wifi/cellular), which is the case this app's write-queue and read-cache
// need to react to.
export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
}
