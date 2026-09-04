// Small decorative per-group badge on the Dashboard — purely visual
// variety (no "group type" field exists or is being added), picked
// deterministically from the group's own id so it stays the same on every
// visit rather than reshuffling. Hand-drawn to match CategoryIcon's style
// rather than pulling in an icon library for four glyphs.
const ICONS = [
  // Compass
  <>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M12.5 7.5l-1.8 4.2-4.2 1.8 1.8-4.2 4.2-1.8Z" strokeLinejoin="round" />
  </>,
  // House
  <>
    <path d="M3.5 9.5 10 4l6.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 8.5V16h10V8.5" strokeLinejoin="round" />
    <path d="M8 16v-4h4v4" strokeLinejoin="round" />
  </>,
  // Mountain
  <>
    <path d="M2.5 15.5 7.5 7l3 4.2L13 8l4.5 7.5H2.5Z" strokeLinejoin="round" />
    <circle cx="14.5" cy="5.5" r="1.4" />
  </>,
  // Building
  <>
    <rect x="5" y="3" width="10" height="14" rx="1" />
    <path d="M8 6.5h1M11 6.5h1M8 9.5h1M11 9.5h1M8 12.5h1M11 12.5h1" strokeLinecap="round" />
  </>,
]

export function hashString(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash
}

export function groupIconIndex(id) {
  return hashString(id) % ICONS.length
}

export default function GroupIcon({ id, className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden="true">
      {ICONS[groupIconIndex(id)]}
    </svg>
  )
}
