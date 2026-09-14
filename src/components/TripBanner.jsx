import { supabase } from '../lib/supabaseClient'

// Cover-photo banner for a trip (or, via `bucket`, a Circle) — a real
// photo when the owner/manager has uploaded one, otherwise the same
// accent-gradient + first-letter watermark treatment the Dashboard card
// always used, just promoted from a small top-right corner flourish
// into the actual banner area rather than adding a second unrelated
// decorative element.
export default function TripBanner({ name, bannerPath, accent, className = 'h-28 sm:h-32', bucket = 'group-banners' }) {
  const url = bannerPath ? supabase.storage.from(bucket).getPublicUrl(bannerPath).data.publicUrl : null

  if (url) {
    return (
      <div className={`${className} w-full overflow-hidden`}>
        <img src={url} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div
      className={`${className} w-full flex items-center justify-center overflow-hidden`}
      style={{ backgroundImage: `linear-gradient(135deg, ${accent}, ${accent}66)` }}
      aria-hidden="true"
    >
      <span className="font-display font-bold leading-none text-paper/25 text-[64px] sm:text-[76px] select-none">
        {name?.[0]?.toUpperCase()}
      </span>
    </div>
  )
}
