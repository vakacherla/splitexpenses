// Small line-icon per expense category, replacing the plain colored dot on
// Ledger rows. Deliberately hand-drawn to match the app's existing icon
// style (see the receipt-scan icon in AddExpenseForm) rather than pulling
// in an icon library for a fixed, small set of glyphs. Misc keeps a plain
// filled dot rather than a shape — fitting, since it's the catch-all with
// no specific thing to depict.
const ICON_PATHS = {
  Food: (
    <path d="M7 3v5M10 3v5M13 3v5M7 8h6M10 8v9" strokeLinecap="round" strokeLinejoin="round" />
  ),
  Lodging: (
    <>
      <path d="M3 17V7M3 13h14v4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="9" width="5" height="4" rx="1" />
    </>
  ),
  Flights: <path d="M17 3 3 9l6 2 2 6 6-14Z" strokeLinecap="round" strokeLinejoin="round" />,
  Train: (
    <>
      <rect x="4" y="4" width="12" height="8" rx="1.5" />
      <path d="M4 8h12M6 12v2M14 12v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="15.3" r="1.3" />
      <circle cx="14" cy="15.3" r="1.3" />
    </>
  ),
  'Taxi/Cab': (
    <>
      <path
        d="M3 12v-1l1.2-3.5A2 2 0 0 1 6 6h8a2 2 0 0 1 1.9 1.4L17 11v1M3 12h14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="14" r="1.4" />
      <circle cx="13.5" cy="14" r="1.4" />
    </>
  ),
  Groceries: (
    <path
      d="M5 8h10l-1 9H6L5 8ZM7.5 8V6a2.5 2.5 0 0 1 5 0v2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  Shopping: (
    <path
      d="M4 11 11 4h6v6l-7 7-6-6Z M14.5 7.5h.01"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  Activities: (
    <path
      d="M3 6h14v8H3V6Zm7 0v8"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="2 2"
    />
  ),
  Utilities: <path d="m11 3-6 8h4l-1 6 6-8h-4l1-6Z" strokeLinecap="round" strokeLinejoin="round" />,
}

export default function CategoryIcon({ category, color, className = 'h-3.5 w-3.5' }) {
  if (category === 'Misc' || !ICON_PATHS[category]) {
    return (
      <span
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
    )
  }

  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth="1.4"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      {ICON_PATHS[category]}
    </svg>
  )
}
