import { useState } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'

const SHOWCASE_TABS = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'add', label: 'Add an expense' },
  { id: 'reports', label: 'Reports' },
]

const USPS = [
  {
    icon: '¥$€',
    title: 'Any currency, converted fairly',
    body: "Pay in the currency you're holding — everyone else still sees their share in the group's home currency, at that day's rate.",
  },
  {
    icon: '"…"',
    title: 'Log an expense by typing a sentence',
    body: '"Lunch 24.50 split with Jayashree" becomes a categorized, split ledger entry — no form-filling required.',
  },
  {
    icon: '◐',
    title: 'Circles for repeat groups',
    body: 'Roommates or a yearly trip crew join once and spin up new trips inside the same Circle — no new invite code each time.',
  },
  {
    icon: '✓',
    title: 'Debt simplification',
    body: 'Settle-up shows the smallest possible set of payments to clear every debt in the group, not every pairwise IOU.',
  },
  {
    icon: '↗',
    title: 'One-tap settle-up links',
    body: 'Deep-links straight into UPI, Venmo, or PayPal with the amount pre-filled — this stays a ledger, your bank stays your bank.',
  },
  {
    icon: '⇅',
    title: 'Your data, portable',
    body: "Export or bulk-import any trip as CSV, or query the raw database directly. Nothing is locked behind a vendor's export button.",
  },
]

// Same illustrative "Kyoto Trip" figures used throughout the showcase below
// — a made-up example, not a real user's data, chosen so a first-time
// visitor sees plausible multi-currency numbers instead of an empty shell.
const EXAMPLE_ROWS = [
  { icon: '🚕', tone: 'accent', title: 'Uber', meta: 'You paid · Taxi/Cab', amount: '$10.00' },
  { icon: '🛒', tone: 'primary', title: 'Patel Brothers', meta: 'You paid · Groceries · itemized', amount: '$49.43' },
  { icon: '●', tone: 'muted', title: 'Dinner in Kyoto', meta: 'You paid · Misc', amount: '€45.50', sub: '$52.68' },
  { icon: '🛒', tone: 'primary', title: 'Costco Wholesale', meta: 'You paid · Groceries · itemized', amount: '$61.85' },
]

