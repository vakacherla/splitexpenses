import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { PAYMENT_PROVIDERS } from '../lib/paymentLinks'
import Avatar from '../components/Avatar'
import NotificationSettings from '../components/NotificationSettings'
import HelpLink from '../components/HelpLink'

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth()

  const [loaded, setLoaded] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [paymentProvider, setPaymentProvider] = useState('upi')
  const [paymentHandle, setPaymentHandle] = useState('')
  const [phoneHome, setPhoneHome] = useState('')
  const [phoneTravel, setPhoneTravel] = useState('')

  const [avatarPath, setAvatarPath] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [memberships, setMemberships] = useState(null)
  const [nicknameDrafts, setNicknameDrafts] = useState({})
  const [savingNickname, setSavingNickname] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_path, payment_provider, payment_handle, phone_home, phone_travel')
        .eq('id', user.id)
        .single()
      if (data) {
        setDisplayName(data.display_name ?? '')
        setAvatarPath(data.avatar_path ?? null)
        setPaymentProvider(data.payment_provider ?? 'upi')
        setPaymentHandle(data.payment_handle ?? '')
        setPhoneHome(data.phone_home ?? '')
        setPhoneTravel(data.phone_travel ?? '')
      }
      setLoaded(true)
    }
    load()
    loadMemberships()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMemberships() {
    const { data } = await supabase
      .from('group_members')
      .select('group_id, nickname, groups(name)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
    setMemberships(data ?? [])
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    setError('')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) {
      setAvatarUploading(false)
      setError(uploadError.message)
      return
    }
    const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
    setAvatarUploading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setAvatarPath(path)
    await refreshProfile()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!displayName.trim()) return setError('Your name can\'t be empty.')
    setSaving(true)
    setError('')
    setSaved(false)
    const trimmedHandle = paymentHandle.trim()
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        payment_provider: trimmedHandle ? paymentProvider : null,
        payment_handle: trimmedHandle || null,
        phone_home: phoneHome.trim() || null,
        phone_travel: phoneTravel.trim() || null,
      })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    await refreshProfile()
  }

  function startNicknameEdit(groupId, current) {
    setNicknameDrafts((prev) => ({ ...prev, [groupId]: current ?? '' }))
  }

  async function saveNickname(groupId) {
    setSavingNickname(groupId)
    const value = (nicknameDrafts[groupId] ?? '').trim()
    const { error } = await supabase
      .from('group_members')
      .update({ nickname: value || null })
      .eq('group_id', groupId)
      .eq('user_id', user.id)
    setSavingNickname(null)
    if (error) {
      setError(error.message)
      return
    }
    setNicknameDrafts((prev) => {
      const next = { ...prev }
      delete next[groupId]
      return next
    })
    await loadMemberships()
  }

  if (!loaded) return null

  const selectedProviderMeta = PAYMENT_PROVIDERS.find((p) => p.id === paymentProvider)

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 pb-16">
      <div className="mb-6">
        <Link to="/dashboard" className="text-sm text-ink-soft hover:text-ink">
          ← Your groups
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="font-display text-2xl sm:text-3xl text-ink">Your profile</h1>
          <HelpLink to="profile" />
        </div>
        <p className="text-sm text-ink-soft mt-0.5">
          Visible to anyone you share a group with — this is how they'll recognize and reach you.
        </p>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <Avatar avatarPath={avatarPath} name={displayName} size="lg" />
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
          >
            {avatarUploading ? 'Uploading…' : avatarPath ? 'Change photo' : 'Add a photo'}
          </button>
          <p className="text-xs text-ink-soft mt-0.5">Shown next to your name everywhere.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm text-ink-soft mb-1.5">Your name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-ink focus:border-primary outline-none"
          />
        </div>

        <div>
          <label className="block text-sm text-ink-soft mb-1.5">Email</label>
          <p className="text-ink py-2.5">{user.email}</p>
        </div>

        <div className="pt-2 border-t border-line">
          <p className="text-sm text-ink-soft mb-3 pt-4">
            Payment info — lets others pay you back with one tap on the Balances tab.
          </p>
          <div className="flex gap-2">
            <select
              value={paymentProvider}
              onChange={(e) => setPaymentProvider(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:border-primary outline-none"
            >
              {PAYMENT_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              value={paymentHandle}
              onChange={(e) => setPaymentHandle(e.target.value)}
              placeholder={selectedProviderMeta?.placeholder}
              className="flex-1 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary outline-none"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-line">
          <p className="text-sm text-ink-soft mb-3 pt-4">
            Phone — two numbers, since a lot of trips mean a local SIM that isn't your regular one.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-ink-soft mb-1.5">Home number</label>
              <input
                value={phoneHome}
                onChange={(e) => setPhoneHome(e.target.value)}
                placeholder="+1 555 123 4567"
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-ink-soft mb-1.5">Travel number (if different)</label>
              <input
                value={phoneTravel}
                onChange={(e) => setPhoneTravel(e.target.value)}
                placeholder="Local SIM, while traveling"
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary outline-none"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-owe">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary text-on-primary font-medium px-5 py-2.5 hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-sm text-primary">Saved</span>}
        </div>
      </form>

      <div className="mt-10 pt-6 border-t border-line">
        <NotificationSettings userId={user.id} />
      </div>

      {memberships && memberships.length > 0 && (
        <div className="mt-10 pt-6 border-t border-line">
          <h2 className="font-display text-lg text-ink mb-1">Nicknames per group</h2>
          <p className="text-sm text-ink-soft mb-4">
            Go by a different name in a specific group — everyone in that group sees it instead of your regular
            name, but only there.
          </p>
          <ul className="divide-y divide-line border-y border-line">
            {memberships.map((m) => {
              const editing = m.group_id in nicknameDrafts
              return (
                <li key={m.group_id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink truncate">{m.groups?.name ?? 'Unknown group'}</p>
                      {!editing && (
                        <p className="text-xs text-ink-soft mt-0.5">
                          {m.nickname ? `Going by "${m.nickname}" here` : 'Using your regular name'}
                        </p>
                      )}
                    </div>
                    {!editing && (
                      <button
                        onClick={() => startNicknameEdit(m.group_id, m.nickname)}
                        className="text-xs font-medium text-primary hover:underline shrink-0"
                      >
                        {m.nickname ? 'Edit' : 'Set nickname'}
                      </button>
                    )}
                  </div>
                  {editing && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        autoFocus
                        value={nicknameDrafts[m.group_id]}
                        onChange={(e) => setNicknameDrafts((prev) => ({ ...prev, [m.group_id]: e.target.value }))}
                        placeholder="Leave blank to use your regular name"
                        className="flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-primary outline-none"
                      />
                      <button
                        onClick={() => saveNickname(m.group_id)}
                        disabled={savingNickname === m.group_id}
                        className="text-xs font-medium text-primary hover:underline shrink-0 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() =>
                          setNicknameDrafts((prev) => {
                            const next = { ...prev }
                            delete next[m.group_id]
                            return next
                          })
                        }
                        className="text-xs text-ink-soft hover:text-ink shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
