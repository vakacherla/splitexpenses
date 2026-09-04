import { useState } from 'react'
import { computeNetBalances, simplifyDebts } from '../lib/balances'
import { formatMoney } from '../lib/fx'
import SettlementHistory from './SettlementHistory'
import Avatar from './Avatar'

export default function BalancesPanel({
  members,
  expenses,
  settlements,
  currentUserId,
  homeCurrency,
  onSettle,
  onUndoSettlement,
  onRemind,
}) {
  const [reminding, setReminding] = useState(null) // debtor user_id currently in flight
  const [reminded, setReminded] = useState({}) // debtor user_id -> true, once sent
  const [remindError, setRemindError] = useState('')

  async function handleRemind(debtorUserId) {
    setReminding(debtorUserId)
    setRemindError('')
    try {
      await onRemind(debtorUserId)
      setReminded((prev) => ({ ...prev, [debtorUserId]: true }))
    } catch (err) {
      setRemindError(err.message || 'Could not send that reminder.')
    }
    setReminding(null)
  }

  const net = computeNetBalances(
    members,
    expenses,
    settlements.map((s) => ({ from_user: s.from_user, to_user: s.to_user, amount_in_home: s.amount_in_home }))
  )
  const transactions = simplifyDebts(net)
  const membersMap = Object.fromEntries(members.map((m) => [m.user_id, m]))
  const maxAbsBalance = Math.max(0.01, ...members.map((m) => Math.abs(net.get(m.user_id) ?? 0)))

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-lg text-ink mb-3">Where everyone stands</h3>
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => {
            const amount = net.get(m.user_id) ?? 0
            const isYou = m.user_id === currentUserId
            const settled = Math.abs(amount) < 0.01
            const barWidthPct = settled ? 0 : Math.max(6, (Math.abs(amount) / maxAbsBalance) * 100)
            return (
              <li key={m.user_id} className="flex items-center gap-3 py-3">
                <Avatar avatarPath={m.avatar_path} name={m.display_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink truncate">{isYou ? 'You' : m.display_name}</span>
                    <span
                      className={`num text-sm font-medium shrink-0 ${
                        settled ? 'text-ink-soft' : amount > 0 ? 'text-owed' : 'text-owe'
                      }`}
                    >
                      {settled
                        ? 'settled up'
                        : amount > 0
                          ? `is owed ${formatMoney(amount, homeCurrency)}`
                          : `owes ${formatMoney(-amount, homeCurrency)}`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-line/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-[width] ${
                        settled ? 'bg-line' : amount > 0 ? 'bg-owed' : 'bg-owe'
                      }`}
                      style={{ width: `${barWidthPct}%` }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <h3 className="font-display text-lg text-ink mb-3">Suggested settle-up</h3>
        {remindError && <p className="text-sm text-owe mb-2">{remindError}</p>}
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
                    {t.to === currentUserId &&
                      (reminded[t.from] ? (
                        <span className="text-xs text-ink-soft">Reminded</span>
                      ) : (
                        <button
                          onClick={() => handleRemind(t.from)}
                          disabled={reminding === t.from}
                          className="text-xs font-medium text-ink-soft hover:text-primary hover:underline disabled:opacity-50"
                        >
                          {reminding === t.from ? 'Sending…' : 'Remind'}
                        </button>
                      ))}
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
