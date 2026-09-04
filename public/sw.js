// App-shell caching only — NOT an offline data layer. This exists so the
// PWA is installable and so a flaky connection doesn't fully break a
// once-visited page; it deliberately never touches Supabase requests
// (those are cross-origin and always need a real network round trip).
// True offline expense entry needs a write queue and conflict handling —
// a separate, bigger feature — not attempted here.
const CACHE = 'split-expenses-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== location.origin) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy))
        return res
      })
      .catch(() => caches.match(event.request))
  )
})

// Settle-up reminders (manual or the automatic trip-end sweep) arrive
// here as a push event even when no tab is open — this is what actually
// shows the OS-level notification.
self.addEventListener('push', (event) => {
  console.log('[sw] push event received', { hasData: Boolean(event.data) })
  let data = { title: 'Split Expenses', body: 'You have a new reminder.' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (err) {
    // Non-JSON payload — fall back to the default text above.
    console.log('[sw] push payload was not JSON', String(err))
  }
  console.log('[sw] showing notification', data)
  event.waitUntil(
    self.registration
      .showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      })
      .then(() => console.log('[sw] showNotification resolved OK'))
      .catch((err) => console.log('[sw] showNotification FAILED', String(err)))
  )
})

// Fires when a notification is dismissed for any reason — user swipe,
// tap, or the OS clearing it on its own. Temporary — helps tell apart
// "the OS is auto-closing this" from "it never really persisted at all."
self.addEventListener('notificationclose', (event) => {
  console.log('[sw] notificationclose', event.notification.title)
})

self.addEventListener('notificationclick', (event) => {
  console.log('[sw] notificationclick', event.notification.title)
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(location.origin))
      if (existing) return existing.focus()
      return self.clients.openWindow('/dashboard')
    })
  )
})
