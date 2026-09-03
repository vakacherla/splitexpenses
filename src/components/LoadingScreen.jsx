export default function LoadingScreen({ label = 'Loading…' }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-paper">
      <div className="flex items-center gap-3 text-ink-soft font-body text-sm">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        {label}
      </div>
    </div>
  )
}
