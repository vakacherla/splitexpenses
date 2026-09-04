// A warmer empty state: a small icon in a soft tinted circle, above the
// title/subtitle text — used for the handful of "nothing here yet" cards
// that are a page's main content area (not minor inline messages like
// "Nothing in the trash", which don't need this treatment).
export default function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="text-center border border-dashed border-line rounded-2xl py-16 px-6">
      <div
        className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary-tint text-primary flex items-center justify-center"
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="font-display text-lg text-ink mb-1">{title}</p>
      <p className="text-sm text-ink-soft">{subtitle}</p>
    </div>
  )
}
