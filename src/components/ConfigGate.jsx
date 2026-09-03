export default function ConfigGate({ children }) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    return (
      <div className="min-h-dvh bg-paper flex items-center justify-center px-4">
        <div className="max-w-md bg-paper-raised border border-line rounded-2xl p-6 shadow-raised">
          <h1 className="font-display text-xl text-ink mb-2">Almost there</h1>
          <p className="text-sm text-ink-soft leading-relaxed">
            This app needs a Supabase project to store data. Copy <code className="text-ink">.env.example</code> to{' '}
            <code className="text-ink">.env</code>, fill in your project URL and anon key, then restart the dev
            server. See the README for the full setup steps.
          </p>
        </div>
      </div>
    )
  }

  return children
}
