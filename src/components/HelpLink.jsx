import { Link } from 'react-router-dom'

// Jumps straight to the relevant section of the Help page instead of
// leaving people to scroll a long single-page guide to find it themselves.
export default function HelpLink({ to, label = 'Help', className = '' }) {
  return (
    <Link
      to={`/help#${to}`}
      aria-label={label}
      title={label}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs font-semibold text-ink-soft transition-colors hover:border-primary hover:text-ink ${className}`}
    >
      ?
    </Link>
  )
}
