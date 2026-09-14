import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { paymentProviderLabel } from '../lib/paymentLinks'

// Near-literal copy of MembersPanel.jsx's invite-code block and roster —
// same visual pattern, relabeled for a Circle. Manager toggle and
// add-by-email mirror TripMembersPanel.jsx/TripSettingsModal.jsx now
// that circles support appointed managers (migration 037).
export default function CircleMembersPanel({
  circle,
  members,
  currentUserId,
  isOwner,
  canManage,
  onRemoveMember,
  onToggleManager,
  onAddByEmail,
}) {
  const [copied, setCopied] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [addingByEmail, setAddingByEmail] = useState(false)
  const [addError, setAddError] = useState('')

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(circle.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — the code is still visible to copy by hand
    }
  }

  async function handleAddByEmail(e) {
    e.preventDefault()
    if (!emailDraft.trim()) return
    setAddingByEmail(true)
    setAddError('')
    const error = await onAddByEmail(emailDraft.trim())
    setAddingByEmail(false)
    if (error) {
      setAddError(error)
      return
    }
    setEmailDraft('')
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-lg text-ink mb-3">Invite people</h3>
        <div className="flex items-center justify-between rounded-xl border border-line bg-paper-raised px-5 py-4">
          <div>
            <p className="text-xs text-ink-soft mb-1">Invite code</p>
            <p className="font-display text-2xl tracking-[0.2em] text-ink">{circle.invite_code}</p>
          </div>
          <button
            onClick={copyCode}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:border-primary transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Anyone with this code can join {circle.name} from their dashboard — they'll then be able to see and
          join any Trip inside it.
        </p>
      </div>

      {canManage && (
        <div>
          <h3 className="font-display text-lg text-ink mb-3">Add by email</h3>
          <form onSubmit={handleAddByEmail} className="flex items-center gap-2">
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="them@example.com"
              className="flex-1 rounded-lg border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-primary outline-none"
            />
            <button
              type="submit"
              disabled={!emailDraft.trim() || addingByEmail}
              className="rounded-full bg-primary text-on-primary text-sm font-medium px-4 py-2 hover:bg-primary-dark transition-colors disabled:opacity-60 shrink-0"
            >
              {addingByEmail ? 'Adding…' : 'Add'}
            </button>
          </form>
          {addError && <p className="mt-1.5 text-xs text-owe">{addError}</p>}
          <p className="mt-2 text-xs text-ink-soft">
            Only works for someone who already has an account — otherwise, share the invite code above.
          </p>
        </div>
      )}

      <div>
        <h3 className="font-display text-lg text-ink mb-3">Members</h3>
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => {
            const isYou = m.user_id === currentUserId
            const isCreatorRow = m.user_id === circle.created_by
            const canRemove = !isYou && (isOwner ? !isCreatorRow : canManage && !isCreatorRow && !m.is_manager)
            return (
              <li key={m.user_id} className="flex items-start gap-3 py-3">
                <Avatar avatarPath={m.avatar_path} name={m.display_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ink truncate">
                      {isYou ? 'You' : m.display_name}
                      {m.is_manager && (
                        <span className="ml-2 text-xs text-primary border border-primary/30 rounded-full px-2 py-0.5">
                          manager
                        </span>
                      )}
                    </p>
                    <span className="text-xs text-ink-soft shrink-0">{m.email}</span>
                  </div>
                  {m.payment_handle && (
                    <p className="text-xs text-ink-soft mt-0.5">
                      {paymentProviderLabel(m.payment_provider)}: {m.payment_handle}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {isYou && (
                      <Link to="/profile" className="text-xs text-primary hover:underline">
                        Edit your info
                      </Link>
                    )}
                    {isOwner && !isYou && !isCreatorRow && (
                      <button
                        onClick={() => onToggleManager(m.user_id, !m.is_manager)}
                        className="text-xs text-primary hover:underline"
                      >
                        {m.is_manager ? 'Remove as manager' : 'Make circle manager'}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => onRemoveMember(m.user_id)}
                        className="text-xs text-owe hover:underline"
                      >
                        Remove from circle
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
