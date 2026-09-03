import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import FeatureRequestForm from '../components/FeatureRequestForm'

function Section({ title, defaultOpen, children }) {
  return (
    <details
      open={defaultOpen}
      className="group border-b border-line py-4 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex items-center justify-between cursor-pointer list-none">
        <span className="font-display text-lg text-ink">{title}</span>
        <svg
          className="w-4 h-4 text-ink-soft shrink-0 transition-transform group-open:rotate-180"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="mt-3 text-sm text-ink-soft leading-relaxed space-y-2.5">{children}</div>
    </details>
  )
}

export default function HelpPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-dvh bg-paper">
      {/* When logged in, the shared Navbar (rendered by AppShell) already
          covers brand/back/theme — showing this too would duplicate it.
          When logged out, there's no Navbar at all, so this page needs
          its own lightweight header. */}
      {!user && (
        <header className="border-b border-line bg-paper-raised">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 h-16 flex items-center justify-between">
            <span className="font-display text-xl font-semibold text-ink tracking-tight">Split Expenses</span>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm text-ink-soft hover:text-ink">
                ← Back to sign in
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}

      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
        {user && (
          <Link to="/dashboard" className="text-sm text-ink-soft hover:text-ink block mb-4">
            ← Your groups
          </Link>
        )}
        <h1 className="font-display text-3xl text-ink mb-2">How to use this</h1>
        <p className="text-sm text-ink-soft mb-8">
          A quick guide to everything in the app. Tap any section to open it — nothing here needs to be read in
          order.
        </p>

        <Section title="Getting started" defaultOpen>
          <p>
            <strong className="text-ink">Sign up</strong> with your email and a password — no confirmation
            steps needed for most groups.
          </p>
          <p>
            <strong className="text-ink">Join a group</strong> from your dashboard using the invite code
            whoever created the group sent you — tap "Join with a code," type it in, and you're in.
          </p>
          <p>
            <strong className="text-ink">Starting your own group?</strong> Tap "New group," give it a name and
            a home currency (this is just the currency balances are shown in — everyone can still log expenses
            in whatever currency they actually paid in). Share the invite code shown on the group's Members tab
            with anyone you want to add.
          </p>
        </Section>

        <Section title="Adding an expense">
          <p>
            Open a group and tap the <strong className="text-ink">+</strong> button. Fill in:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-ink">What it was for</strong> — a short description, plus a category
              (Food, Transport, Lodging, etc.) for the reports later.
            </li>
            <li>
              <strong className="text-ink">Amount and currency</strong> — if it's different from the group's
              home currency, you'll see the converted amount before saving, using that day's exchange rate.
            </li>
            <li>
              <strong className="text-ink">Who paid</strong>, and <strong className="text-ink">who to split
              it between</strong> — uncheck anyone who wasn't part of that particular expense.
            </li>
            <li>
              <strong className="text-ink">How to split it</strong>: Equal (default), Percentage (e.g. 60/40),
              or Exact amounts if it doesn't divide evenly.
            </li>
          </ul>
          <p>
            If your group always splits the same way, tick <strong className="text-ink">"Save this as the
            default"</strong> — it'll be pre-selected next time anyone adds an expense.
          </p>
          <p>
            <strong className="text-ink">Scanning a receipt</strong> (if your group has this turned on): tap
            "Scan a receipt" and take a photo — the description, amount, date, and category fill in
            automatically. Always double-check before saving; it's a starting point, not the final word.
          </p>
        </Section>

        <Section title="Understanding balances">
          <p>The Balances tab shows, for each person, whether they're owed money or owe money overall.</p>
          <p>
            Below that, <strong className="text-ink">"Suggested settle-up"</strong> shows the fewest possible
            payments needed to square everyone up — it's smarter than paying back every individual expense
            separately, so don't be surprised if it suggests you pay someone you didn't directly split anything
            with. The math still works out the same for everyone.
          </p>
        </Section>

        <Section title="Settling up">
          <p>
            When you're ready to pay someone back, tap <strong className="text-ink">"Record payment"</strong>{' '}
            next to a suggestion. You can adjust the amount or pay in a different currency if that's easier.
          </p>
          <p>
            If the person you're paying has added their payment info (see "Your profile" below), you'll see a{' '}
            <strong className="text-ink">"Pay via UPI / Venmo / PayPal"</strong> button that opens your payment
            app with the amount already filled in.
          </p>
          <p>
            Recording a payment just tells the app it happened — it doesn't move money itself. Still pay them
            the normal way (cash, bank transfer, the pay link above); this just keeps everyone's balance
            accurate afterward.
          </p>
          <p>Made a mistake? Any recorded payment can be undone from the Balances tab.</p>
        </Section>

        <Section title="Reports">
          <p>
            The Reports tab totals up everything the group has spent — broken down by category and by who
            paid — plus a table crossing the two. Useful for "where did all our money actually go" after a
            trip.
          </p>
        </Section>

        <Section title="Your profile">
          <p>
            Tap your name (top right) to open your profile. From there you can add a photo, change how your
            name displays, add your payment handle (UPI ID, Venmo username, or PayPal.me link) so other
            members get a one-tap pay button when they owe you, and add up to two phone numbers — a home
            number and a separate travel number, useful if you're on a local SIM for part of a trip.
          </p>
          <p>
            <strong className="text-ink">Going by a different name in one group?</strong> Your profile also
            lists every group you're in with a nickname field for each — set one and that group sees it
            instead of your regular name, without changing anything anywhere else.
          </p>
          <p>
            The sun/moon icon in the top corner (on every screen, including this one) switches between light
            and dark mode. Your choice is remembered.
          </p>
        </Section>

        <Section title="A few common questions">
          <p>
            <strong className="text-ink">Where can I just check today's exchange rate?</strong> The exchange
            icon in the top nav opens a rates page — pick a currency, see it against everything else, or use
            the quick-convert box for a one-off amount. Informational only; it doesn't touch any expense
            you've already logged.
          </p>
          <p>
            <strong className="text-ink">Can I edit or delete an expense?</strong> Tap it to expand, and
            anyone in the group can remove it from there. There's currently no edit — delete and re-add if
            something's wrong.
          </p>
          <p>
            <strong className="text-ink">Can I be in more than one group?</strong> Yes — your dashboard lists
            every group you're part of, and each is tracked completely separately.
          </p>
          <p>
            <strong className="text-ink">I forgot my password.</strong> Use the sign-in screen's password
            reset — if that email doesn't arrive, the group's admin (if it has one) can help directly, since
            self-service email delivery isn't guaranteed for every account.
          </p>
          <p>
            <strong className="text-ink">Is my data private?</strong> Only people in a group can see that
            group's expenses — nothing is public, and different groups can't see each other's information.
          </p>
        </Section>

        <Section title="Have an idea?" defaultOpen={Boolean(user)}>
          {user ? (
            <>
              <p>
                Missing something, or found something that could work better? A quick note here goes straight
                to whoever runs this app — no email or phone call needed.
              </p>
              <FeatureRequestForm userId={user.id} />
            </>
          ) : (
            <p>
              Sign in first — ideas are tied to your account so you can see how they're doing later, and so
              they don't get lost anonymously.
            </p>
          )}
        </Section>
      </div>
    </div>
  )
}
