import { defineConfig, loadEnv } from 'vite'
import { assertNoTestKeyInProduction } from './src/lib/turnstileKeys.js'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Refuses to build production with one of Cloudflare's always-pass test captcha keys
// (those belong on a staging copy only). Reads the real environment as well as .env files.
function turnstileTestKeyGuard() {
  return {
    name: 'turnstile-test-key-guard',
    configResolved(config) {
      if (config.command === 'build') {
        assertNoTestKeyInProduction({ ...loadEnv(config.mode, process.cwd(), 'VITE_'), ...process.env })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), turnstileTestKeyGuard()],
  server: {
    host: true,
    // .claude/launch.json tells the preview harness to expect this dev
    // server on 5183 (chosen to dodge an unrelated Docker process that
    // permanently squats 5173 on this machine), but nothing was actually
    // telling Vite itself to listen there — `npm run dev` is plain `vite`,
    // so it just took its own default (5173, then auto-incremented to
    // 5174 once it found that busy). The harness's proxy, pointed at 5183,
    // found nothing listening and hung indefinitely ("Policy check in
    // progress"). strictPort means a future port conflict here fails
    // loudly at startup instead of silently drifting again.
    port: 5183,
    strictPort: true,
    // Vite 8's default Host-header allowlist (anti DNS-rebinding) only
    // accepts localhost/127.0.0.1/the configured host — it 403s anything
    // else. Claude Code's browser-pane preview reaches the dev server
    // through its own internal proxy hostname, which isn't on that list,
    // so every request from it was silently rejected (surfaced as the
    // preview getting stuck "starting" and never loading). Confirmed via
    // `curl -H "Host: anything-else" localhost:PORT` returning 403 vs 200
    // for a real Host header. This only loosens the local dev server.
    allowedHosts: true,
  },
  test: {
    setupFiles: ['./vitest.setup.js'],
  },
})
