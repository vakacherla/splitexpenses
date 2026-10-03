// Cloudflare publishes dummy Turnstile site keys for testing. They always pass
// (or always fail, or always show a challenge) and only verify against Cloudflare's
// matching dummy secret, so they only work against a backend that is set up with
// that secret: a staging copy, never production. Kept free of browser-only code so
// the build configuration can import it too.
export const TEST_SITE_KEYS = [
  '1x00000000000000000000AA', // always passes
  '2x00000000000000000000AB', // always blocks
  '3x00000000000000000000FF', // forces an interactive challenge
]

export function isTestSiteKey(key) {
  return TEST_SITE_KEYS.includes(String(key ?? '').trim())
}

// Throws when a production build is about to ship a test key. `env` is the
// hosting provider's environment: Vercel sets VERCEL_ENV to production, preview
// or development. Anything else (a local build) is allowed.
export function assertNoTestKeyInProduction(env = {}) {
  const key = String(env.VITE_TURNSTILE_SITE_KEY ?? '').trim()
  if (String(env.VERCEL_ENV ?? '') === 'production' && isTestSiteKey(key)) {
    throw new Error(
      'VITE_TURNSTILE_SITE_KEY is a Cloudflare test key, and this is a production build. ' +
        'Test keys make the sign-in captcha always pass, so they must never ship to production. ' +
        'Remove the variable for the Production environment (keep it for Preview only).'
    )
  }
}
