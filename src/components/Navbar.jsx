import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'
import Avatar from './Avatar'

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="border-b border-line bg-paper-raised">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold text-ink tracking-tight">Split Expenses</span>
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            {profile?.is_admin && (
              <Link to="/admin" className="text-sm text-ink-soft hover:text-ink">
                Admin
              </Link>
            )}
            {profile && (
              <Link
                to="/profile"
                className="hidden sm:flex items-center gap-2 text-sm text-ink-soft hover:text-ink"
              >
                <Avatar avatarPath={profile.avatar_path} name={profile.display_name} size="sm" />
                {profile.display_name}
              </Link>
            )}
            <Link
              to="/rates"
              aria-label="Exchange rates"
              title="Exchange rates"
              className="h-9 w-9 flex items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink hover:border-primary transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M4 7h10.5M14.5 7 11.5 4M14.5 7l-3 3M16 13H5.5M5.5 13 8.5 10M5.5 13l3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link
              to="/help"
              aria-label="Help"
              title="Help"
              className="h-9 w-9 flex items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink hover:border-primary transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M7.8 7.8a2.2 2.2 0 1 1 3.2 1.96c-.75.4-1 .75-1 1.44v.3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="14" r="0.9" fill="currentColor" />
              </svg>
            </Link>
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              className="text-sm text-ink-soft hover:text-ink border border-line rounded-full px-3.5 py-1.5 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
