import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { paymentProviderLabel } from '../lib/paymentLinks'

// Near-literal copy of MembersPanel.jsx's invite-code block and roster —
// same visual pattern, relabeled for a Circle. No manager-toggle
// affordance: a circle has no appointed managers in v1, only its
// creator, who alone can remove a member (see migration 031's
// "circle_members: creator can remove a member" policy).
export default function CircleMembersPanel({ circle, members, currentUserId, isOwner, onRemoveMember }) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(circle.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — the code is still visible to copy by hand
    }
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

      <div>
        <h3 className="font-display text-lg text-ink mb-3">Members</h3>
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => {
            const isYou = m.user_id === currentUserId
            const isCreatorRow = m.user_id === circle.created_by
            const canRemove = isOwner && !isYou && !isCreatorRow
            return (
              <li key={m.user_id} className="flex items-start gap-3 py-3">
                <Avatar avatarPath={m.avatar_path} name={m.display_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ink truncate">{isYou ? 'You' : m.display_name}</p>
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
