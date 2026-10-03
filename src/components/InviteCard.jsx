import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { track } from '../lib/track'
import {
  INVITE_MAX_USES,
  INVITE_TTL_DAYS,
  buildInviteUrl,
  canNativeShare,
  mailtoUrl,
  publicAppUrl,
  shareMessage,
  shareSubject,
  whatsappUrl,
} from '../lib/invite'
import InviteArt from './InviteArt'

// "Invite people" for a trip or a Circle. A link is the main way to invite: one
// tap for the friend, and the app records who made it, when it was shared and
// how, and who joined with it. The six-letter code stays underneath as a quiet
// fallback for people who already use it.
export default function InviteCard({ kind, targetId, name, code }) {
  const [label, setLabel] = useState('')
  const [invite, setInvite] = useState(null) // { id, url }
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  async function create() {
    setCreating(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('create_invite', { p_kind: kind, p_target: targetId, p_label: label })
    setCreating(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    setInvite({ id: row.invite_id, url: buildInviteUrl(publicAppUrl(), row.invite_token) })
  }

  function markShared(how) {
    track('invite_shared')
    if (invite) supabase.rpc('mark_invite_shared', { p_id: invite.id, p_how: how }).then(() => {}, () => {})
  }

  const message = invite ? shareMessage({ kind, name, url: invite.url }) : ''

  async function nativeShare() {
    try {
      await navigator.share({ title: shareSubject(name), text: message })
      markShared('share')
    } catch {
      // the person closed the share sheet: nothing was sent
    }
  }

  async function copy(text, which, how) {
    try {
      await navigator.clipboard.writeText(text)
      if (how) markShared(how)
      else track('invite_shared')
      setCopied(which)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      // clipboard unavailable: the text is still on screen to copy by hand
    }
  }

  const btn = 'rounded-full border border-line px-4 py-2 text-center text-sm text-ink transition-colors hover:border-primary'
  return (
    <div>
      <h3 className="font-display text-lg text-ink mb-3">Invite people</h3>
      <div className="overflow-hidden rounded-xl border border-line bg-paper-raised">
        <InviteArt kind={kind} seed={targetId} className="h-24" />
        <div className="space-y-4 px-5 py-4">
          {!invite ? (
            <>
              <p className="text-sm text-ink-soft">
                Send a link. Your friend taps it, signs up, and lands right inside {name}. No code to type.
              </p>
              <label className="block">
                <span className="text-xs text-ink-soft">Who is this for? (optional, only you can see it)</span>
                <input
                  id="invite-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. Priya"
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none focus:border-primary"
                />
              </label>
              <button
                onClick={create}
                disabled={creating}
                className="w-full rounded-full bg-primary px-5 py-2.5 font-medium text-on-primary transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {creating ? 'Making your link…' : 'Create invite link'}
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs text-ink-soft mb-1">Your link</p>
                <p className="break-all rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs text-ink select-all">{invite.url}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Works for up to {INVITE_MAX_USES} people for {INVITE_TTL_DAYS} days.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {canNativeShare() && (
                  <button onClick={nativeShare} className="col-span-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-dark">
                    Share…
                  </button>
                )}
                <a href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer" onClick={() => markShared('whatsapp')} className={btn}>
                  WhatsApp
                </a>
                <a href={mailtoUrl(shareSubject(name), message)} onClick={() => markShared('email')} className={btn}>
                  Email
                </a>
                <button onClick={() => copy(invite.url, 'link', 'copy')} className={`${btn} col-span-2`}>
                  {copied === 'link' ? 'Copied' : 'Copy link'}
                </button>
              </div>
              <details className="text-xs text-ink-soft">
                <summary className="cursor-pointer">The message that gets sent</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-paper p-3 text-ink">{message}</p>
              </details>
              <button onClick={() => { setInvite(null); setLabel('') }} className="text-sm text-primary hover:underline">
                Make another invite
              </button>
            </>
          )}
          {error && <p className="text-sm text-owe">{error}</p>}
          {code && (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-xs text-ink-soft">
                Or give them the code <span className="ml-1 font-display text-base tracking-[0.2em] text-ink">{code}</span>
              </p>
              <button onClick={() => copy(code, 'code')} className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:border-primary">
                {copied === 'code' ? 'Copied' : 'Copy code'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
