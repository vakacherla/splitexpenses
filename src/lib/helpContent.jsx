// Shared with both the full Help page (HelpPage.jsx) and the inline
// HelpPopover a screen's "?" icon opens — one copy of the wording either
// way, so a section can be read in place (via HelpLink) or as part of the
// full guide, without the two ever drifting apart.
//
// Sections a HelpLink points at are written field-by-field, matching what's
// actually on that screen (exact limits, defaults, validation messages) —
// a generic overview doesn't answer "why won't this date save."

function H({ children }) {
  return <h4 className="font-display text-sm font-semibold text-ink pt-1 first:pt-0">{children}</h4>
}

export const HELP_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    defaultOpen: true,
    body: (
      <>
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
          in whatever currency they actually paid in).
        </p>
      </>
    ),
  },
  {
    id: 'adding-expense',
    title: 'Adding an expense',
    body: (
      <>
        <p>
          Open a group and tap the <strong className="text-ink">+</strong> button.
        </p>
        <H>Description &amp; category</H>
        <p>
          Description is required — a short blank one gets "Give the expense a short description." Category
          is a dropdown of fixed options and defaults to "Misc" if you skip it.
        </p>
        <H>Amount &amp; currency</H>
        <p>
          Must be greater than zero. Currency defaults to the group's home currency; pick a different one and
          you'll see today's converted amount before saving (offline, that conversion is filled in once
          you're back online instead).
        </p>
        <H>Paid by &amp; split with</H>
        <p>
          Payer defaults to you. Split-with is a checkbox list of members — uncheck anyone not part of this
          expense, but at least one person must stay checked.
        </p>
        <H>How to split it</H>
        <p>
          <strong className="text-ink">Equal</strong> divides evenly. <strong className="text-ink">
          Percentage</strong> needs each person's share to add up to 100% (a little rounding slack is fine).{' '}
          <strong className="text-ink">Exact amounts</strong> needs the shares to add up to the total, to the
          cent. <strong className="text-ink">Itemized</strong> needs at least one line item, each with a
          description, an amount above zero, and at least one person assigned — tax and tip, if you add them,
          split proportionally by what each person actually ordered.
        </p>
        <p>
          Tick <strong className="text-ink">"Save this as the default"</strong> (Equal or Percentage only) to
          pre-select that split next time anyone in the group adds an expense.
        </p>
        <H>Faster ways to fill this in</H>
        <p>
          <strong className="text-ink">Describe it in one line</strong> — "lunch 24.50 split with Anna and
          Ben" — and tap Parse to fill description, amount, currency, category, payer, and split from that
          sentence. <strong className="text-ink">Scan a receipt</strong> to fill description/amount/date/
          category from a photo, or split it item-by-item automatically if the photo shows a line-by-line
          bill. Both need a connection, and both are a starting point — check what filled in before saving.
        </p>
        <H>After it's saved</H>
        <p>
          Expand an expense to <strong className="text-ink">attach a receipt</strong> photo later, or{' '}
          <strong className="text-ink">Duplicate</strong> it for a recurring cost like rent — everything
          copies except the date, which resets to today.
        </p>
      </>
    ),
  },
  {
    id: 'search-export-import',
    title: 'Search, export, and bulk import',
    body: (
      <>
        <p>
          The Ledger has a <strong className="text-ink">search box and a category filter</strong> once a
          group has more than a few expenses — search matches the description or who paid.
        </p>
        <p>
          <strong className="text-ink">Export CSV</strong> downloads every expense as a spreadsheet, one row
          per expense, splits included.
        </p>
        <H>Import CSV</H>
        <p>
          Tap "Download template" for a CSV with the exact columns expected — <em>Date, Description,
          Category, Paid by (email), Amount, Currency, Split between, Note</em> — people are matched by
          email, so there's no ambiguity about who's who. It's capped at{' '}
          <strong className="text-ink">500 rows per file</strong>; split a bigger backlog into a few files.
        </p>
        <p>
          Every row is validated before anything is created — if even one row has a problem, nothing is
          imported until it's fixed. If something goes wrong partway through, whatever was already created
          gets automatically rolled back, so you're never left with a half-finished import.
        </p>
        <p>Made a mistake anyway? Every import is undoable in one click, right after it finishes or later from Group settings.</p>
      </>
    ),
  },
  {
    id: 'offline',
    title: 'Working offline',
    body: (
      <>
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
      </>
    ),
  },
  {
    id: 'balances',
    title: 'Balances & settling up',
    body: (
      <>
        <H>Where everyone stands</H>
        <p>
          Each person's row shows whether they're settled up, owed money, or owe money, for the group
          overall.
        </p>
        <H>Suggested settle-up</H>
        <p>
          Shows the fewest possible payments needed to square everyone up — smarter than paying back every
          individual expense separately, so don't be surprised if it suggests you pay someone you never
          directly split anything with. The math still works out the same for everyone.
        </p>
        <H>Recording a payment</H>
        <p>
          Tap <strong className="text-ink">"Record payment"</strong> next to a suggestion — you can adjust
          the amount or currency if that's easier. If the person you're paying has added a payment handle
          (see "Your profile"), you'll also see a one-tap "Pay via UPI / Venmo / PayPal" button. Recording a
          payment only tells the app it happened — it doesn't move money itself; still pay them the normal
          way.
        </p>
        <p>
          <strong className="text-ink">Remind</strong> is shown to you on anything you're owed, and nudges
          the other person. Made a mistake? Any recorded payment can be undone from here.
        </p>
      </>
    ),
  },
  {
    id: 'reports',
    title: 'Reports',
    body: (
      <>
        <p>Everything below is converted into the group's home currency first, so totals always compare like for like.</p>
        <p>
          <strong className="text-ink">Total spent</strong>, a breakdown{' '}
          <strong className="text-ink">by category</strong>, a breakdown{' '}
          <strong className="text-ink">by who paid</strong>, and a table crossing the two — useful for "where
          did all our money actually go" after a trip.
        </p>
      </>
    ),
  },
  {
    id: 'activity',
    title: 'Activity feed & notifications',
    body: (
      <>
        <p>
          A running history of the group's last 100 events, newest first — expenses added, edited, or
          deleted, payments recorded or undone, people joining or leaving, and CSV imports (one entry per
          import, not one per row). It's there to catch up on what happened while you were away.
        </p>
        <p>
          Turn on <strong className="text-ink">notifications</strong> (see "Your profile") to also get a
          push alert on this device for group activity and settle-up reminders — tapping one takes you
          straight to that group.
        </p>
      </>
    ),
  },
  {
    id: 'members',
    title: 'Members',
    body: (
      <>
        <H>Invite code</H>
        <p>Tap "Copy" to share it — anyone with the code can join this group from their dashboard.</p>
        <H>Managers</H>
        <p>
          Only the group's owner can promote or demote a manager, and can't do it to themselves or to
          whoever originally created the group.
        </p>
        <H>Removing someone</H>
        <p>
          The owner can remove anyone except the creator; a manager can only remove ordinary members (not the
          owner, creator, or other managers). Removing is blocked while that person still has an outstanding
          balance — settle up first. Their past expenses stay in the ledger either way.
        </p>
        <p>Your own row shows "Edit your info" instead, linking to your profile.</p>
      </>
    ),
  },
  {
    id: 'group-settings',
    title: 'Group settings',
    body: (
      <>
        <p>Only the group's owner and any manager can see this (the gear icon next to the group's name).</p>
        <H>Trip dates</H>
        <p>
          Optional and independent — set just a start, just an end, both, or neither. Each date must fall
          between <strong className="text-ink">2000 and 2100</strong>, and if both are set, the end date
          can't be before the start (same-day trips are fine). Once the end date passes, anyone who still
          owes money gets an automatic reminder.
        </p>
        <H>Cover photo</H>
        <p>
          Landscape photos work best — square or portrait shots get cropped to fit. Shows up on your
          dashboard card and the group page itself.
        </p>
        <H>Duplicate group</H>
        <p>
          Copies the members, their manager roles, and the home currency into a new group with a fresh invite
          code. Expenses, settlements, and trip dates are <strong className="text-ink">not</strong> copied —
          it's meant for a next trip with the same people, not a backup.
        </p>
        <H>Deleting a group</H>
        <p>
          You'll need to type the group's exact name to confirm. This removes it from everyone's dashboard
          right away, but nothing is actually deleted — the app's admin can restore it in full for 30 days,
          after which it's gone for good.
        </p>
      </>
    ),
  },
  {
    id: 'profile',
    title: 'Your profile',
    body: (
      <>
        <p>Tap your name (top right) to open this.</p>
        <H>Payment handle</H>
        <p>
          Pick a provider (UPI, Venmo, or PayPal.me) and add your handle so other members get a one-tap pay
          button when they owe you. Clear the handle and the provider clears with it.
        </p>
        <H>Phone numbers</H>
        <p>
          Two optional, independent fields — a home number and a separate travel number, useful if you're on
          a local SIM for part of a trip.
        </p>
        <H>Nicknames per group</H>
        <p>
          Set a different display name for one specific group without changing your name anywhere else —
          only that group sees it. Clear it to go back to your regular name.
        </p>
        <H>Notifications</H>
        <p>
          Turn on push alerts for this device for group activity and settle-up reminders. If your browser
          doesn't support push, reminders still arrive by email.
        </p>
        <p>
          The sun/moon icon in the top corner (on every screen) switches between light and dark mode — your
          choice is remembered.
        </p>
      </>
    ),
  },
  {
    id: 'rates',
    title: 'Exchange rates',
    body: (
      <>
        <p>
          Rates come from Frankfurter, built on European Central Bank reference rates and refreshed each
          weekday. This page is informational only — it never touches an expense you've already logged.
        </p>
        <p>
          The base currency starts on whichever home currency is most common across your groups. Use the{' '}
          <strong className="text-ink">quick-convert box</strong> for a one-off amount, or scroll the table
          below it to see that base currency against everything else.
        </p>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'A few common questions',
    body: (
      <>
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
      </>
    ),
  },
]
