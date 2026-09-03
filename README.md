# Split Expenses — shared expenses, any currency

A small group expense splitter for ongoing groups (a flat, a family fund, a
recurring trip) where members pay in different currencies. Balances are
always shown in one currency per group, converted with live exchange rates.
Expenses are categorized for a reporting dashboard, and there's a
platform-admin panel for managing accounts and groups.

Works on phones and laptops from a single responsive layout — no separate
mobile app. Light and dark mode are both built in.

## Stack, and why

| Piece | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind v4 | Fast to build and deploy, no server rendering needed |
| Backend & database | [Supabase](https://supabase.com) (Postgres + Auth) | Free tier is plenty for a few friend/family groups; you don't run or pay for a server |
| Auth | Email + password (Supabase Auth) | You asked for proper accounts over passwordless links |
| Exchange rates | [Frankfurter API](https://frankfurter.dev) | Free, no API key, ECB reference rates, refreshed each weekday |
| Charts | [Recharts](https://recharts.org) | Used only on the Reports tab and Admin page — both are code-split so most people never download it |
| Admin actions | Supabase Edge Function + Admin API | Suspending/deleting accounts needs the service-role key, which can never sit in frontend code — so that one piece runs server-side |
| Receipt scanning | Supabase Edge Function + Gemini (primary) / Qwen2.5-VL (fallback) | The one feature with a real per-use cost — see below, though realistically $0 at personal-app volume |
| Hosting | Any static host (Vercel, Netlify, Cloudflare Pages) | It's a static build — `npm run build` and deploy the `dist/` folder |

**Scope decisions worth knowing about**, since you'll be the one maintaining
this:
- Each group has one **home currency**, set when the group is created. Every
  expense (and every settlement) can be logged in *any* currency; it's
  converted to the home currency at the exchange rate on the day it's
  entered, and that converted amount is stored — so balances don't shift
  retroactively if rates move later.
- Splits support **equal**, **percentage**, or **exact custom amounts** per
  person. Percentage shares are converted to money using the largest-
  remainder method, so rounding error lands on whoever's percentage has the
  largest fractional cent rather than always the first person listed.
- **Settling up** can be recorded in any currency, and Balances shows a
  payment history with an Undo, in case something's logged wrong.
- Debts are simplified (fewest possible payments) rather than showing every
  underlying expense as a separate IOU.
- Within a group, any member can still edit or delete any expense — that
  hasn't changed. What HAS changed: "delete" is now a recoverable soft
  delete (see "Deleting a group is a recoverable archive" below — the
  same thing applies to expenses, restorable from Admin → Trash), so a
  member can still remove a wrong entry themselves, but nobody can
  actually destroy shared financial history by mistake. What's also new
  is a separate **platform-admin** layer on top: one flag
  (`profiles.is_admin`) that gives full visibility into every group and
  the ability to suspend, unsuspend, or delete any user account. Nobody
  can grant this to themselves through the app — a database trigger
  blocks it — so the first admin has to be set by hand in SQL (step 4
  below).
- **Deleting** a user account is blocked (with a clear error, not a silent
  failure) if that person has recorded expenses or settlements anywhere —
  removing them would corrupt someone else's shared ledger. **Suspending**
  works regardless, and is the safer default for "get this person out."
- **Deleting a group is a recoverable archive, not a real delete** —
  whoever created a group (or a manager they've appointed, or you, as
  platform admin) can "delete" it, which just hides it and sets a
  timestamp; every expense, member, and settlement stays intact
  underneath. Only you can permanently purge an archived group (Admin →
  Groups → Archived), and only after 30 days — before that, it's a
  one-click restore. **Deleting a single expense works the same way** —
  any member can delete a wrong entry from the Ledger, it disappears and
  stops counting toward balances immediately, but it's recoverable from
  Admin → Trash on the same 30-day timeline. Both are deliberately a
  manual, admin-driven batch job rather than an automatic timer, since
  "gone for good" shouldn't happen on a schedule nobody's watching.
- **Removing a member from a group** (also creator-only) is blocked while
  they still have a non-zero balance in that group, for the same reason
  user deletion is blocked — their past expenses stay in the ledger, but
  a debt with nobody left to show it against is a bug waiting to happen.
- **Expense categories** are a fixed list (Food, Lodging, Flights, Train,
  Taxi/Cab, Groceries, Shopping, Activities, Utilities, Misc) rather than
  freeform text or per-group custom categories — keeps reports clean, no
  "Taxi" vs "taxi" vs "Cab" fragmentation. Adding a category later means
  editing two places: the list in `src/lib/categories.js` and the matching
  `CHECK` constraint in the database (a migration file for that already
  exists as a template — copy the pattern in
  [`004_admin_rbac_and_categories.sql`](./supabase/migrations/004_admin_rbac_and_categories.sql)).
- The Reports tab totals **who paid**, not who's on the hook for a share —
  i.e. it answers "how much did each person hand over," which is what
  "who spent" usually means day to day. That's a different number from a
  person's net balance on the Balances tab.
- **Dark mode** is a manual toggle (sun/moon button, top-right on every
  screen), not just a system-preference follow — it defaults to your
  system setting on first visit, then remembers whatever you pick after
  that. Implemented as CSS custom-property overrides under a `.dark` class
  rather than sprinkling `dark:` classes through every component, so the
  whole app re-themes from one place
  ([`src/index.css`](./src/index.css)) — the one exception is the
  Reports charts, which need literal color values rather than CSS
  variables (a Recharts limitation), so those colors are mirrored by hand
  in [`ReportsPanel.jsx`](./src/components/ReportsPanel.jsx) and need
  updating alongside `index.css` if you ever change the palette.
- **Settle-up now links out to a payment app** (UPI, Venmo, or PayPal) with
  the amount pre-filled — but only once the *recipient* has added their
  own handle on the Members tab. There's no way around this: a payment
  deep link fundamentally needs to know who to pay, and Splitwise doesn't
  solve this any differently — it links out too, it just doesn't pre-fill
  a recipient either. No handle set, no button; the settle-up flow itself
  still works exactly as before regardless.
- **A group's default split** (who's normally included, equal vs.
  percentage) can be saved from the add-expense form and is then
  suggested — never forced — the next time anyone in that group adds an
  expense. Exact-amount splits aren't saveable as a default, since by
  definition they're specific to one expense.
- **CSV export** is a straight dump of that group's expenses, one row
  each, with participant shares flattened into a single column — built
  for opening in a spreadsheet, not for re-importing anywhere.
- **Receipt scanning is genuinely optional** and isolated on purpose: it's
  the only feature in this app that talks to external paid APIs (via the
  `receipt-scan` Edge Function) rather than a free
  tier. Skip deploying that one function and everything else is
  unaffected — the add-expense form works exactly as before, just without
  the scan button. It tries Gemini's free tier first and only calls the
  Qwen fallback (a small real cost) when Gemini fails or can't read the
  receipt — realistically $0/month at personal-app volume either way.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → New project. Note the
   database password somewhere safe.
2. Once it's provisioned, open **SQL Editor** → New query, paste the entire
   contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it.
   This creates all tables, security policies, and helper functions.
   (If you already have a live project from before, run the
   `supabase/migrations/*.sql` files in order instead — `002`, `003`, `004`
   — each one upgrades your existing tables in place rather than needing a
   fresh `schema.sql` run.)
3. Go to **Project Settings → API**. You'll need the **Project URL** and the
   **anon / public key** for the next step.
4. (Optional but recommended) Under **Authentication → Providers → Email**,
   decide whether you want "Confirm email" on. It's on by default — new
   users get a confirmation email before they can sign in. Turn it off if
   you'd rather skip that step for a small private group.

## 2. Run it locally

```bash
npm install
cp .env.example .env
# edit .env and paste in your Supabase Project URL and anon key
npm run dev
```

Open the printed local URL. Create an account, create a group, and you're
in.

## 3. Deploy

Any static host works. First-time setup with Vercel:

```bash
npm install -g vercel
vercel
```

When prompted, add the two environment variables from your `.env`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the Vercel project
settings — they need to be set at build time, not just locally.

**After that first setup, deploy with:**
```bash
npm run deploy
```
This runs `build`, `lint`, and `test` first and stops before touching
Vercel if any of them fail — see `deploy.sh` and `ARCHITECTURE.md` for
why. Plain `vercel --prod` still works if you ever want to skip the
checks, but there's rarely a good reason to.

A `vercel.json` is already included that rewrites all routes to
`index.html` — without it, a direct load or refresh on any route other
than `/` (e.g. `/dashboard`) 404s, since the host doesn't know those paths
belong to React Router rather than being real files.

For Netlify or Cloudflare Pages: build command `npm run build`, publish
directory `dist`, same two environment variables. You'll also need their
equivalent of the SPA rewrite above — for Netlify, a `public/_redirects`
file containing `/* /index.html 200`.

## 4. Set up the admin module

This is the one part of the app that isn't pure frontend-talks-to-Supabase —
account actions (suspend/unsuspend/delete) go through a small Supabase Edge
Function, since only the service-role key can perform them, and that key
must never reach the browser.

1. **Make yourself an admin.** In the Supabase SQL Editor:
   ```sql
   update public.profiles set is_admin = true where email = 'you@example.com';
   ```
   This is deliberately not something the app can do for you — a trigger
   blocks any client-side attempt to flip this flag on your own account.

2. **Install the Supabase CLI** (separate from the `vercel` CLI you already
   have):
   ```bash
   npm install -g supabase
   supabase login
   ```

3. **Link this project folder to your Supabase project:**
   ```bash
   supabase link --project-ref your-project-ref
   ```
   Your project ref is the subdomain in your Project URL — e.g. for
   `https://msaawuwelovlikdboxrn.supabase.co` it's `msaawuwelovlikdboxrn`.

4. **Deploy the function:**
   ```bash
   supabase functions deploy admin-users
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to every Edge
   Function automatically — no secrets to set by hand.

   A `supabase/config.toml` is included that disables Supabase's
   platform-level JWT check for this function (`verify_jwt = false`). That
   check runs *before* your request reaches the function's own code — and
   it also runs on the browser's CORS preflight request, which never
   carries a login token, so without this the preflight gets silently
   rejected and every call looks like a network failure from the browser's
   side. The function still does its own (more precise) check internally —
   confirming the caller is signed in and `is_admin` — so this doesn't
   leave anything unauthenticated. If you deployed before this config
   existed, redeploy once more to pick it up.

5. Reload the app, sign in as your admin account, and an **Admin** link
   should appear in the top nav.

Worth knowing: this Edge Function was written but not run end-to-end before
handing it to you — everything else in this project was built and tested in
a sandbox, but Edge Functions need a real Supabase project to execute
against. If step 5 doesn't work cleanly, share the error and we'll debug it
the same way we tracked down the group-creation RLS issue earlier.

## 5. Set up receipt scanning (optional)

Skip this section entirely if you don't want it — nothing else depends on
it. Unlike everything else in this app, this one talks to external paid
APIs — though at personal-app volume, realistically $0.

Two providers, tried in order, so you can configure either or both:

1. **Gemini 3.6 Flash** (tried first) — free tier, no card required for
   normal personal usage levels.
2. **Qwen2.5-VL-72B via OpenRouter** (fallback) — only called, and only
   ever costs anything, when Gemini fails outright or can't find a valid
   total on the receipt. Real benchmark evidence shows it's the stronger
   of the two at messy layouts and handwriting, so it's worth configuring
   even with Gemini as your primary.

Set up either one:

- **Gemini:** get a key at [aistudio.google.com](https://aistudio.google.com/apikey), then:
  ```bash
  supabase secrets set GEMINI_API_KEY=your-key-here
  ```
- **OpenRouter (for the Qwen fallback):** get a key at [openrouter.ai](https://openrouter.ai/keys), then:
  ```bash
  supabase secrets set OPENROUTER_API_KEY=your-key-here
  ```

Neither goes in `.env` — both must stay server-side. Then deploy:
```bash
supabase functions deploy receipt-scan
```

In the add-expense form, "Scan a receipt" should now read a photo and
pre-fill description, amount, currency, date, and category — review
before saving, same as anything auto-filled. If the receipt itemizes
legibly (a restaurant check, say), it also pulls out each line item and
switches the form to the **Itemized** split mode, so different items can
be assigned to whoever actually ordered them — any tax/tip/delivery gets
split proportionally by what each person ordered rather than evenly. If
only one secret is set, that's fine — the function uses whichever
provider(s) it has and skips the other.

Same caveat as the admin function: written but not run end-to-end before
handing it to you, since I can't call either vision API from my sandbox.
If a scan fails, the error message should say which provider(s) were
tried and why, rather than failing silently — share it if it doesn't
make sense.

## 6. Using it

- **Create a group** from the dashboard, pick its home currency.
- **Invite people** via the 6-character code on the group's Members tab —
  they enter it under "Join with a code" after creating their own account.
- **Add an expense**: scan a receipt or fill it in by hand — description,
  category, amount and currency, who paid, who to split it between
  (equal/percentage/exact/itemized), and an optional note. If the expense currency
  differs from the group's home currency, you'll see the live converted
  amount before saving.
- **Balances tab** shows each person's net position and the smallest set of
  payments needed to settle everyone up. Recording a payment shows a
  pre-filled UPI/Venmo/PayPal link once the recipient's added their
  payment handle on the Members tab.
- **Search and filter** the Ledger by description, payer, or category once
  a group has more than a handful of expenses, and **export the whole
  ledger as CSV** from the same tab.
- **Reports tab** breaks total spend down by category and by who paid, plus
  a category × person table.
- **Admin** (only visible to admins) opens with a platform-wide
  **Overview** (total groups, users, active users, expenses logged,
  settlements recorded) and a **Reports** tab — spend by category and by
  group, across every group on the platform. Multi-currency is handled by
  grouping rather than converting: a INR group and a USD group each get
  their own total rather than being added into one number using today's
  exchange rate, which would be an estimate dressed up as a fact. The
  **Users** tab lists everyone — suspend, unsuspend, or delete an account — and
  a **super admin** can also promote a member to admin, promote an admin
  to super admin, or demote either one step back down; the first admin
  account (by signup date) starts as the super admin, shown with an
  **SU** badge instead of **admin**. This is deliberately the one thing
  a regular admin can't do — only a super admin can change anyone's
  admin status, including their own (nobody, not even a super admin, can
  act on their own account here, which is also what makes it structurally
  impossible to ever end up with zero super admins). The **Groups** tab
  lists every group, with the option to rename or archive one, and a
  **Trash** tab lists every deleted expense platform-wide, restorable or
  permanently purgeable the same way as archived groups.
- **Group settings**, on the Members tab, is visible to whoever created
  that group **or a manager they've named** — rename it, remove a
  regular member (blocked while they still have an outstanding balance,
  so nobody's debt silently disappears), or archive the group (typing
  its name is required — see "Deleting a group" above for what this
  actually does). The creator alone can name a manager (a "Make manager"
  link next to that person on the Members tab) — a manager gets the same
  day-to-day powers but can't appoint another manager or touch the
  creator's own membership. None of this needs the platform admin — a
  family member who starts their own group runs it themselves.
- **Exchange rates** (the swap icon in the nav) is a standalone,
  informational page — pick a currency, see it against every currency
  the app supports, or use the quick-convert box for a one-off amount.
  Defaults to whichever currency shows up most across your own groups
  rather than an arbitrary starting point. Same Frankfurter data source
  as the live conversion shown when adding an expense; this page never
  writes anything, it's read-only.
- **Your profile** (click your name, top right) is where you set your photo, display name, payment handle,
  and up to two phone numbers (home + a separate travel number, for a local SIM abroad) — visible to anyone
  you share a group with. It also lists every group you're in with an optional **nickname per group**, so
  you can go by something different in one group without it changing anywhere else.
- **A public `/help` page** covers all of the above in plain language, for
  people you invite rather than for you — the `?` icon in the nav links to
  it, and it's also reachable (and fully usable) without signing in first,
  so you can send someone the link before they've even created an account.
  It also has a **feature request form** — anyone signed in can leave an
  idea, which shows up under Admin → Feedback with a status you control
  (received / under review / planned / done / not planned), and the
  submitter can see that status too from the Help page.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for a systems-level review —
what's solid, what's genuinely risky, and the single highest-leverage
change worth making before adding more features (moving off manual
zip-sync deploys and onto GitHub + CI).

## Testing

```bash
npm test
```

Runs the automated suite (`src/lib/*.test.js`) — split math, balance and
debt-simplification logic, currency formatting fallbacks. This is where a
bug actually costs someone money if it's wrong, so it's covered with real
assertions rather than left to manual spot-checks.

Everything that needs a browser, a real session, or human judgment (auth
flows, RLS security boundaries, the admin panel, responsive layout, dark
mode) is in [`TESTING.md`](./TESTING.md) as a prioritized manual checklist
instead.

## Project structure

```
src/
  lib/            supabaseClient, fx, balances, split, categories, paymentLinks, csvExport
  context/        auth state (includes is_admin) and theme (dark/light)
  pages/          Login, Signup, Dashboard, GroupView, AdminPage
  components/     forms, panels, ReportsPanel, AdminRoute, ThemeToggle, and shared UI
supabase/
  schema.sql               run once, on a fresh project
  migrations/              run in order against an existing project
  functions/admin-users/   the Edge Function backing the Admin page
  functions/receipt-scan/  optional — see "Set up receipt scanning" above
```

## Ideas for later

- Push notifications when someone adds an expense
- Recurring/scheduled expenses (a "duplicate this expense" shortcut would
  cover most of the value without full automation)
- Date-range filtering on the Reports tab
- ~~Per-group owner roles (separate from the platform-admin layer)~~ — shipped
- True offline mode (a real architecture change — see `PRODUCT-ROADMAP.md`)

See [`PRODUCT-ROADMAP.md`](./PRODUCT-ROADMAP.md) for a fuller,
prioritized version of this list, benchmarked against what Splitwise and
Venmo actually offer in 2026 — including an honest case for what's
deliberately *not* worth building here.
