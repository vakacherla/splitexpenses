import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
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
