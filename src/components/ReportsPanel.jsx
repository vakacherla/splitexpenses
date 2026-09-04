import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../lib/fx'
import { CATEGORY_COLORS } from '../lib/categories'
import { useTheme } from '../context/ThemeContext'
import EmptyState from './EmptyState'

// Recharts needs literal colors (it sets SVG attributes directly, which
// can't resolve our CSS custom properties), so the light/dark values for
// chart chrome are mirrored here from index.css rather than referenced.
const CHART_COLORS = {
  light: { line: '#ddd8c6', muted: '#6f7566', ink: '#16241d', primaryTint: '#e7ede4', primary: '#2f5233' },
  dark: { line: '#303a2b', muted: '#838a76', ink: '#e9e4d4', primaryTint: '#1e2b1c', primary: '#5fa66a' },
}

function ChartTooltip({ active, payload, homeCurrency }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-lg border border-line bg-paper-raised px-3 py-2 shadow-raised text-sm">
      <p className="text-ink font-medium">{name}</p>
      <p className="num text-ink-soft">{formatMoney(value, homeCurrency)}</p>
    </div>
  )
}

export default function ReportsPanel({ expenses, members, homeCurrency, currentUserId }) {
  const { theme } = useTheme()
  const chart = CHART_COLORS[theme]
  const membersMap = Object.fromEntries(members.map((m) => [m.user_id, m]))

  const { byCategory, byPerson, matrix, total } = useMemo(() => {
    const byCategory = {}
    const byPerson = {}
    const matrix = {}

    for (const exp of expenses) {
      const cat = exp.category || 'Misc'
      byCategory[cat] = (byCategory[cat] ?? 0) + exp.amount_in_home
      byPerson[exp.paid_by] = (byPerson[exp.paid_by] ?? 0) + exp.amount_in_home
      matrix[cat] = matrix[cat] ?? {}
      matrix[cat][exp.paid_by] = (matrix[cat][exp.paid_by] ?? 0) + exp.amount_in_home
    }

    const total = Object.values(byCategory).reduce((sum, v) => sum + v, 0)
    return { byCategory, byPerson, matrix, total }
  }, [expenses])

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M4 16V9M10 16V4M16 16v-6" strokeLinecap="round" />
          </svg>
        }
        title="Nothing to report yet"
        subtitle="Add a few expenses and this fills in."
      />
    )
  }

  const categoryData = Object.entries(byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const personData = Object.entries(byPerson)
    .map(([id, value]) => ({
      name: id === currentUserId ? 'You' : (membersMap[id]?.display_name ?? 'Unknown'),
      value,
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-10">
      <div>
        <p className="text-xs text-ink-soft mb-1">Total spent</p>
        <p className="num font-display text-3xl text-ink">{formatMoney(total, homeCurrency)}</p>
      </div>

      <div>
        <h3 className="font-display text-lg text-ink mb-3">By category</h3>
        <div style={{ height: Math.max(160, categoryData.length * 36) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: chart.muted }} tickFormatter={(v) => v.toFixed(0)} />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 12, fill: chart.ink }} />
              <Tooltip content={<ChartTooltip homeCurrency={homeCurrency} />} cursor={{ fill: chart.primaryTint }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {categoryData.map((entry) => (
                  <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#9a958a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {categoryData.map((c) => (
            <li key={c.name} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2 text-ink">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[c.name] ?? '#9a958a' }}
                />
                {c.name}
              </span>
              <span className="num text-ink-soft">
                {formatMoney(c.value, homeCurrency)} · {total > 0 ? Math.round((c.value / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display text-lg text-ink mb-3">By who paid</h3>
        <div style={{ height: Math.max(140, personData.length * 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={personData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: chart.muted }} tickFormatter={(v) => v.toFixed(0)} />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 12, fill: chart.ink }} />
              <Tooltip content={<ChartTooltip homeCurrency={homeCurrency} />} cursor={{ fill: chart.primaryTint }} />
              <Bar dataKey="value" fill={chart.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg text-ink mb-3">Category × person</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-normal text-ink-soft py-2 pr-3">Category</th>
                {members.map((m) => (
                  <th key={m.user_id} className="text-right font-normal text-ink-soft py-2 px-3 whitespace-nowrap">
                    {m.user_id === currentUserId ? 'You' : m.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categoryData.map((c) => (
                <tr key={c.name} className="border-b border-line">
                  <td className="py-2 pr-3 text-ink">{c.name}</td>
                  {members.map((m) => {
                    const val = matrix[c.name]?.[m.user_id] ?? 0
                    return (
                      <td key={m.user_id} className="num text-right py-2 px-3 text-ink-soft">
                        {val > 0 ? formatMoney(val, homeCurrency) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
