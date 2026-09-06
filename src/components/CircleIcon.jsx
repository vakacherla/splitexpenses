import { hashString } from './GroupIcon'

// Same hand-drawn, deterministic-per-id pattern as GroupIcon — a
// different glyph set (a ring of people, sun, tree, interlocking rings)
// so a Circle reads visually distinct from any individual Trip inside
// it, purely decorative, picked from the Circle's own id.
const ICONS = [
  // Ring of people
  <>
    <circle cx="10" cy="4.7" r="1.4" />
    <circle cx="15.3" cy="10" r="1.4" />
    <circle cx="10" cy="15.3" r="1.4" />
    <circle cx="4.7" cy="10" r="1.4" />
    <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
  </>,
  // Sun
  <>
    <circle cx="10" cy="10" r="3.2" />
    <path
      d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M15 5l-1.1 1.1M6.1 13.9 5 15M15 15l-1.1-1.1M6.1 6.1 5 5"
      strokeLinecap="round"
    />
  </>,
  // Tree
  <>
    <path d="M10 17v-5" strokeLinecap="round" />
    <path d="M10 12c-3 0-5-2-5-4.5S7 3 10 3s5 2 5 4.5-2 4.5-5 4.5Z" strokeLinejoin="round" />
  </>,
  // Interlocking rings
  <>
    <circle cx="7.5" cy="10" r="4" />
    <circle cx="12.5" cy="10" r="4" />
  </>,
]

export function circleIconIndex(id) {
  return hashString(id) % ICONS.length
}

export default function CircleIcon({ id, className = 'h-[18px] w-[18px]' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className={className}
      aria-hidden="true"
    >
      {ICONS[circleIconIndex(id)]}
    </svg>
  )
}
