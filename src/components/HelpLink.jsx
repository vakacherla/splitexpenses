import { useState } from 'react'
import { HELP_SECTIONS } from '../lib/helpContent'

// Opens the relevant Help section right over the current screen instead of
// navigating to /help — tapping "?" mid-form or mid-tab used to lose
// whatever the person was doing (a modal closed, a tab reset); this keeps
// them exactly where they were.
export default function HelpLink({ to, label = 'Help', className = '' }) {
  const [open, setOpen] = useState(false)
  const section = HELP_SECTIONS.find((s) => s.id === to)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs font-semibold text-ink-soft transition-colors hover:border-primary hover:text-ink ${className}`}
      >
        ?
      </button>

      {open && section && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
          <div className="w-full sm:max-w-md bg-paper-raised rounded-t-3xl sm:rounded-2xl border border-line shadow-raised p-5 sm:p-6 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-ink">{section.title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-ink-soft hover:text-ink text-sm"
              >
                Close
              </button>
            </div>
            <div className="text-sm text-ink-soft leading-relaxed space-y-2.5">{section.body}</div>
            <a
              href={`/help#${to}`}
              target="_blank"
              rel="noreferrer"
              className="block text-sm text-primary hover:underline"
            >
              Open the full guide ↗
            </a>
          </div>
        </div>
      )}
    </>
  )
}
