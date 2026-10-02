import { useState } from 'react'
import { WELCOME_CARDS, welcomeTitle } from '../lib/welcomeTour'
import WelcomeArt from './WelcomeArt'

// A short, dismissible first-run tour: four illustrated cards that explain
// Trip vs Circle and point to the first action. The parent decides when it
// shows and what the buttons on the last card do.
export default function WelcomeCards({ firstName, always, onAlwaysChange, onDismiss, onCreateTrip, onJoinTrip }) {
  const [step, setStep] = useState(0)
  const card = WELCOME_CARDS[step]
  const isLast = step === WELCOME_CARDS.length - 1

  return (
    <section
      aria-label="Welcome tour"
      className="mb-9 overflow-hidden rounded-3xl border border-line bg-paper-raised shadow-raised"
    >
      <div
        className="h-44 sm:h-52 px-6 pt-5"
        style={{
          backgroundImage:
            'linear-gradient(160deg, var(--color-primary-tint) 0%, color-mix(in srgb, var(--color-primary-tint) 55%, var(--color-accent-tint)) 100%)',
        }}
      >
        <WelcomeArt id={card.id} />
      </div>

      <div className="p-6 sm:p-8">
        <p className="font-mono text-[11px] uppercase tracking-wide text-accent" aria-live="polite">
          Step {step + 1} of {WELCOME_CARDS.length}
        </p>
        <h2 className="mt-2 font-display text-2xl sm:text-[28px] leading-tight text-ink">
          {welcomeTitle(card, firstName)}
        </h2>
        <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-ink-soft">{card.body}</p>
        {card.highlight && (
          <p className="mt-3 inline-block rounded-xl bg-primary-tint px-3.5 py-2 text-sm font-medium text-primary">
            {card.highlight}
          </p>
        )}

        <label className="mt-6 flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={always}
            onChange={(e) => onAlwaysChange(e.target.checked)}
            className="h-4 w-4 rounded border-line accent-primary"
          />
          Show this tour every time I open the app
        </label>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2" role="group" aria-label="Tour progress">
            {WELCOME_CARDS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                aria-current={i === step ? 'step' : undefined}
                className={`h-2 rounded-full transition-all ${
                  i === step ? 'w-6 bg-primary' : 'w-2 bg-line hover:bg-ink-soft'
                }`}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={onDismiss} className="text-sm text-ink-soft hover:text-ink">
              Skip
            </button>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="rounded-full border border-line bg-paper-raised px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent"
              >
                Back
              </button>
            )}
            {isLast ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onJoinTrip()
                    onDismiss()
                  }}
                  className="rounded-full border border-line bg-paper-raised px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent"
                >
                  I have a code: Join
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreateTrip()
                    onDismiss()
                  }}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dark"
                >
                  Create my first Trip
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dark"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