function ExampleLedgerCard() {
  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-4 shadow-raised">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="font-display text-[15px] font-semibold text-ink">Kyoto Trip</span>
        <span className="font-mono text-[10.5px] text-ink-soft">USD</span>
      </div>
      <div className="mb-3 text-[11.5px] text-ink-soft">Example trip · Ledger</div>
      <ul className="divide-y divide-line">
        {EXAMPLE_ROWS.map((row) => (
          <li key={row.title} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs ${
                  row.tone === 'primary'
                    ? 'bg-primary-tint text-primary'
                    : row.tone === 'accent'
                      ? 'bg-accent-tint text-accent'
                      : 'bg-line text-ink-soft'
                }`}
              >
                {row.icon}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink">{row.title}</div>
                <div className="truncate text-[11px] text-ink-soft">{row.meta}</div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-[13.5px] font-semibold text-ink">{row.amount}</div>
              {row.sub && <div className="num text-[10.5px] text-ink-soft">{row.sub}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AddExpenseMock() {
  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-4 shadow-raised">
      <div className="mb-3 font-display text-[14px] font-semibold text-ink">Add an expense</div>
      <div className="mb-2.5 rounded-lg border border-dashed border-line px-3 py-2.5 text-[12.5px] text-ink-soft">
        Or describe it: <span className="font-medium text-ink">"lunch 24.50 split with…"</span>
      </div>
      <div className="mb-2.5">
        <div className="mb-1 text-[11.5px] text-ink-soft">What was it for?</div>
        <div className="rounded-lg border border-line bg-paper px-2.5 py-2 text-[12.5px] text-ink-soft">
          Dinner, taxi, hotel deposit…
        </div>
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1 text-[11.5px] text-ink-soft">Amount</div>
          <div className="rounded-lg border border-line bg-paper px-2.5 py-2 text-[12.5px] text-ink-soft">0.00</div>
        </div>
        <div>
          <div className="mb-1 text-[11.5px] text-ink-soft">Currency</div>
          <div className="rounded-lg border border-line bg-paper px-2.5 py-2 text-[12.5px] text-ink-soft">
            USD — United States Dollar
          </div>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11.5px] text-ink-soft">Split between</div>
        <div className="flex gap-1.5">
          {['Equal', 'Percentage', 'Exact amounts', 'Itemized'].map((label, i) => (
            <span
              key={label}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                i === 0 ? 'border-primary bg-primary text-on-primary' : 'border-line text-ink-soft'
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReportsMock() {
  const bars = [
    { label: 'Groceries', value: 111.28, pct: 92, color: 'bg-[#3e7c8c]' },
    { label: 'Misc', value: 52.68, pct: 44, color: 'bg-[#8b8c7a]' },
    { label: 'Taxi/Cab', value: 10.0, pct: 8, color: 'bg-[#8c5ba6]' },
  ]
  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-4 shadow-raised">
      <div className="mb-0.5 text-[11.5px] text-ink-soft">Total spent</div>
      <div className="mb-4 font-display text-2xl font-semibold text-ink">$173.96</div>
      <div className="space-y-2.5">
        {bars.map((b) => (
          <div key={b.label} className="grid grid-cols-[68px_1fr] items-center gap-2 text-xs">
            <span className="text-ink-soft">{b.label}</span>
            <div className="h-3.5 overflow-hidden rounded bg-line">
              <div className={`h-full rounded ${b.color}`} style={{ width: `${b.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3.5 border-t border-line pt-3 text-[11.5px] text-ink-soft">
        {bars.map((b) => (
          <span key={b.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${b.color}`} />
            {b.label} · ${b.value.toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Overview() {
  const [showcase, setShowcase] = useState('ledger')
  const [region, setRegion] = useState('us')

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <nav className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
            <span className="font-display text-lg font-semibold text-ink">Split Expenses</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/help" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Help
            </Link>
            <ThemeToggle />
            <Link to="/login" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Sign in
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dark"
            >
              Create free account
            </Link>
          </div>
        </nav>

        <div className="grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-3.5 flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-wide text-accent">
              <span className="h-px w-4 bg-accent" />
              Shared expenses, any currency
            </div>
            <h1 className="font-display text-[32px] font-medium leading-[1.1] text-ink sm:text-[42px]">
              Split group expenses, even when everyone's{' '}
              <span className="text-primary">paying in different money.</span>
            </h1>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-soft">
              Split Expenses is a shared ledger for trips, roommates, and recurring groups — log what you paid in
              whatever currency you paid it in, and it converts, splits, and tracks who owes whom automatically.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="rounded-full bg-primary px-5 py-2.5 text-[15px] font-semibold text-on-primary transition-colors hover:bg-primary-dark"
              >
                Create free account
              </Link>
              <a
                href="#how"
                className="rounded-full border border-line bg-paper-raised px-5 py-2.5 text-[15px] font-semibold text-ink transition-colors hover:border-accent"
              >
                See how it works ↓
              </a>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-owed">✓</span>Free during early access
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-owed">✓</span>No card required
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-owed">✓</span>Your data, exportable anytime
              </span>
            </div>
          </div>
          <ExampleLedgerCard />
        </div>
      </div>

      <section id="how" className="border-t border-line py-12 sm:py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="mb-9 max-w-xl">
            <div className="mb-2.5 font-mono text-[11.5px] uppercase tracking-wide text-accent">
              What it does, in three steps
            </div>
            <h2 className="font-display text-2xl font-medium text-ink sm:text-[29px]">
              No spreadsheet, no group math in your head.
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                n: 1,
                title: 'Log what you paid',
                body: 'Type it, describe it in a sentence, or snap a receipt — in whatever currency you actually spent.',
              },
              {
                n: 2,
                title: 'It splits and converts',
                body: "Equal, percentage, exact, shares, adjustment, or item-by-item — everyone sees their share in the group's home currency.",
              },
              {
                n: 3,
                title: 'Settle with one tap',
                body: 'See the fewest payments needed to clear every debt, then jump straight into UPI, Venmo, or PayPal.',
              },
            ].map((step) => (
              <div key={step.n}>
                <div className="mb-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary-tint font-mono text-xs font-semibold text-primary">
                  {step.n}
                </div>
                <h4 className="mb-1.5 text-[16px] font-semibold text-ink">{step.title}</h4>
                <p className="text-[13.5px] leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line py-12 sm:py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="mb-9 max-w-xl">
            <div className="mb-2.5 font-mono text-[11.5px] uppercase tracking-wide text-accent">Why people switch</div>
            <h2 className="font-display text-2xl font-medium text-ink sm:text-[29px]">
              Built for groups that actually travel and share.
            </h2>
          </div>
          <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
            {USPS.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-paper-raised p-5 shadow-raised">
                <div className="mb-3.5 flex h-8.5 w-8.5 items-center justify-center rounded-lg bg-accent-tint font-mono text-sm font-semibold text-accent">
                  {f.icon}
                </div>
                <h4 className="mb-1.5 text-[15px] font-semibold text-ink">{f.title}</h4>
                <p className="text-[13px] leading-relaxed text-ink-soft">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line py-12 sm:py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="mb-8 max-w-xl">
            <div className="mb-2.5 font-mono text-[11.5px] uppercase tracking-wide text-accent">See it in action</div>
            <h2 className="mb-2.5 font-display text-2xl font-medium text-ink sm:text-[29px]">
              Real screens, not a promise.
            </h2>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              The three screens people open most — currency conversion and all.
            </p>
          </div>

          <div className="mb-6 flex flex-wrap gap-1.5">
            {SHOWCASE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setShowcase(tab.id)}
                className={`rounded-full border px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                  showcase === tab.id
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-line bg-paper-raised text-ink-soft hover:border-primary/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid items-center gap-9 lg:grid-cols-2">
            {showcase === 'ledger' && (
              <>
                <div>
                  <h3 className="mb-2.5 text-xl font-semibold text-ink">One ledger, any mix of currencies.</h3>
                  <p className="mb-4 text-[14.5px] leading-relaxed text-ink-soft">
                    Log a dinner in euros, a cab in dollars — every row still rolls up to the trip's home currency,
                    converted at the rate on the day it happened.
                  </p>
                  <ul className="space-y-2.5 text-[13.5px] text-ink">
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Live conversion, not a manual lookup
                    </li>
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Itemized receipts stay attached to the line
                    </li>
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Included free during early access
                    </li>
                  </ul>
                </div>
                <ExampleLedgerCard />
              </>
            )}
            {showcase === 'add' && (
              <>
                <div>
                  <h3 className="mb-2.5 text-xl font-semibold text-ink">Type a sentence. It fills the form.</h3>
                  <p className="mb-4 text-[14.5px] leading-relaxed text-ink-soft">
                    "Lunch 24.50 split with Jayashree" becomes a categorized, split expense — plain English
                    straight into the ledger.
                  </p>
                  <ul className="space-y-2.5 text-[13.5px] text-ink">
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Or scan a receipt and let OCR itemize it
                    </li>
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Equal, percentage, exact, shares, adjustment, or
                      itemized splits
                    </li>
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Save a group's usual split as the default
                    </li>
                  </ul>
                </div>
                <AddExpenseMock />
              </>
            )}
            {showcase === 'reports' && (
              <>
                <div>
                  <h3 className="mb-2.5 text-xl font-semibold text-ink">Where the money actually went.</h3>
                  <p className="mb-4 text-[14.5px] leading-relaxed text-ink-soft">
                    A category breakdown for every trip, on by default — no upgrade needed to see it.
                  </p>
                  <ul className="space-y-2.5 text-[13.5px] text-ink">
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Spend by category, every trip
                    </li>
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Included free during early access
                    </li>
                    <li className="flex gap-2.5">
                      <span className="font-bold text-owed">✓</span>Export the same data to CSV in one tap
                    </li>
                  </ul>
                </div>
                <ReportsMock />
              </>
            )}
          </div>
        </div>
      </section>

      <section id="compare" className="border-t border-line py-12 sm:py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="mb-8 max-w-xl">
            <div className="mb-2.5 font-mono text-[11.5px] uppercase tracking-wide text-accent">
              What's included
            </div>
            <h2 className="mb-2.5 font-display text-2xl font-medium text-ink sm:text-[29px]">
              Free covers the whole trip. Plus goes further.
            </h2>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              No feature here is held back to force an upgrade — Free is a complete, real product on its own. Plus
              adds the handful of things that take real infrastructure to run (live rates, OCR), and everything on
              this page is free for early-access accounts either way.
            </p>
          </div>

          <div className="mb-6 grid gap-7 sm:grid-cols-3">
            <ul className="space-y-3.5">
              {['Unlimited trips and expenses', 'Circles for recurring groups', 'Equal, percentage, exact, shares, adjustment & itemized splits', 'Balance calculation & debt simplification'].map(
                (item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-ink">
                    <span className="w-4 shrink-0 text-center text-primary">✓</span>
                    {item}
                  </li>
                )
              )}
            </ul>
            <ul className="space-y-3.5">
              {['One-tap settle-up (UPI, Venmo, PayPal)', 'CSV export & bulk import', '30-day recoverable archive', 'Dark mode & offline sync'].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-ink">
                  <span className="w-4 shrink-0 text-center text-primary">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <ul className="space-y-3.5">
              <li className="flex items-start gap-2.5 text-sm text-ink">
                <span className="w-4 shrink-0 text-center text-accent">◆</span>Multi-currency, live conversion
              </li>
              <li className="flex items-start gap-2.5 text-sm text-ink">
                <span className="w-4 shrink-0 text-center text-accent">◆</span>Category spending reports & charts
              </li>
              <li className="flex items-start gap-2.5 text-sm text-ink">
                <span className="w-4 shrink-0 text-center text-accent">◆</span>Receipt scanning (OCR) & itemization
              </li>
              <li className="flex items-start gap-2.5 text-sm text-ink">
                <span className="w-4 shrink-0 text-center text-accent">◆</span>
                <span>
                  Log an expense by typing a sentence
                  <span className="ml-2 rounded bg-accent-tint px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-accent">
                    Not on Splitwise
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-ink">
                <span className="w-4 shrink-0 text-center text-accent">◆</span>Saved default splits per group
              </li>
            </ul>
          </div>

          <div className="mb-8 flex justify-center gap-6 border-t border-line pt-5 text-[13px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="text-primary">✓</span>Free, forever
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-accent">◆</span>Plus — free during early access
            </span>
          </div>

          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-semibold text-primary">
              <span className="text-[11px] transition-transform group-open:rotate-90">▸</span>
              See the full comparison against Splitwise
            </summary>
            <div className="mt-4.5">
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-owed/30 bg-owed-tint px-4.5 py-4 text-[13.5px] text-ink">
                <span>💸</span>
                <span>
                  <b className="text-owed">Nothing gated during early access</b> — every row below is available on
                  the free plan right now.
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-line bg-paper-raised shadow-raised">
                <table className="w-full min-w-[560px] border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {['Capability', 'This app', 'Splitwise (free)', 'Splitwise Pro'].map((h, i) => (
                        <th
                          key={h}
                          className={`border-b border-line px-4 py-3 text-left font-mono text-[10.5px] font-semibold uppercase tracking-wide ${
                            i === 1 ? 'text-primary' : 'text-ink-soft'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Multi-currency, live rates', 'Strong', 'Weak', 'Strong'],
                      ['Category reports / charts', 'Strong', 'Absent', 'Strong'],
                      ['Receipt scanning (OCR, itemized)', 'Strong', 'Absent', 'Strong'],
                      ['Log an expense by typing a sentence', 'Strong', 'Absent', 'Absent'],
                      ['Default / saved split settings', 'Strong', 'Absent', 'Strong'],
                      ['CSV export & bulk import', 'Strong', 'Weak', 'Strong'],
                      ['Expense cap / ads on free tier', 'None, ever', '~3/day + ads', 'None'],
                    ].map((row, ri) => (
                      <tr key={row[0]} className={ri === 6 ? '' : 'border-b border-line'}>
                        <td className="px-4 py-3 font-medium text-ink">{row[0]}</td>
                        {row.slice(1).map((cell, ci) => (
                          <td key={ci} className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 font-semibold ${
                                cell === 'Absent'
                                  ? 'font-normal text-ink-soft'
                                  : cell === 'Weak' || cell.includes('/day')
                                    ? 'text-accent'
                                    : 'text-owed'
                              }`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {cell}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11.5px] text-ink-soft">
                Splitwise pricing and feature gating as documented in this project's own competitive research, current
                as of 2026.
              </p>
            </div>
          </details>
        </div>
      </section>

      <section id="pricing" className="border-t border-line py-12 sm:py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="mb-8 max-w-xl">
            <div className="mb-2.5 font-mono text-[11.5px] uppercase tracking-wide text-accent">Pricing</div>
            <h2 className="mb-2.5 font-display text-2xl font-medium text-ink sm:text-[29px]">
              Free to start. Honestly priced later.
            </h2>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              Every feature above is free during early access. When Plus launches, pricing is set relative to what
              people already pay for Splitwise Pro — never above it.
            </p>
          </div>

          <div className="mb-7 flex items-start gap-3 rounded-xl border border-accent/35 bg-accent-tint px-4.5 py-3.5 text-[13.5px] text-ink">
            <span>🎁</span>
            <span>
              <b className="text-accent">Early-access pricing:</b> everything on this page is free for every account
              created now — that price is locked in for as long as you keep the account, even after Plus launches.
            </span>
          </div>

          <div className="mb-7 inline-flex gap-1 rounded-full border border-line bg-paper-raised p-1">
            {[
              { id: 'us', label: 'Global (USD)' },
              { id: 'in', label: 'India (INR)' },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRegion(r.id)}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                  region === r.id ? 'bg-primary text-on-primary' : 'text-ink-soft'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-paper-raised p-6 shadow-raised">
              <div className="mb-2 font-mono text-[10.5px] uppercase tracking-wide text-ink-soft">Free</div>
              <h3 className="mb-2.5 text-lg font-semibold text-ink">Free, always</h3>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="num font-display text-3xl font-semibold text-ink">
                  {region === 'us' ? '$0' : '₹0'}
                </span>
                <span className="text-[13px] text-ink-soft">/ forever</span>
              </div>
              <div className="mb-4.5 text-xs text-ink-soft">The core ledger — no trial, no expiry.</div>
              <ul className="mb-5 space-y-2.5 text-[13.5px]">
                <li className="flex gap-2.5">
                  <span className="font-bold text-owed">✓</span>Unlimited trips and expenses
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bold text-owed">✓</span>Equal / percentage / exact / shares / adjustment
                  splits
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bold text-owed">✓</span>Settle-up deep links{region === 'in' ? ' via UPI' : ''}
                </li>
              </ul>
              <Link
                to="/signup"
                className="block rounded-full border border-line bg-paper px-5 py-2.5 text-center text-sm font-semibold text-ink transition-colors hover:border-primary"
              >
                Create free account
              </Link>
            </div>

            <div className="rounded-2xl border border-primary bg-paper-raised p-6 shadow-raised">
              <div className="mb-2 font-mono text-[10.5px] uppercase tracking-wide text-primary">
                Plus · after early access
              </div>
              <h3 className="mb-2.5 text-lg font-semibold text-ink">Everything, unlocked</h3>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="num font-display text-2xl font-semibold text-ink-soft line-through decoration-2">
                  {region === 'us' ? '$24.99' : '₹999'}
                </span>
                <span className="text-[13px] text-ink-soft">/ year, someday</span>
              </div>
              <div className="mb-4.5 text-xs text-ink-soft">
                Not active — no billing exists yet. Included free for as long as you're on an early-access account.
                {region === 'in' && " Shown for reference against Splitwise Pro's ₹2,499/year in India."}
              </div>
              <ul className="mb-5 space-y-2.5 text-[13.5px]">
                <li className="flex gap-2.5">
                  <span className="font-bold text-owed">✓</span>Multi-currency conversion & reports
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bold text-owed">✓</span>Receipt scanning (OCR) & itemization
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bold text-owed">✓</span>CSV export / bulk import
                </li>
              </ul>
              <Link
                to="/signup"
                className="block rounded-full bg-primary px-5 py-2.5 text-center text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dark"
              >
                Create free account
              </Link>
            </div>
          </div>
          <p className="mt-4 text-[11.5px] text-ink-soft">
            India pricing reflects standard purchasing-power-adjusted SaaS discounting (45–60% below global list
            price), not a flat currency conversion — for reference, Splitwise Pro is priced separately at
            ₹2,499/year in India rather than a like-for-like FX conversion of its $59.99 global price.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="my-12 rounded-3xl bg-primary-dark px-8 py-11 text-center text-on-primary sm:py-12">
          <h2 className="mb-2.5 font-display text-2xl font-medium sm:text-[28px]">
            Start free. Keep early-access pricing for life.
          </h2>
          <p className="mb-5 text-[14.5px] text-on-primary/80">
            Create a free account and add your first expense in under a minute.
          </p>
          <Link
            to="/signup"
            className="inline-block rounded-full bg-on-primary px-6 py-2.5 text-[15px] font-semibold text-primary-dark transition-opacity hover:opacity-90"
          >
            Create free account
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-10 text-xs text-ink-soft">
          <span>Split Expenses — shared expenses, any currency.</span>
          <span>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </div>
  )
}
