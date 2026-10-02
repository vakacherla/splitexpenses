import { useState } from 'react'
import { useInstall } from '../lib/useInstall'
import { readDismissedAt, recordDismissed, shouldOfferInstall } from '../lib/installPrompt'

// The Share icon people look for on iPhone: a box with an arrow leaving it.
function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="inline h-5 w-5 -mt-0.5 text-primary" aria-label="Share">
      <path d="M10 12.5V3.5M10 3.5 6.8 6.7M10 3.5l3.2 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 9H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// iPhone has no install button we can press for you, so: three steps.
function IosSteps({ browser }) {
  return (
    <div className="mt-3 rounded-xl bg-primary-tint px-4 py-3.5 text-sm text-ink">
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>
          Tap the Share button <ShareIcon />{' '}
          {browser === 'chrome' || browser === 'edge'
            ? '(in the address bar, or the ⋯ menu)'
            : browser === 'firefox'
              ? '(in the menu)'
              : '(at the bottom of Safari)'}
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong>
        </li>
        <li>
          Tap <strong>Add</strong>
        </li>
      </ol>
      {browser !== 'safari' && (
        <p className="mt-2.5 text-xs text-ink-soft">
          Don't see "Add to Home Screen"? Open this page in Safari and use the same steps there.
        </p>
      )}
    </div>
  )
}

function AppIcon() {
  return <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
}

// A dismissible banner for the dashboard. Comes back after two weeks if
// dismissed; never shows for someone who already installed the app.
export function InstallBanner() {
  const { mode, installed, browser, install } = useInstall()
  const [dismissedAt, setDismissedAt] = useState(readDismissedAt)
  const [showSteps, setShowSteps] = useState(false)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <p className="mb-8 rounded-2xl border border-line bg-paper-raised px-5 py-4 text-sm text-ink-soft">
        Installed. Look for Split Expenses on your home screen or app list.
      </p>
    )
  }
  if (!shouldOfferInstall({ installed, mode, dismissedAt })) return null

  return (
    <section aria-label="Install the app" className="mb-8 rounded-2xl border border-line bg-paper-raised p-5 shadow-raised">
      <div className="flex items-start gap-4">
        <AppIcon />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight text-ink">Install Split Expenses</p>
          <p className="mt-1 text-sm text-ink-soft">
            Open it like any other app, with its own icon and a full-screen window. It still works offline.
          </p>
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            {mode === 'native' ? (
              <button
                type="button"
                onClick={async () => {
                  if ((await install()) === 'accepted') setDone(true)
                }}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dark"
              >
                Install
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSteps((v) => !v)}
                aria-expanded={showSteps}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dark"
              >
                {showSteps ? 'Hide steps' : 'Show me how'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                recordDismissed()
                setDismissedAt(Date.now())
              }}
              className="text-sm text-ink-soft hover:text-ink"
            >
              Not now
            </button>
          </div>
          {mode === 'ios' && showSteps && <IosSteps browser={browser} />}
        </div>
      </div>
    </section>
  )
}

// The permanent version for Profile and Help, so someone who dismissed the
// banner can still find it. Always shown, whatever the device.
export function InstallCard() {
  const { mode, installed, browser, install } = useInstall()
  const [done, setDone] = useState(false)

  return (
    <section aria-label="Install the app" className="rounded-2xl border border-line bg-paper-raised p-5">
      <div className="flex items-start gap-4">
        <AppIcon />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight text-ink">Install the app</p>
          {installed || done ? (
            <p className="mt-1 text-sm text-ink-soft">You're already using the installed app.</p>
          ) : mode === 'native' ? (
            <>
              <p className="mt-1 text-sm text-ink-soft">Add Split Expenses to your device and open it like any other app.</p>
              <button
                type="button"
                onClick={async () => {
                  if ((await install()) === 'accepted') setDone(true)
                }}
                className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dark"
              >
                Install
              </button>
            </>
          ) : mode === 'ios' ? (
            <>
              <p className="mt-1 text-sm text-ink-soft">Add Split Expenses to your home screen:</p>
              <IosSteps browser={browser} />
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">
              In your browser's menu, look for "Install app" or "Add to Home screen". On a computer, Chrome and Edge
              show an install icon in the address bar.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
