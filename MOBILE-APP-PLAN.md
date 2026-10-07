# Native mobile app: plan (draft for approval, 6 Oct 2026)

Status: **draft, nothing built yet.** Decisions already made by the owner: it is a **native app for the app stores**, and the
OpenAI / Gemini keys live in a **Supabase Edge Function on staging**, never in the app. Everything below runs against
**staging** (`split-expenses-staging`, ref `zzuttxfzxmfxohjmibrh`) until you say otherwise. Production is not touched.

## Goal

A beta-testable iOS and Android app, with a few real testers, that does what the web app does for a trip: sign in, see trips,
add expenses (by voice, keypad or manually), see balances, settle up. Voice entry in Telugu, Hindi, English and mixed speech is
the headline feature.

**Sprint goal (proposal):** *"A tester can install the app, sign in to staging, open a trip, add an expense by voice in
their own language, and see correct balances."* (Milestones M0 to M3 below.)

## What exists today

| Piece | State | Reuse |
|---|---|---|
| Web app (`splitcurrency`) | React 19, Vite, Tailwind, Supabase, PWA, 61 components, ~4.9k lines of pages | The **backend**: tables, row-level security, RPCs, invites, circles |
| Backend | Postgres + Auth + Storage + Edge Functions. Functions today: `admin-users`, `receipt-scan`, `parse-expense-text`, `notify-group`, `remind`, `trip-reminders-cron` | Add one function (below) |
| Voice POC (`ganesha-entry-claude`) | Expo / React Native. Voice → Gemini/Whisper → LLM parser, multi-expense, name safety, amount check, garbled-audio guard, golden tests (38 cases) | The **app shell, UI and parsing logic** |
| Ganesha's POC (`ganesha-entry`) | Same Expo base, no backend | Test corpus; amount-in-transcript idea |

The POC has **no accounts and no server**: one hard-coded trip, members stored on the phone. The work is connecting it to the
real backend, and moving the AI calls behind a function.

## Architecture

```
Phone (Expo / React Native)
  ├─ supabase-js (session in secure storage) ── RLS-protected tables, RPCs  ──► Supabase (staging)
  └─ records audio ──► Edge Function `voice-expense` ──► Gemini (transcribe + translate)
                                                    └─► LLM parse (members, multi-expense, name + amount checks)
                                                    └─► returns drafts for the review card; saves nothing itself
```

- **Same pattern as `parse-expense-text`:** the function never saves, it returns drafts, and the phone shows the review card.
  Saving uses the existing atomic save RPC, so row-level security and the archived-trip guard still apply.
- **Keys and cost control:** the function holds the keys, uses the existing `consume_ai_quota` per user, and logs to `ai_usage`.
  No key ever ships in the app.
- **Parsing logic:** the pure TypeScript modules (name matching tiers, amount check, multi-expense, audio guard) move into the
  function's `_shared` code, so the phone and the server cannot drift. The golden set (`npm run golden:llm`) is the regression gate.
- **Money math:** port `split.js`, `balances.js`, `fx.js` and their tests so the app and the web app agree to the paisa.

## Milestones (each ends with something you can try)

| # | Milestone | Size | Done when |
|---|---|---|---|
| M0 | **Foundations.** New Expo project from the POC, staging config, supabase-js client with persistent session, navigation shell, env separation (staging only) | S | App launches on a phone and the simulator, reads the staging Supabase |
| M1 | **Sign in and trips.** Email and password sign-in and sign-up; trips list; ledger, members and balances read from the real tables | M | A QA account sees its real trip, ledger and balances; matches the web app |
| M2 | **Add and edit expense (keypad and manual).** Writes through the atomic save RPC; edit and delete; offline queue basics | M | An expense added on the phone appears on the web app and vice versa |
| M3 | **Voice entry.** Edge Function `voice-expense` on staging; recording; review card with Heard, "1 of 2", Please check, add-person suggestions; garbled-audio guard | L | Spoken Telugu, Hindi and English entries reach the ledger correctly, with quotas enforced |
| M4 | **People and invites.** Join by code, share invite, add a person who has not joined yet (placeholder that becomes real when they join) | M | A second tester joins from their own phone |
| M5 | **Settle up and the rest.** Settlements, payment links, CSV, circles, push notifications | L | Feature parity for the beta scope you choose |
| M6 | **Store readiness.** Apple and Google accounts, bundle IDs, icons, privacy policy and data-safety forms (voice and AI disclosure), in-app account deletion, TestFlight and Play internal testing | M | External beta testers can install from TestFlight / Play |

