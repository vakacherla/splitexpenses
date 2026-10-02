import { Link, useLocation } from 'react-router-dom'
import { NAV_ITEMS, activeNavId } from '../lib/navItems'
import NavIcon from './NavIcons'

// The phone version of the main menu: the same destinations as the top bar,
// pinned to the bottom of the screen where a thumb can reach them.
export default function BottomTabs() {
  const location = useLocation()
  const active = activeNavId(location.pathname, location.search)

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-ink-soft hover:text-ink'
                }`}
              >
                <NavIcon id={item.id} className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
