import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOfflineQueue } from '../lib/offlineQueue'
import ThemeToggle from './ThemeToggle'
import Avatar from './Avatar'
import { NAV_ITEMS, activeNavId } from '../lib/navItems'

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const active = activeNavId(location.pathname, location.search)
  const pendingOps = useOfflineQueue()

  async function handleSignOut() {
    // OFF-16: signing out used to happen silently even with unsynced
    // offline changes sitting in the write queue — easy to lose track of
    // on a shared or borrowed device. The queue itself isn't scoped to a
    // particular user (still true after this), so this warning is the
    // honest version of what actually happens next, not a promise that
    // only this account's data is at risk.
    if (pendingOps.length > 0) {
      const changeWord = pendingOps.length === 1 ? 'change' : 'changes'
      const confirmed = confirm(
        `You have ${pendingOps.length} unsynced ${changeWord} saved on this device. ` +
          `They'll stay queued and sync automatically the next time someone's signed in here with a connection — sign out anyway?`
      )
      if (!confirmed) return
    }
    await signOut()
    navigate('/login')
  }

  return (
    <header className="border-b border-line bg-paper-raised">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-baseline gap-2 shrink-0">
          <span className="font-display text-lg sm:text-xl font-semibold text-ink tracking-tight whitespace-nowrap">Split Expenses</span>
        </Link>
        {user && (
          <>
            {/* Desktop menu: labeled links with the current section marked. */}
            <nav aria-label="Main" className="hidden md:flex items-center gap-1 mx-4 grow">
              {NAV_ITEMS.filter((i) => i.id !== 'profile').map((item) => (
                <Link
                  key={item.id}
                  to={item.to}
                  aria-current={item.id === active ? 'page' : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                    item.id === active
                      ? 'bg-primary-tint font-semibold text-primary'
                      : 'text-ink-soft hover:text-ink hover:bg-paper'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {profile?.is_admin && (
                <Link to="/admin" className="text-sm text-ink-soft hover:text-ink">
                  Admin
                </Link>
              )}
              {profile && (
                <Link
                  to="/profile"
                  aria-label="Profile"
                  title="Profile"
                  className="hidden md:flex items-center gap-2 text-sm text-ink-soft hover:text-ink"
                >
                  <Avatar avatarPath={profile.avatar_path} name={profile.display_name} size="sm" />
                  <span className="hidden xl:inline">{profile.display_name}</span>
                </Link>
              )}
              <ThemeToggle />
              <button
                onClick={handleSignOut}
                className="text-sm whitespace-nowrap text-ink-soft hover:text-ink border border-line rounded-full px-3 sm:px-3.5 py-1.5 transition-colors"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
