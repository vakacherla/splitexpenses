import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import FeatureRequestForm from '../components/FeatureRequestForm'
import { HELP_SECTIONS } from '../lib/helpContent'

function Section({ id, title, defaultOpen, children }) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group scroll-mt-6 border-b border-line py-4 [&_summary::-webkit-details-marker]:hidden"
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
  const location = useLocation()

  // Lets other screens link straight to the relevant section (e.g.
  // /help#balances) instead of dropping people at the top of a long page
  // they then have to scroll through to find the part that applies to them.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    if (el.tagName === 'DETAILS') el.open = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash])

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

        {HELP_SECTIONS.map((section) => (
          <Section key={section.id} id={section.id} title={section.title} defaultOpen={section.defaultOpen}>
            {section.body}
          </Section>
        ))}

        <Section id="feedback" title="Have an idea?" defaultOpen={Boolean(user)}>
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
