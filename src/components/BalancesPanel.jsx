import { computeNetBalances, simplifyDebts } from '../lib/balances'
import { formatMoney } from '../lib/fx'
import SettlementHistory from './SettlementHistory'

export default function BalancesPanel({
  members,
  expenses,
  settlements,
  currentUserId,
  homeCurrency,
  onSettle,
  onUndoSettlement,
}) {
  const net = computeNetBalances(
    members,
    expenses,
    settlements.map((s) => ({ from_user: s.from_user, to_user: s.to_user, amount_in_home: s.amount_in_home }))
  )
  const transactions = simplifyDebts(net)
  const membersMap = Object.fromEntries(members.map((m) => [m.user_id, m]))

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-lg text-ink mb-3">Where everyone stands</h3>
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => {
            const amount = net.get(m.user_id) ?? 0
            const isYou = m.user_id === currentUserId
            const settled = Math.abs(amount) < 0.01
            return (
              <li key={m.user_id} className="flex items-center justify-between py-3">
                <span className="text-ink">{isYou ? 'You' : m.display_name}</span>
                <span
                  className={`num text-sm font-medium ${
                    settled ? 'text-ink-soft' : amount > 0 ? 'text-owed' : 'text-owe'
                  }`}
                >
                  {settled
                    ? 'settled up'
                    : amount > 0
                      ? `is owed ${formatMoney(amount, homeCurrency)}`
                      : `owes ${formatMoney(-amount, homeCurrency)}`}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <h3 className="font-display text-lg text-ink mb-3">Suggested settle-up</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-ink-soft">Everyone's square — nothing to settle.</p>
        ) : (
          <ul className="space-y-2.5">
            {transactions.map((t, i) => {
              const from = t.from === currentUserId ? 'You' : membersMap[t.from]?.display_name
              const to = t.to === currentUserId ? 'You' : membersMap[t.to]?.display_name
              return (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-line bg-paper-raised px-4 py-3"
                >
                  <p className="text-sm text-ink">
                    <span className="font-medium">{from}</span> owes <span className="font-medium">{to}</span>
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="num text-sm text-ink">{formatMoney(t.amount, homeCurrency)}</span>
                    {(t.from === currentUserId || t.to === currentUserId) && (
                      <button
                        onClick={() => onSettle(t)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Record payment
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <SettlementHistory
        settlements={settlements}
        membersMap={membersMap}
        currentUserId={currentUserId}
        homeCurrency={homeCurrency}
        onUndo={onUndoSettlement}
      />
    </div>
  )
}
