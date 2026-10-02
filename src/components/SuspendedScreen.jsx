import { useAuth } from '../context/AuthContext'
import { adminMailtoLink } from '../lib/suspension'

// Shown instead of the app when an administrator has suspended the signed-in
// person (AU-04). Everything the app would load is refused by the database
// at that point anyway, so there is nothing useful to render behind it.
export default function SuspendedScreen() {
  const { user, signOut } = useAuth()
  const mailto = adminMailtoLink(user?.email)

  return (
    <div className="min-h-dvh bg-paper flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl text-ink">Your account has been suspended</h1>
        <p className="mt-3 text-sm text-ink-soft">
          An administrator has suspended this account, so you can't use Split Expenses right now. Your trips and
          expenses are safe; nothing has been deleted.
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          If you think this is a mistake, or you have questions, contact the administrator.
        </p>
        {mailto && (
          <a
            href={mailto}
            className="mt-5 inline-block w-full rounded-full bg-primary text-on-primary font-medium py-2.5 hover:bg-primary-dark transition-colors"
          >
            Email the administrator
          </a>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-3 w-full rounded-full border border-line text-ink font-medium py-2.5 hover:border-primary transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
