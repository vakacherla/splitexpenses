import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { paymentProviderLabel } from '../lib/paymentLinks'

export default function MembersPanel({
  group,
  members,
  currentUserId,
  isOwner,
  canManage,
  onRemoveMember,
  onToggleManager,
}) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.invite_code)
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
            <p className="font-display text-2xl tracking-[0.2em] text-ink">{group.invite_code}</p>
          </div>
          <button
            onClick={copyCode}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:border-primary transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">Anyone with this code can join {group.name} from their dashboard.</p>
      </div>

      <div>
        <h3 className="font-display text-lg text-ink mb-3">Members</h3>
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => {
            const isYou = m.user_id === currentUserId
            const hasNickname = m.nickname && m.nickname !== m.real_display_name
            const isCreatorRow = m.user_id === group.created_by
            // A manager can remove a regular member, but not the creator
            // or another manager — enforced server-side too (see
            // migration 013), this just keeps the button from ever
            // appearing somewhere it would fail.
            const canRemove = !isYou && (isOwner ? !isCreatorRow : canManage && !isCreatorRow && !m.is_manager)
            return (
              <li key={m.user_id} className="flex items-start gap-3 py-3">
                <Avatar avatarPath={m.avatar_path} name={m.display_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ink truncate">
                      {isYou ? 'You' : m.display_name}
                      {hasNickname && <span className="text-ink-soft font-normal"> ({m.real_display_name})</span>}
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
                  {(m.phone_home || m.phone_travel) && (
                    <p className="text-xs text-ink-soft mt-0.5">
                      {m.phone_home && `Home: ${m.phone_home}`}
                      {m.phone_home && m.phone_travel && ' · '}
                      {m.phone_travel && `Travel: ${m.phone_travel}`}
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
                        {m.is_manager ? 'Remove as manager' : 'Make manager'}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => onRemoveMember(m.user_id)}
                        className="text-xs text-owe hover:underline"
                      >
                        Remove from group
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
