// Loading placeholders shaped like the content they stand in for, rather
// than a spinner or "Loading…" text — reduces layout jump and reads as
// faster since something resembling the real content is already there.

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-line/70 ${className}`} aria-hidden="true" />
}

// Matches the app's common divide-y list-row shape: a title line, a
// shorter subtitle line, and an optional trailing chunk (an amount, a
// chevron). Used for the Dashboard's trip list, RatesPage's currency
// list, and several Admin tabs.
export function SkeletonRows({ count = 5, trailing = true }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center justify-between py-4 gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <Skeleton className={`h-4 ${i % 3 === 0 ? 'w-40' : i % 3 === 1 ? 'w-52' : 'w-32'}`} />
            <Skeleton className="h-3 w-24" />
          </div>
          {trailing && <Skeleton className="h-4 w-14 shrink-0" />}
        </li>
      ))}
    </ul>
  )
}

// A chart-shaped placeholder, for the moment while a lazy-loaded charting
// panel's JS chunk is still being fetched.
export function SkeletonChart() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="flex gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  )
}

// Matches Admin Overview's stat-card grid.
export function SkeletonStatGrid({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-paper-raised px-4 py-4 space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}
