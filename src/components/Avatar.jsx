import { supabase } from '../lib/supabaseClient'

const SIZE_CLASSES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-16 w-16 text-xl',
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export default function Avatar({ avatarPath, name, size = 'md' }) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md
  const url = avatarPath ? supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl : null

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`${sizeClass} rounded-full object-cover border border-line shrink-0`}
      />
    )
  }

  return (
    <span
      className={`${sizeClass} rounded-full bg-primary-tint text-primary flex items-center justify-center font-medium shrink-0`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
