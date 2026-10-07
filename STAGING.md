# Staging copy for automated QA (REQ-SEC-07)

## Status (3 Oct 2026)

- Supabase project **split-expenses-staging**, ref `zzuttxfzxmfxohjmibrh`, URL `https://zzuttxfzxmfxohjmibrh.supabase.co`
  (production is `msaawuwelovlikdboxrn`: never the target of anything below).
- **Database loaded and verified**: 15 tables and the key functions (atomic save, archived-trip guard, Usage reports,
  invites, Circles), 18 tables under row-level security, 70 policies. Loaded with `schema.sql` followed by migrations 002 to 062,
  tolerating the known ordering errors in `schema.sql` (the later migrations recreate those objects). The CLI's one-shot
  `db push` cannot do this, because `schema.sql` is a snapshot that overlaps the migrations and fails on its own ordering.
- Auth settings (dummy Turnstile secret, confirm email off): set by the owner. Redirect URLs still need the Preview address.
- **Vercel Preview is live** (5 Oct 2026): the `staging` branch builds a Preview at **`https://varanasi-git-staging-vakacherla-1857.vercel.app`**. Checked: the build uses the staging Supabase URL and Cloudflare's test sitekey, none of production's values, and the login page shows Cloudflare's "for testing only" widget. Vercel Authentication is off, so the address opens without a Vercel login.
- **Lessons from setting it up:** (1) a saved Vercel variable only affects the next build, so rebuild after editing; (2) the Preview and Production rows live in the same project, and a staging value saved on Production by mistake would point the live app at staging at its next deploy (it was caught and restored before any production build); (3) check the value baked into the build, not only the dashboard: `grep -o 'VITE_SUPABASE_URL:\`[^\`]*\`'` on the deployed `/assets/index-*.js`. A scheme typo (`ps://` instead of `https://`) makes the app render blank with no console error.
- **Still to do**: the staging project's Auth redirect URLs (the Preview address and `/**`, plus `/join/**`), the QA accounts (sign up on the Preview, which the test key lets through), then the acceptance check at the bottom.

### Vercel Preview variables (Project Settings > Environment Variables, tick **Preview only**, never Production)

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://zzuttxfzxmfxohjmibrh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the staging project's **anon / publishable** key (Supabase > Project Settings > API). Never the service_role key |
| `VITE_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` |
| `VITE_PUBLIC_APP_URL` | the staging address once known (step below) |

Then push a branch called `staging` (a copy of `main`); Vercel builds it as a Preview. Its stable address is shown on the
deployment (`...-git-staging-...vercel.app`). Put that address, and the same with `/join/**`, in the staging project's
Authentication > URL Configuration, and set `VITE_PUBLIC_APP_URL` to it.


**Why.** Cloudflare Turnstile blocks any browser a script drives, so the QA agent (Ganesha, on its own VM)
cannot sign in. Cloudflare publishes dummy keys that always pass, but sign-in is verified by **Supabase Auth**,
not by the app, so a test sitekey only works against a backend whose Turnstile secret is the matching dummy
secret. Production must keep the real one. So: a second, separate Supabase project plus a Vercel preview that
points at it. Production, its users and its data are never touched.

**What is in the code.** The sitekey already comes from `VITE_TURNSTILE_SITE_KEY` (falls back to the real key).
`vite.config.js` now **fails any production build** (`VERCEL_ENV=production`) that carries one of Cloudflare's
test keys (`src/lib/turnstileKeys.js`). There is no bypass of any kind in the app: no query parameter, header or IP rule.

Never run `supabase link` in the main project folder for this: it would point later production pushes at staging.
Use `--db-url` and `--project-ref` flags as below.

## Owner steps (your accounts)

1. **Create the project.** Supabase dashboard, New project, name `split-expenses-staging`, same region as production.
   Note the project ref, the database password, the project URL and the anon (public) key.
2. **Auth settings** (Authentication):
   - Attack Protection, CAPTCHA: provider Turnstile, **secret key `1x0000000000000000000000000000000AA`**
     (Cloudflare's dummy secret). Or leave captcha off on staging; with it on, the sign-in flow is tested as users see it.
   - Sign In / Providers, Email: turn **Confirm email off** (test accounts have no inbox).
   - URL Configuration: Site URL and Redirect URLs = the staging address from step 5, plus `<staging address>/join/**`.
3. **Tell me** the project ref and give me the connection string (or run the commands below yourself).

## Steps I can run once you say go (each needs your OK, like every production-adjacent step)

4. **Database.** Run `supabase/schema.sql` in the staging SQL editor, then apply migrations 002 to 062 in order
   (`supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"`, which only
   reads the repo's `supabase/migrations`). Then grant a QA admin if needed:
   `update public.profiles set is_admin = true where email = 'qa-admin@example.com';` (staging only).
   Edge Functions (only if the AI features should work there): `supabase functions deploy admin-users receipt-scan parse-expense-text --project-ref <ref>`,
   plus the `GEMINI_API_KEY` secret. Otherwise leave receipt scan and typed entry to production runs.
5. **Vercel.** Push a branch named `staging`. In Vercel, Project Settings, Environment Variables, add these **scoped to
   Preview only** (never Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (staging values),
   `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `VITE_PUBLIC_APP_URL=<the staging address>`, and
   `VITE_VAPID_PUBLIC_KEY` if push is wanted. The stable address is the branch alias,
   `https://splitexpenses-app-git-staging-<team>.vercel.app`.
   **Deployment Protection:** Vercel puts previews behind its own login by default, which would block the agent.
   Either use "Protection Bypass for Automation" (give the agent the token) or switch protection off for Preview. Your call.
6. **QA identities.** Sign up on staging (the dummy key passes): `qa-owner@example.com`, `qa-member@example.com`,
   `qa-admin@example.com` (addresses at example.com count as test accounts in the Usage reports). Give the agent only these.

## Acceptance

- An automated browser opens the staging address, signs in as a QA account and lands on `/dashboard`.
- Production sign-in still shows the real Turnstile challenge and the production Supabase project is unchanged.
- A production build with the test key set fails with the message above (covered by `npm test` and checked by hand).

## Keeping it honest

Staging is disposable: reset it by recreating the project. No real people go there. Test results from staging prove the
code, not production configuration (domain, email, Turnstile), so the Turnstile, email and phone cases stay the owner's on production.
