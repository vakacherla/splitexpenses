// Illustrations for the welcome cards. Plain inline SVG that reads the app's
// color tokens, so they follow light and dark mode with no extra assets.
// Decorative only: the card text carries the meaning (aria-hidden).

const c = {
  paper: 'var(--color-paper-raised)',
  line: 'var(--color-line)',
  ink: 'var(--color-ink)',
  soft: 'var(--color-ink-soft)',
  primary: 'var(--color-primary)',
  primaryTint: 'var(--color-primary-tint)',
  accent: 'var(--color-accent)',
  accentTint: 'var(--color-accent-tint)',
  owed: 'var(--color-owed)',
  owedTint: 'var(--color-owed-tint)',
  owe: 'var(--color-owe)',
  oweTint: 'var(--color-owe-tint)',
}

function Coin({ x, y, label, fill, stroke, r = 15 }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth="1.5" />
      <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="600" fill={stroke}>
        {label}
      </text>
    </g>
  )
}

// 1. Welcome: a ledger with a few rows, and coins from different currencies
// drifting around it.
function WelcomeScene() {
  return (
    <svg viewBox="0 0 280 160" className="h-full w-full" aria-hidden="true" focusable="false">
      <rect x="82" y="22" width="116" height="116" rx="14" fill={c.paper} stroke={c.line} strokeWidth="1.5" />
      <rect x="96" y="38" width="48" height="7" rx="3.5" fill={c.ink} opacity="0.75" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${i * 26})`}>
          <circle cx="104" cy="66" r="7" fill={i === 1 ? c.accentTint : c.primaryTint} stroke={i === 1 ? c.accent : c.primary} strokeWidth="1.2" />
          <rect x="118" y="59" width={52 - i * 8} height="6" rx="3" fill={c.soft} opacity="0.45" />
          <rect x="118" y="70" width="26" height="5" rx="2.5" fill={c.soft} opacity="0.25" />
          <rect x="172" y="61" width="18" height="8" rx="4" fill={i === 1 ? c.oweTint : c.owedTint} />
        </g>
      ))}
      <Coin x={46} y={50} label="$" fill={c.owedTint} stroke={c.owed} />
      <Coin x={236} y={44} label="€" fill={c.accentTint} stroke={c.accent} />
      <Coin x={50} y={116} label="₹" fill={c.primaryTint} stroke={c.primary} r={17} />
      <Coin x={232} y={112} label="£" fill={c.oweTint} stroke={c.owe} r={13} />
      <path d="M62 62c8 6 12 12 16 22" stroke={c.soft} strokeWidth="1.2" strokeDasharray="3 4" fill="none" opacity="0.6" />
      <path d="M220 56c-8 6-12 12-16 22" stroke={c.soft} strokeWidth="1.2" strokeDasharray="3 4" fill="none" opacity="0.6" />
    </svg>
  )
}

// 2. Trip: one outing, its expenses, and who owes whom.
function TripScene() {
  return (
    <svg viewBox="0 0 280 160" className="h-full w-full" aria-hidden="true" focusable="false">
      <rect x="44" y="18" width="192" height="124" rx="14" fill={c.paper} stroke={c.line} strokeWidth="1.5" />
      <rect x="44" y="18" width="192" height="34" rx="14" fill={c.primaryTint} />
      <rect x="44" y="40" width="192" height="12" fill={c.primaryTint} />
      <path d="M66 28c-5 0-9 4-9 9 0 7 9 14 9 14s9-7 9-14c0-5-4-9-9-9z" fill={c.primary} />
      <circle cx="66" cy="37" r="3.2" fill={c.primaryTint} />
      <text x="84" y="40" fontSize="13" fontWeight="600" fill={c.ink}>
        Goa weekend
      </text>
      {[
        ['Dinner', '₹1,800', c.accent],
        ['Taxi', '₹450', c.primary],
        ['Hotel', '₹6,000', c.owed],
      ].map(([label, amt, color], i) => (
        <g key={label} transform={`translate(0 ${i * 24})`}>
          <circle cx="62" cy="72" r="6" fill={c.paper} stroke={color} strokeWidth="1.6" />
          <text x="76" y="76" fontSize="11.5" fill={c.ink}>
            {label}
          </text>
          <text x="220" y="76" fontSize="11.5" fill={c.soft} textAnchor="end">
            {amt}
          </text>
        </g>
      ))}
      <g transform="translate(142 112)">
        <rect width="86" height="22" rx="11" fill={c.owedTint} stroke={c.owed} strokeWidth="1" />
        <text x="43" y="15" fontSize="10.5" fontWeight="600" fill={c.owed} textAnchor="middle">
          Priya owes you
        </text>
      </g>
      <Coin x={32} y={120} label="₹" fill={c.accentTint} stroke={c.accent} r={13} />
    </svg>
  )
}

// 3. Circle: a group of people in a ring, with several trips branching out.
function CircleScene() {
  const people = [
    [140, 30, c.primary, c.primaryTint],
    [182, 56, c.accent, c.accentTint],
    [166, 100, c.owed, c.owedTint],
    [114, 100, c.owe, c.oweTint],
    [98, 56, c.primary, c.primaryTint],
  ]
  return (
    <svg viewBox="0 0 280 160" className="h-full w-full" aria-hidden="true" focusable="false">
      <ellipse cx="140" cy="66" rx="60" ry="42" fill="none" stroke={c.accent} strokeWidth="1.5" strokeDasharray="5 5" />
      {people.map(([x, y, stroke, fill], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="13" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <circle cx={x} cy={y - 3} r="4" fill={stroke} />
          <path d={`M${x - 7} ${y + 8}c1-5 4-6 7-6s6 1 7 6`} fill={stroke} />
        </g>
      ))}
      {[52, 140, 228].map((x, i) => (
        <g key={x}>
          <path d={`M140 106 C140 122 ${x} 114 ${x} 126`} stroke={c.soft} strokeWidth="1.2" fill="none" strokeDasharray="3 4" opacity="0.7" />
          <rect x={x - 28} y="126" width="56" height="20" rx="6" fill={c.paper} stroke={c.line} strokeWidth="1.2" />
          <rect x={x - 20} y="134" width={[34, 28, 38][i]} height="4.5" rx="2.2" fill={c.soft} opacity="0.5" />
        </g>
      ))}
    </svg>
  )
}

// 4. Invite + type: share a 6-digit code, then describe an expense in a
// sentence and see it filled in.
function StartScene() {
  const code = ['4', '8', '2', '9', '1', '5']
  return (
    <svg viewBox="0 0 280 160" className="h-full w-full" aria-hidden="true" focusable="false">
      <text x="140" y="24" fontSize="10.5" fill={c.soft} textAnchor="middle" letterSpacing="1.2">
        INVITE CODE
      </text>
      {code.map((ch, i) => (
        <g key={i}>
          <rect x={52 + i * 33} y="32" width="28" height="34" rx="8" fill={c.paper} stroke={c.primary} strokeWidth="1.5" />
          <text x={66 + i * 33} y="55" fontSize="17" fontWeight="600" fill={c.primary} textAnchor="middle">
            {ch}
          </text>
        </g>
      ))}
      <rect x="36" y="80" width="208" height="30" rx="15" fill={c.paper} stroke={c.line} strokeWidth="1.5" />
      <text x="54" y="99" fontSize="11" fill={c.ink}>
        lunch 24.50 with Priya and Tom
      </text>
      <path d="M140 114v10" stroke={c.accent} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M135 120l5 6 5-6" stroke={c.accent} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(70 128)">
        <rect width="140" height="26" rx="13" fill={c.owedTint} stroke={c.owed} strokeWidth="1.2" />
        <text x="70" y="17.5" fontSize="11.5" fontWeight="600" fill={c.owed} textAnchor="middle">
          $24.50 · Food · 3 ways
        </text>
      </g>
    </svg>
  )
}

const SCENES = {
  welcome: WelcomeScene,
  trip: TripScene,
  circle: CircleScene,
  start: StartScene,
}

// The illustration for one welcome card, picked by the card's id.
export default function WelcomeArt({ id }) {
  const Scene = SCENES[id] ?? WelcomeScene
  return <Scene />
}