**Beta-testable slice = M0 to M3 plus the staging QA accounts.** M4 to M6 make it a store-ready product.

## The hard parts, named now

1. **Sign-in uses Cloudflare Turnstile.** A native app cannot show it directly. On **staging** the dummy secret accepts Cloudflare's
   test token, so M1 works with no change. For **production** we need Turnstile inside a WebView at sign-in, or a different
   gate. That is a decision before any production beta, not before staging.
2. **Placeholder members** ("add Jaya now, she becomes real when she joins") need a small data-model change: a member row with no
   user attached, claimed on join. That is a **migration**, so it needs your explicit OK per step, and belongs in M4.
3. **Store review.** Apple requires in-app account deletion, honest privacy labels, a microphone usage reason, and a clear
   statement that audio and text go to AI providers (OpenAI, Google). Email and password only means no "Sign in with Apple"
   requirement. Push needs APNs set up.
4. **Cost and abuse.** Per-user AI quota on the server; spend caps on both provider accounts; keys rotated after any chat exposure.

## Backend changes that need your confirmation (none made yet)

- Deploy Edge Function `voice-expense` to **staging** with secrets `GEMINI_API_KEY` and `OPENAI_API_KEY`.
- (M4) a migration for placeholder members, applied to staging first.
- Nothing on production in M0 to M3. Each `functions deploy` / `db push` waits for your go, per your rule.

## Costs and accounts

Apple Developer Program $99 a year; Google Play $25 one time; Expo EAS Build free tier is enough to start; Supabase staging already
exists. AI cost is roughly half a cent per voice entry (estimates, to be checked against provider pricing).

## Decisions recorded (6 Oct 2026)

- **Platforms:** iOS and Android together (Expo builds both).
- **Beta data:** the staging sandbox. No production data or users in the first beta.
- **Accounts:** no Apple Developer or Google Play accounts yet, so M0 to M3 are built and tested in **Expo Go and the
  iOS and Android simulators** first. Real-device store testing (TestFlight / Play internal) waits for REQ-MOB-08.
- **Sprint:** drafted as S9 under epic EP-16 (`jira/SE-jira-delta-mobile-app.csv`, `jira/S9-LOCAL-TODO.md`); not yet on the board.

## UI direction (decided 6 Oct 2026)

- Mockups: `splitexpenses-mobile/docs/ui-mockups.html` (also published as a private page). Two variants per screen; **the owner chose
  variant B** (more native: center Add button in the tab bar, Help inside Profile, trip menu for Reports and the rest, date-grouped
  ledger with swipe actions, tap-the-sentence review, Pay with UPI on Balances).
- The visual language is the **web app's own**: paper and green palette, Fraunces and IBM Plex Sans, light and dark. The voice
  prototype's navy and blue theme is retired.
- Standing rule from the owner: the whole app's navigation and experience must be **similar to or better than the web, never
  inferior**. The parity map on the mockup page lists every web feature and where it lives on mobile; any new web feature gets a row.
- **Admin stays on the web for now.** Possible later: a small mobile admin view with a few numbers (active users, live users), not
  the full reports. Not scheduled.

## Open questions

1. App name and bundle id (for example `app.splitexpenses`)?
2. Which of M4 and M5 are in the first store release?
3. Production sign-in: Turnstile in a WebView, or another gate? (Before any production beta, not before staging.)

## Process (per your rules)

One milestone at a time: plan, build, verify, commit, ask before any push or deploy. Each milestone becomes a Jira-lite story set
in the sprint above once you approve this plan; I will not create sprint records before then.
