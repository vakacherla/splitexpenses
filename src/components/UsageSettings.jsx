import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { USAGE_NOTICE, USAGE_SWITCH_HINT, USAGE_SWITCH_LABEL } from '../lib/usageNotice'

// REQ-USE-01: the "Share usage data" switch. The database refuses to record
// anything for someone who has it off, so this is a real control, not a
// cosmetic one. Default is on (new accounts and existing ones).
export default function UsageSettings({ userId }) {
  const { profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Until the profile has loaded we do not know the answer, so show nothing
  // rather than a switch that might flash the wrong way.
  if (!profile || typeof profile.share_usage !== 'boolean') return null
  const on = profile.share_usage

  async function handleToggle() {
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.from('profiles').update({ share_usage: !on }).eq('id', userId)
    if (updateError) setError(updateError.message || 'Could not save that. Try again.')
    else await refreshProfile()
    setBusy(false)
  }

  return (
    <div>
      <h2 className="font-display text-lg text-ink mb-1">Usage data</h2>
      <p className="text-sm text-ink-soft mb-3">{USAGE_NOTICE}</p>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          id="share-usage"
          type="checkbox"
          role="switch"
          checked={on}
          disabled={busy}
          onChange={handleToggle}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <span>
          <span className="text-ink font-medium">{USAGE_SWITCH_LABEL}</span>
          <span className="block text-sm text-ink-soft">{USAGE_SWITCH_HINT}</span>
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-owe">{error}</p>}
    </div>
  )
}
