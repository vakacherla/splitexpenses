import { accentFor, hashString } from './TripIcon'

// Playful little scenes for the join screen and the invite card, shown when a
// trip has no cover photo of its own. One is picked from the trip's id, so the
// same trip always gets the same picture, and most of them have a face on
// purpose: trips are meant to be fun. Hand-drawn in the same plain style as
// TripIcon and CategoryIcon, with no illustration library.
//
// Colours come from the app's own tokens so it works in light and dark.
const INK = 'var(--color-ink)'
const PAPER = 'var(--color-paper-raised)'
const GREEN = 'var(--color-primary)'
const GOLD = 'var(--color-accent)'
const RED = 'var(--color-owe)'
const SKY = '#7fb7d6'

const stroke = { fill: 'none', stroke: INK, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function Face({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="-5" cy="0" r="1.6" fill={INK} />
      <circle cx="5" cy="0" r="1.6" fill={INK} />
      <path d="M-5 5 Q0 10 5 5" {...stroke} strokeWidth={1.8} />
    </g>
  )
}

const TRIP_SCENES = [
  // Sun in sunglasses
  () => (
    <>
      <path d="M80 12v8M80 72v8M42 46h8M110 46h8M53 19l6 6M101 67l6 6M107 19l-6 6M59 67l-6 6" {...stroke} stroke={GOLD} />
      <circle cx="80" cy="46" r="20" fill={GOLD} stroke={INK} strokeWidth="2" />
      <rect x="64" y="38" width="13" height="9" rx="3" fill={INK} />
      <rect x="83" y="38" width="13" height="9" rx="3" fill={INK} />
      <path d="M77 41h6" {...stroke} strokeWidth={1.8} />
      <path d="M70 54 Q80 62 90 54" {...stroke} strokeWidth={1.8} />
      <path d="M118 70c-6 0-6-8 0-8 1-6 11-6 12 0 6 0 6 8 0 8Z" fill={PAPER} stroke={INK} strokeWidth="1.8" />
      <path d="M14 88q8-8 16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0" {...stroke} stroke={SKY} />
    </>
  ),
  // Lucky suitcase
  () => (
    <>
      <path d="M68 34v-6a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v6" {...stroke} />
      <rect x="50" y="34" width="60" height="44" rx="9" fill={GREEN} stroke={INK} strokeWidth="2" />
      <path d="M50 52h60" {...stroke} stroke={PAPER} strokeWidth={1.5} opacity=".5" />
      <rect x="62" y="30" width="6" height="8" rx="1.5" fill={GOLD} stroke={INK} strokeWidth="1.5" />
      <rect x="92" y="30" width="6" height="8" rx="1.5" fill={GOLD} stroke={INK} strokeWidth="1.5" />
      <g stroke={PAPER}><circle cx="73" cy="58" r="2.2" fill={PAPER} stroke="none" /><circle cx="87" cy="58" r="2.2" fill={PAPER} stroke="none" /><path d="M73 66 Q80 72 87 66" fill="none" strokeWidth="2" strokeLinecap="round" /></g>
      <path d="M100 44l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4Z" fill={GOLD} stroke="none" />
      <circle cx="62" cy="82" r="3.4" fill={INK} /><circle cx="98" cy="82" r="3.4" fill={INK} />
    </>
  ),
  // Palm island
  () => (
    <>
      <ellipse cx="80" cy="80" rx="42" ry="9" fill="#e6d3a1" stroke={INK} strokeWidth="2" />
      <path d="M82 76c-3-14-2-26 4-38" {...stroke} stroke="#8a5a2b" strokeWidth={3.4} />
      <path d="M86 38c-12-8-24-4-28 4M86 38c-4-12-14-17-26-14M86 38c8-10 20-12 28-4M86 38c10-4 22 0 26 10" {...stroke} stroke={GREEN} strokeWidth={4.2} />
      <circle cx="84" cy="41" r="2.8" fill="#8a5a2b" /><circle cx="89" cy="43" r="2.8" fill="#8a5a2b" />
      <circle cx="122" cy="22" r="8" fill={GOLD} stroke={INK} strokeWidth="1.8" />
      <Face x={65} y={78} s={0.8} />
      <path d="M10 92q8-6 16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0" {...stroke} stroke={SKY} />
    </>
  ),
  // Plane doing a loop
  () => (
    <>
      <path d="M14 78C34 78 40 52 58 52s14 24-2 22-4-22 22-28" {...stroke} stroke={INK} strokeDasharray="1 7" opacity=".55" />
      <g transform="translate(96 34) rotate(-14)">
        <ellipse cx="0" cy="0" rx="26" ry="8" fill={PAPER} stroke={INK} strokeWidth="2" />
        <path d="M-4 -2 L-16 -22 L-6 -22 L10 -2Z" fill={GREEN} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d="M-4 2 L-16 20 L-6 20 L10 2Z" fill={GREEN} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d="M-22 -4 L-30 -14 L-24 -14 L-16 -3Z" fill={RED} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="14" cy="-1" r="2" fill={SKY} stroke={INK} strokeWidth="1.4" /><circle cx="19" cy="-1" r="2" fill={SKY} stroke={INK} strokeWidth="1.4" />
      </g>
      <path d="M122 76c-6 0-6-8 0-8 1-6 11-6 12 0 6 0 6 8 0 8Z" fill={PAPER} stroke={INK} strokeWidth="1.8" />
      <path d="M20 22c-5 0-5-7 0-7 1-5 9-5 10 0 5 0 5 7 0 7Z" fill={PAPER} stroke={INK} strokeWidth="1.8" />
    </>
  ),
  // Happy camera
  () => (
    <>
      <rect x="44" y="34" width="72" height="46" rx="9" fill={GREEN} stroke={INK} strokeWidth="2" />
      <path d="M62 34l4-8h28l4 8" fill={GREEN} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="80" cy="57" r="16" fill={PAPER} stroke={INK} strokeWidth="2" />
      <circle cx="80" cy="57" r="9" fill={SKY} stroke={INK} strokeWidth="1.8" />
      <path d="M75 59 Q80 64 85 59" {...stroke} strokeWidth={1.8} />
      <circle cx="77" cy="54" r="1.4" fill={INK} /><circle cx="83" cy="54" r="1.4" fill={INK} />
      <rect x="100" y="40" width="9" height="6" rx="2" fill={GOLD} stroke={INK} strokeWidth="1.5" />
      <path d="M124 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill={GOLD} stroke="none" />
      <path d="M34 28l1.4 3.4 3.4 1.4-3.4 1.4L34 38l-1.4-3.4-3.4-1.4 3.4-1.4Z" fill={GOLD} stroke="none" />
    </>
  ),
  // Cosy tent under the moon
  () => (
    <>
      <path d="M118 18a11 11 0 1 0 11 14 9 9 0 0 1-11-14Z" fill={GOLD} stroke={INK} strokeWidth="1.8" />
      <path d="M30 24l1.4 3 3 1.4-3 1.4L30 33l-1.4-3-3-1.4 3-1.4Zm22 12l1 2.2 2.2 1-2.2 1L52 42l-1-2.2-2.2-1 2.2-1Z" fill={GOLD} stroke="none" />
      <path d="M40 82 L80 30 L120 82Z" fill={GREEN} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M80 82 L68 82 L80 54 L92 82Z" fill={INK} opacity=".8" />
      <path d="M80 30v52" {...stroke} stroke={PAPER} strokeWidth={1.4} opacity=".5" />
      <path d="M128 82c-4-4-3-9 0-12 1 3 5 4 4 12Z" fill={RED} stroke={INK} strokeWidth="1.6" />
      <path d="M22 82h116" {...stroke} />
    </>
  ),
]

const CIRCLE_SCENES = [
  // Smiling house
  () => (
    <>
      <path d="M38 52L80 18l42 34" fill={RED} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <rect x="48" y="50" width="64" height="32" fill={PAPER} stroke={INK} strokeWidth="2" />
      <rect x="92" y="22" width="8" height="16" fill={GOLD} stroke={INK} strokeWidth="1.8" />
      <path d="M96 14c-3-3 3-5 0-9" {...stroke} strokeWidth={1.6} opacity=".6" />
      <rect x="72" y="60" width="16" height="22" rx="2" fill={GREEN} stroke={INK} strokeWidth="1.8" />
      <Face x={62} y={64} s={0.9} />
      <path d="M24 82h112" {...stroke} />
    </>
  ),
  // Ring of friends
  () => (
    <>
      <circle cx="80" cy="50" r="30" {...stroke} strokeDasharray="2 6" opacity=".5" />
      <circle cx="80" cy="26" r="11" fill={GOLD} stroke={INK} strokeWidth="2" />
      <circle cx="56" cy="64" r="11" fill={GREEN} stroke={INK} strokeWidth="2" />
      <circle cx="104" cy="64" r="11" fill={RED} stroke={INK} strokeWidth="2" />
      <Face x={80} y={25} s={0.8} />
      <Face x={56} y={63} s={0.8} />
      <Face x={104} y={63} s={0.8} />
      <path d="M80 94l-1.8-1.6C73 87 70 84 70 80.8c0-2.6 2-4.6 4.4-4.6 1.4 0 2.8.7 3.6 1.8.8-1.1 2.2-1.8 3.6-1.8 2.4 0 4.4 2 4.4 4.6 0 3.2-3 6.2-8.2 11.6Z" fill={RED} stroke="none" opacity=".8" transform="translate(0 -10)" />
    </>
  ),
]

export default function InviteArt({ kind = 'trip', seed = '', className = 'h-36' }) {
  const scenes = kind === 'circle' ? CIRCLE_SCENES : TRIP_SCENES
  const Scene = scenes[hashString(String(seed)) % scenes.length]
  const accent = accentFor(String(seed || 'x'))
  return (
    <div className={`${className} w-full flex items-center justify-center overflow-hidden`} style={{ backgroundImage: `linear-gradient(135deg, ${accent}2e, ${accent}0d)` }}>
      <svg viewBox="0 0 160 100" className="h-full max-h-full w-auto" role="img" aria-label="">
        <circle cx="80" cy="50" r="46" fill={accent} opacity=".13" />
        <Scene />
      </svg>
    </div>
  )
}
