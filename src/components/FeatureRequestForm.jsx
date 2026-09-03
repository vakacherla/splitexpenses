import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const STATUS_LABELS = {
  new: 'Received',
  reviewing: 'Under review',
  planned: 'Planned',
  done: 'Done',
  declined: 'Not planned',
}

const STATUS_COLORS = {
  new: 'text-ink-soft border-line',
  reviewing: 'text-accent border-accent/30',
  planned: 'text-primary border-primary/30',
  done: 'text-owed border-owed/30',
  declined: 'text-ink-soft border-line',
}

export default function FeatureRequestForm({ userId }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mine, setMine] = useState(null)

  async function loadMine() {
    const { data } = await supabase
      .from('feature_requests')
      .select('id, message, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setMine(data ?? [])
  }

  useEffect(() => {
    loadMine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim()) return setError('Write a line or two about what you have in mind.')
    setSaving(true)
    setError('')
    const { error } = await supabase.from('feature_requests').insert({
      user_id: userId,
      message: message.trim(),
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setMessage('')
    loadMine()
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What would make this app more useful for you?"
          rows={3}
          className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary outline-none resize-none"
        />
        {error && <p className="text-xs text-owe">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary text-on-primary text-sm font-medium px-4 py-2 hover:bg-primary-dark transition-colors disabled:opacity-60"
        >
          {saving ? 'Sending…' : 'Send idea'}
        </button>
      </form>

      {mine && mine.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-ink-soft mb-2">What you've sent before</p>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-ink-soft flex-1">{r.message}</span>
                <span
                  className={`text-xs border rounded-full px-2 py-0.5 shrink-0 ${STATUS_COLORS[r.status] ?? 'text-ink-soft border-line'}`}
                >
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
