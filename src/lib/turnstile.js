// Cloudflare Turnstile (CAPTCHA) for sign-up, sign-in and password reset.
// Supabase Auth verifies the token server-side once CAPTCHA protection is
// switched on in its dashboard (Authentication > Attack Protection). The
// site key is public by design; the secret key lives only in Supabase.

export const TURNSTILE_SITE_KEY =
  (import.meta.env?.VITE_TURNSTILE_SITE_KEY ?? '').trim() || '0x4AAAAAAFMLJfJ_xs_1WUnD'

// What to pass to supabase.auth.* so the token rides along. Empty when there
// is no token (widget not shown), so behaviour is unchanged without CAPTCHA.
export function captchaOptions(token) {
  return token ? { captchaToken: token } : {}
}
