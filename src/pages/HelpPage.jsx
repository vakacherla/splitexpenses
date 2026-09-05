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
          <p>
            <strong className="text-ink">Group settings</strong> (the gear icon next to a group's name, visible
            to its owner and any manager) is where you rename the group, set optional trip dates, add a cover
            photo — a real trip photo shows up on your dashboard card and the group page itself instead of the
            plain colored default — and duplicate the group (same people, fresh invite code) for a next trip.
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
            <strong className="text-ink">In a hurry? Just describe it.</strong> Type something like "lunch
            24.50 split with Anna and Ben" into the box above the form instead of filling in every field by
            hand, and tap "Parse" — the description, amount, currency, category, payer, and who to split with
            all fill in from that one sentence (defaulting sensibly — payer to you, split to everyone — for
            anything it can't confidently work out). Same as receipt scanning below, it's a starting point:
            review what filled in before saving.
          </p>
          <p>
            <strong className="text-ink">Scanning a receipt</strong> (if your group has this turned on): tap
            "Scan a receipt" and take a photo — the description, amount, date, and category fill in
            automatically. If the photo shows individual items, it can even split the bill "Itemized" —
            assign each item to whoever actually ordered it, and tax/tip get shared proportionally. Always
            double-check before saving; it's a starting point, not the final word.
          </p>
          <p>
            <strong className="text-ink">Skipped the scan, or want to add the photo later?</strong> Expand any
            expense that doesn't have a receipt yet and tap <strong className="text-ink">"Attach receipt"</strong> —
            same option also sits inside "Edit" if that's where you go looking for it first.
          </p>
          <p>
            <strong className="text-ink">Recurring expense, like rent?</strong> Expand it and tap{' '}
            <strong className="text-ink">"Duplicate"</strong> — it pre-fills a new expense with the same
            details (today's date, no receipt), so re-logging it is a few seconds instead of a fresh form.
          </p>
        </Section>

        <Section title="Search, export, and bulk import">
          <p>
            The Ledger has a <strong className="text-ink">search box and a category filter</strong> once a
            group has more than a few expenses — search matches the description or who paid.
          </p>
          <p>
            <strong className="text-ink">Export CSV</strong> downloads every expense in the group as a
            spreadsheet file, one row per expense, splits included.
          </p>
          <p>
            <strong className="text-ink">Import CSV</strong> is the reverse: bringing in a backlog you've
            already been tracking elsewhere. Tap "Download template" first — the file it gives you has the
            exact columns expected (people are matched by email, not name, so there's no ambiguity about who's
            who), fill in your rows, then upload it back. You'll see every row validated before anything is
            created — if even one row has a problem, nothing is imported until it's fixed, so you're never
            left guessing which rows actually went in. Files are capped at 500 rows; split a bigger backlog
            into a few smaller files. Made a mistake? Every import is undoable in one click, either right after
            it finishes or later from Group settings.
          </p>
        </Section>

        <Section title="Working offline">
          <p>
            No signal doesn't mean you can't log an expense. Add, edit, or delete an expense — or record a
            settlement — with no connection at all, and it shows up right away tagged{' '}
            <strong className="text-ink">"Pending sync."</strong> A banner at the top of the app tracks
            anything still waiting; everything syncs on its own the moment you're back online, with a manual
            "Retry now" if it doesn't happen right away.
          </p>
          <p>
            The one thing that still needs a connection is a receipt — scanning is a live photo-reading step,
            so it isn't available while offline. Add the expense now and attach the photo once you're
            reconnected instead.
          </p>
          <p>
            If two people happen to edit the very same expense while both offline, whichever edit syncs last
            wins — you'll see a note naming what got overwritten, so nothing changes silently.
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

        <Section title="Activity feed & notifications">
          <p>
            The <strong className="text-ink">Activity</strong> tab is a running history of everything that's
            happened in the group — expenses added, edited, or deleted, payments recorded or undone, people
            joining or leaving, and CSV imports (as one entry per import, not one per row). It's there to catch
            up on what happened while you were away, not just react in the moment.
          </p>
          <p>
            Turn on <strong className="text-ink">notifications</strong> (see "Your profile" below) to also get
            a push alert on this device when someone adds an expense, records a payment to you, or when a
            settle-up reminder comes due — tapping one takes you straight to that group.
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
            <strong className="text-ink">Notifications</strong> also live here — turn them on for this device
            to get a push alert for group activity and settle-up reminders. If your browser doesn't support
            push, reminders still arrive by email.
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
            <strong className="text-ink">Can I edit or delete an expense?</strong> Tap it to expand — if you
            entered it or paid for it, you'll see "Edit" and "Delete this expense" right there, for any split
            type. Deleting is a soft delete: it disappears from your ledger immediately, and only the app's
            admin can recover it (for 30 days) if that turns out to be a mistake.
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
