import { Link } from 'react-router-dom'

// "Circles > Crew > Goa weekend": shows where you are and gives a one-tap
// way back up. The last item is the current page.
export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {item.to && !last ? (
                <Link to={item.to} className="hover:text-ink hover:underline underline-offset-2">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'truncate text-ink' : ''}>
                  {item.label}
                </span>
              )}
              {!last && (
                <span aria-hidden="true" className="text-line">
                  ›
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
