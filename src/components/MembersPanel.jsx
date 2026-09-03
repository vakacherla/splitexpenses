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
  onRename,
  onRemoveMember,
  onDeleteGroup,
  onToggleManager,
}) {
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(group.name)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — the code is still visible to copy by hand
    }
  }

  function saveRename() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== group.name) onRename(trimmed)
    setRenaming(false)
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

      {canManage && (
        <div>
          <h3 className="font-display text-lg text-ink mb-3">Group settings</h3>
          <div className="rounded-xl border border-line bg-paper-raised p-5 space-y-4">
            <div>
              <p className="text-xs text-ink-soft mb-1.5">Group name</p>
              {renaming ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename()
                      if (e.key === 'Escape') setRenaming(false)
                    }}
                    className="flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-ink focus:border-primary outline-none"
                  />
                  <button onClick={saveRename} className="text-xs font-medium text-primary hover:underline shrink-0">
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setRenaming(false)
                      setNameDraft(group.name)
                    }}
                    className="text-xs text-ink-soft hover:text-ink shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-ink">{group.name}</p>
                  <button
                    onClick={() => setRenaming(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Rename
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-line">
              <p className="text-xs text-owe mb-2">Danger zone</p>
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="text-sm text-owe hover:underline"
                >
                  Delete this group
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-ink-soft">
                    This removes {group.name} from everyone's dashboard right away. Nothing is actually
                    deleted — the app's admin can restore it, in full, for 30 days. After that it's gone for
                    good. Type the group name to confirm.
                  </p>
                  <input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={group.name}
                    className="w-full rounded-lg border border-owe/40 bg-paper px-3.5 py-2 text-sm text-ink focus:border-owe outline-none"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={onDeleteGroup}
                      disabled={deleteConfirmText !== group.name}
                      className="rounded-full bg-owe text-on-primary text-sm font-medium px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete this group
                    </button>
                    <button
                      onClick={() => {
                        setConfirmingDelete(false)
                        setDeleteConfirmText('')
                      }}
                      className="text-xs text-ink-soft hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
