import { formatMoney } from '../lib/fx'

export default function SettlementHistory({ settlements, membersMap, currentUserId, homeCurrency, onUndo }) {
  if (settlements.length === 0) return null

  return (
    <div>
      <h3 className="font-display text-lg text-ink mb-3">Recent payments</h3>
      <ul className="divide-y divide-line border-y border-line">
        {settlements.map((s) => {
          const fromName = s.from_user === currentUserId ? 'You' : membersMap[s.from_user]?.display_name ?? '—'
          const toName = s.to_user === currentUserId ? 'You' : membersMap[s.to_user]?.display_name ?? '—'
          const dateLabel = new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          return (
            <li key={s.id} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">
                  {fromName} paid {toName}
                  {s.note ? ` · ${s.note}` : ''}
                </p>
                <p className="text-xs text-ink-soft mt-0.5">{dateLabel}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="num text-sm text-ink">{formatMoney(s.amount, s.currency)}</p>
                {s.currency !== homeCurrency && (
                  <p className="num text-xs text-ink-soft">{formatMoney(s.amount_in_home, homeCurrency)}</p>
                )}
                {(s.from_user === currentUserId || s.to_user === currentUserId || s.created_by === currentUserId) && (
                  <button onClick={() => onUndo(s.id)} className="text-xs text-owe hover:underline mt-0.5">
                    Undo
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
