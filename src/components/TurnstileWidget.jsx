import { useEffect, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '../lib/turnstile'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise = null

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = SCRIPT_SRC
      el.async = true
      el.onload = () => resolve(window.turnstile)
      el.onerror = () => {
        scriptPromise = null
        reject(new Error('Could not load the verification check.'))
      }
      document.head.appendChild(el)
    })
  }
  return scriptPromise
}

// Renders the CAPTCHA and reports its token. `onToken(null)` means "not
// verified (yet)": expired, failed, or being reset. A token works once, so
// bump `resetCount` after every submit attempt to get a fresh one.
export default function TurnstileWidget({ onToken, onLoadError, resetCount = 0 }) {
  const box = useRef(null)
  const widgetId = useRef(null)
  const callbacks = useRef({ onToken, onLoadError })

  // Keep the latest handlers without re-rendering the widget (refs are only
  // written in effects, not during render).
  useEffect(() => {
    callbacks.current = { onToken, onLoadError }
  })

  useEffect(() => {
    let cancelled = false
    loadScript()
      .then((turnstile) => {
        if (cancelled || !box.current) return
        widgetId.current = turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(null),
          'error-callback': () => callbacks.current.onToken(null),
        })
      })
      .catch((err) => callbacks.current.onLoadError?.(err.message))
    return () => {
      cancelled = true
      if (widgetId.current != null && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  useEffect(() => {
    if (resetCount > 0 && widgetId.current != null && window.turnstile) {
      callbacks.current.onToken(null)
      window.turnstile.reset(widgetId.current)
    }
  }, [resetCount])

  return <div ref={box} className="flex justify-center" />
}
