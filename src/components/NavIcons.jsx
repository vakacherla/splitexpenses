// Line icons for the main menu, in the same hand-drawn stroke style as the
// rest of the app.

const base = { viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true, focusable: 'false' }
const stroke = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }

function TripsIcon({ className }) {
  return (
    <svg {...base} className={className}>
      <path d="M10 2.8c-3 0-5.2 2.2-5.2 5.1 0 3.8 5.2 9.3 5.2 9.3s5.2-5.5 5.2-9.3c0-2.9-2.2-5.1-5.2-5.1z" {...stroke} />
      <circle cx="10" cy="7.9" r="1.9" {...stroke} />
    </svg>
  )
}

function CirclesIcon({ className }) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="6.4" strokeDasharray="2.4 2.4" {...stroke} />
      <circle cx="10" cy="3.7" r="1.6" fill="currentColor" />
      <circle cx="15.5" cy="13.2" r="1.6" fill="currentColor" />
      <circle cx="4.5" cy="13.2" r="1.6" fill="currentColor" />
    </svg>
  )
}

function RatesIcon({ className }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h10.5M14.5 7 11.5 4M14.5 7l-3 3M16 13H5.5M5.5 13 8.5 10M5.5 13l3 3" {...stroke} />
    </svg>
  )
}

function HelpIcon({ className }) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="7.25" {...stroke} />
      <path d="M7.8 7.8a2.2 2.2 0 1 1 3.2 1.96c-.75.4-1 .75-1 1.44v.3" {...stroke} />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
    </svg>
  )
}

function ProfileIcon({ className }) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="7" r="3" {...stroke} />
      <path d="M4 16.5c.8-3 3-4.4 6-4.4s5.2 1.4 6 4.4" {...stroke} />
    </svg>
  )
}

const ICONS = { trips: TripsIcon, circles: CirclesIcon, rates: RatesIcon, help: HelpIcon, profile: ProfileIcon }

export default function NavIcon({ id, className = 'h-5 w-5' }) {
  const Icon = ICONS[id] ?? TripsIcon
  return <Icon className={className} />
}
