import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useTheme } from '../context/ThemeContext'
import { downloadCSV } from '../lib/csvExport'
import {
  PERIODS,
  STUCK_SEGMENTS,
  adminTimeZone,
  biggestDrop,
  changeText,
  formatDuration,
  notEnoughData,
  periodRange,
  stageRows,
  stoppedAtText,
  stuckForDays,
  stuckToCSV,
  timeAgo,
} from '../lib/usageStats'
import Avatar from './Avatar'
import HelpLink from './HelpLink'
import EmptyState from './EmptyState'
import { Skeleton, SkeletonChart, SkeletonStatGrid } from './Skeleton'

// Admin → Usage (REQ-USE-05..09). Every number comes from an admin_usage_*
// database function that refuses non-admins and never returns an email.
//
// Charts use literal colours (Recharts and inline styles cannot read CSS
// custom properties). Series colours are the validated categorical palette;
// the funnel uses an ordered one-hue ramp. Both are stepped separately for
// light and dark.
const COLORS = {
  light: {
    grid: '#ddd8c6', muted: '#6f7566', ink: '#16241d',
    dau: '#2a78d6', wau: '#eb6834',
    ramp: ['#86b6ef', '#5598e7', '#256abf', '#184f95', '#104281'],
    bar: '#2a78d6',
  },
  dark: {
    grid: '#303a2b', muted: '#838a76', ink: '#e9e4d4',
    dau: '#3987e5', wau: '#d95926',
    ramp: ['#86b6ef', '#5598e7', '#3987e5', '#256abf', '#1c5cab'],
    bar: '#3987e5',
  },
}

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'stuck', label: 'Stuck users' },
]

// Loads one database function. The result is stored with the key it was
// loaded for, so "loading" is simply "the stored key is not the current key"
// and no state has to be set synchronously inside the effect.
function useRpc(name, args) {
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState({ key: '', data: null, error: '' })
  const argsJson = JSON.stringify(args)
  const key = `${name}|${argsJson}|${nonce}`

  useEffect(() => {
    let cancelled = false
    supabase.rpc(name, JSON.parse(argsJson)).then(({ data, error }) => {
      if (!cancelled) setResult({ key, data: error ? null : data, error: error ? error.message : '' })
    })
    return () => {
      cancelled = true
    }
  }, [name, argsJson, key])

  return {
    data: result.key === key ? result.data : null,
    error: result.key === key ? result.error : '',
    loading: result.key !== key,
    reload: () => setNonce((n) => n + 1),
  }
}

function ErrorNote({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-line bg-paper-raised p-4 text-sm">
      <p className="text-owe">Could not load this: {message}</p>
      <button onClick={onRetry} className="mt-2 text-primary font-medium hover:underline">
        Try again
      </button>
    </div>
  )
}

function Segmented({ value, onChange, options, label }) {
  return (
    <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1 text-xs transition-colors ${
            value === o.id ? 'bg-primary-tint text-primary font-medium' : 'bg-paper-raised text-ink-soft hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// A report card with a Chart / Table switch.
function Card({ title, subtitle, chart, table, insight }) {
  const [view, setView] = useState('chart')
  return (
    <section className="rounded-xl border border-line bg-paper-raised p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-base text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-ink-soft mt-0.5">{subtitle}</p>}
        </div>
        <Segmented
          label="View as"
          value={view}
          onChange={setView}
          options={[
            { id: 'chart', label: 'Chart' },
            { id: 'table', label: 'Table' },
          ]}
        />
      </div>
      {view === 'chart' ? chart : <div className="overflow-x-auto">{table}</div>}
      {insight && <p className="text-sm text-ink-soft border-t border-line pt-3">{insight}</p>}
    </section>
  )
}

function Table({ head, rows }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className="text-left text-xs uppercase tracking-wide text-ink-soft font-medium py-2 pr-4 whitespace-nowrap">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className="py-2 pr-4 num align-top">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Kpi({ label, value, note, tone, dot }) {
  const toneClass = tone === 'up' ? 'text-owed' : tone === 'down' ? 'text-owe' : 'text-ink-soft'
  return (
    <div className="rounded-xl border border-line bg-paper-raised px-4 py-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="font-display text-3xl text-ink num flex items-center gap-2">
        {dot && <span className="inline-block h-2.5 w-2.5 rounded-full bg-owed" aria-hidden="true" />}
        {value ?? '—'}
      </p>
      {note && <p className={`text-xs ${toneClass}`}>{note}</p>}
    </div>
  )
}

function SmallSampleNote({ users }) {
  if (!notEnoughData(users)) return null
  return (
    <p className="rounded-lg bg-accent-tint text-ink text-sm px-3 py-2">
      Only {users ?? 0} {users === 1 ? 'user' : 'users'} so far. Treat percentages as rough, one person can move them a lot.
    </p>
  )
}

function dayLabel(day) {
  const d = new Date(`${day}T00:00:00`)
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------- Overview

function OverviewView({ days, exclude, tz }) {
  const { theme } = useTheme()
  const c = COLORS[theme]
  const { data, error, loading, reload } = useRpc('admin_usage_overview', { p_days: days, p_tz: tz, p_exclude: exclude })

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonStatGrid count={5} />
        <SkeletonChart />
      </div>
    )
  }
  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (!data) return null

  const series = data.series ?? []
  const dauChange = changeText(data.dau, data.dau_prev, 'vs yesterday')
  const wauChange = changeText(data.wau, data.wau_prev, 'vs last week')
  const mauChange = changeText(data.mau, data.mau_prev, 'vs last month')

  const chart = (
    <div>
      <div className="flex gap-4 text-xs text-ink-soft mb-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.dau }} />
          Daily active
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.wau }} />
          Weekly active
        </span>
      </div>
      <div className="h-60" role="img" aria-label="Line chart of daily and weekly active users">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="day" tickFormatter={dayLabel} stroke={c.muted} tick={{ fill: c.muted, fontSize: 11 }} minTickGap={32} />
            <YAxis allowDecimals={false} stroke={c.muted} tick={{ fill: c.muted, fontSize: 11 }} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm">
                    <p className="text-ink font-medium">{dayLabel(label)}</p>
                    {payload.map((p) => (
                      <p key={p.dataKey} className="num text-ink-soft">
                        {p.dataKey === 'dau' ? 'Daily active' : 'Weekly active'}: {p.value}
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            <Line type="monotone" dataKey="wau" stroke={c.wau} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="dau" stroke={c.dau} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  const table = (
    <Table
      head={['Day', 'Daily active', 'Weekly active']}
      rows={[...series].reverse().map((s) => [dayLabel(s.day), s.dau, s.wau])}
    />
  )

  return (
    <div className="space-y-4">
      <SmallSampleNote users={data.total_users} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Active now (last 5 min)" value={data.active_now} dot note="Updates on load" />
        <Kpi label="Active today (DAU)" value={data.dau} note={dauChange.text} tone={dauChange.tone} />
        <Kpi label="Active this week (WAU)" value={data.wau} note={wauChange.text} tone={wauChange.tone} />
        <Kpi label="Active this month (MAU)" value={data.mau} note={mauChange.text} tone={mauChange.tone} />
        <Kpi
          label="Stickiness (avg DAU ÷ MAU)"
          value={data.stickiness == null ? null : `${data.stickiness}%`}
          note="Average daily users over monthly users"
        />
      </div>
      <Card
        title="Active users"
        subtitle={`Distinct people with at least one action per day, in ${data.tz} time`}
        chart={chart}
        table={table}
        insight={
          data.has_tracking
            ? null
            : 'Usage tracking has not collected anything yet, so activity here comes from actions only (adding expenses, joining trips, settling up, signing in). Page views and browsing appear once tracking has data.'
        }
      />
      {data.opted_out > 0 && (
        <p className="text-xs text-ink-soft">
          {data.opted_out} {data.opted_out === 1 ? 'user has' : 'users have'} turned off usage data. They are counted only
          from what they do in trips, not from page views.
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Funnel

function UserList({ rows, empty }) {
  if (rows.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((u) => (
        <li key={u.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <Avatar avatarPath={u.avatar_path} name={u.display_name} size="sm" />
            <span className="truncate text-ink">{u.display_name}</span>
          </span>
          <span className="text-xs text-ink-soft text-right shrink-0">
            Signed up {timeAgo(u.signed_up_at)} · seen {timeAgo(u.last_seen_at)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function FunnelBar({ row, color, scaleTo, selected, onSelect }) {
  const clickable = !row.unavailable && row.key !== 'signed_up'
  const width = row.unavailable || !scaleTo ? 0 : Math.max(2, (row.users / scaleTo) * 100)
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">{row.label}</span>
        <span className="num text-ink shrink-0">
          {row.unavailable ? 'No data yet' : `${row.users}${row.pctSignups != null ? ` · ${row.pctSignups}% of signups` : ''}`}
        </span>
      </div>
      <div className="h-5 mt-1 rounded-sm bg-line/50 overflow-hidden" aria-hidden="true">
        <div className="h-full" style={{ width: `${width}%`, background: color }} />
      </div>
      <p className="text-xs text-ink-soft mt-1">
        {row.unavailable
          ? 'Appears once usage tracking has recorded someone copying an invite code.'
          : [
              row.pctBasis != null ? `${row.pctBasis}% of ${row.basis === 'expense' ? 'people who added an expense' : 'the previous step'}` : null,
              row.median != null ? `median ${formatDuration(row.median)} after ${row.basis === 'expense' ? 'their first expense' : row.basis === 'trip' ? 'joining a trip' : 'signing up'}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || ' '}
      </p>
    </>
  )
  if (!clickable) return <div className="px-2 py-1.5">{inner}</div>
  return (
    <button
      type="button"
      onClick={() => onSelect(row.key)}
      aria-pressed={selected}
      className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${selected ? 'bg-primary-tint' : 'hover:bg-primary-tint/60'}`}
    >
      {inner}
    </button>
  )
}

function FunnelView({ days, exclude, tz }) {
  const { theme } = useTheme()
  const c = COLORS[theme]
  const range = useMemo(() => periodRange(days, tz), [days, tz])
  const args = { p_from: range.from, p_to: range.to, p_tz: tz, p_exclude: exclude }
  const funnel = useRpc('admin_usage_funnel', args)
  const ttfe = useRpc('admin_usage_ttfe', args)
  const [stage, setStage] = useState('trip')
  const [page, setPage] = useState(0)
  const PAGE = 10
  const who = useRpc('admin_usage_funnel_users', { ...args, p_stage: stage, p_limit: PAGE, p_offset: page * PAGE })

  if (funnel.loading) return <SkeletonChart />
  if (funnel.error) return <ErrorNote message={funnel.error} onRetry={funnel.reload} />
  const rows = stageRows(funnel.data)
  const signed = rows[0]?.users ?? 0
  if (signed === 0) {
    return <EmptyState title="No signups in this period" subtitle="Try a longer period to see how new people move through." />
  }
  const sequential = rows.slice(0, 3)
  const afterExpense = rows.slice(3)
  const expenseUsers = rows[2]?.users ?? 0
  const drop = biggestDrop(rows)
  const selected = rows.find((r) => r.key === stage)
  const select = (key) => {
    setStage(key)
    setPage(0)
  }

  const chart = (
    <div className="space-y-4">
      <div className="space-y-1">
        {sequential.map((r, i) => (
          <FunnelBar key={r.key} row={r} color={c.ramp[i + 1]} scaleTo={signed} selected={stage === r.key} onSelect={select} />
        ))}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-soft mb-1">
          After the first expense (out of {expenseUsers} who added one)
        </p>
        <div className="space-y-1">
          {afterExpense.map((r) => (
            <FunnelBar key={r.key} row={r} color={c.bar} scaleTo={expenseUsers} selected={stage === r.key} onSelect={select} />
          ))}
        </div>
      </div>
    </div>
  )

  const table = (
    <Table
      head={['Stage', 'Users', '% of signups', '% of its basis', 'Median time']}
      rows={rows.map((r) => [
        r.label,
        r.unavailable ? 'No data yet' : r.users,
        r.pctSignups == null ? '—' : `${r.pctSignups}%`,
        r.pctBasis == null ? '—' : `${r.pctBasis}%`,
        formatDuration(r.median),
      ])}
    />
  )

  const t = ttfe.data
  const maxBucket = Math.max(1, ...(t?.buckets ?? []).map((b) => b.users))
  const ttfeChart = t && (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        Median <span className="font-medium num">{formatDuration(t.median_seconds)}</span> · slowest 10%{' '}
        <span className="font-medium num">{formatDuration(t.p90_seconds)}</span> · {t.converted} of {t.signups} added an
        expense
      </p>
      <div className="space-y-1.5">
        {t.buckets.map((b) => (
          <div key={b.key} className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-sm">
            <span className="text-ink-soft">{b.label}</span>
            <div className="h-4 rounded-sm bg-line/50 overflow-hidden" aria-hidden="true">
              <div className="h-full" style={{ width: `${b.users ? Math.max(2, (b.users / maxBucket) * 100) : 0}%`, background: b.key === 'never' ? c.wau : c.bar }} />
            </div>
            <span className="num text-right text-ink">{b.users}</span>
          </div>
        ))}
      </div>
    </div>
  )
  const ttfeTable = t && (
    <Table head={['Time to first expense', 'Users']} rows={t.buckets.map((b) => [b.label, b.users])} />
  )

  const whoRows = who.data ?? []
  const total = whoRows[0]?.total ?? 0

  return (
    <div className="space-y-4">
      <SmallSampleNote users={signed} />
      <Card
        title="Activation funnel"
        subtitle="People who signed up in this period and how far they got. Click a step to see who stopped before it."
        chart={chart}
        table={table}
        insight={
          drop
            ? `Biggest loss: "${drop.label}" — ${drop.lost} of ${drop.basisUsers} (${Math.round(drop.share * 100)}%) did not get there.`
            : null
        }
      />
      <section className="rounded-xl border border-line bg-paper-raised p-4 space-y-3">
        <div>
          <h3 className="font-display text-base text-ink">Stopped before "{selected?.label}"</h3>
          <p className="text-xs text-ink-soft mt-0.5">
            {who.loading ? 'Loading…' : `${total} ${total === 1 ? 'person' : 'people'} reached the step before and not this one.`}
          </p>
        </div>
        {who.error ? (
          <ErrorNote message={who.error} onRetry={who.reload} />
        ) : who.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <UserList rows={whoRows} empty="Nobody. Everyone who got to the previous step also got here." />
            {total > PAGE && (
              <div className="flex items-center justify-between text-sm">
                <button disabled={page === 0} onClick={() => setPage(page - 1)} className="text-primary disabled:text-ink-soft disabled:opacity-50">
                  Previous
                </button>
                <span className="text-xs text-ink-soft num">
                  {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
                </span>
                <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)} className="text-primary disabled:text-ink-soft disabled:opacity-50">
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
      {ttfe.error ? (
        <ErrorNote message={ttfe.error} onRetry={ttfe.reload} />
      ) : ttfe.loading ? (
        <SkeletonChart />
      ) : (
        <Card title="Time to first expense" subtitle="From signing up to adding the first expense" chart={ttfeChart} table={ttfeTable} />
      )}
    </div>
  )
}

// ------------------------------------------------------------- Stuck users

function StuckView({ exclude }) {
  const [segment, setSegment] = useState('never_signed_in')
  const [pages, setPages] = useState(1)
  const PAGE = 20
  const counts = useRpc('admin_usage_stuck_counts', { p_exclude: exclude })
  const list = useRpc('admin_usage_stuck', { p_segment: segment, p_exclude: exclude, p_limit: PAGE * pages, p_offset: 0 })
  const rows = list.data ?? []
  const total = rows[0]?.total ?? 0

  function pick(key) {
    setSegment(key)
    setPages(1)
  }

  return (
    <section className="rounded-xl border border-line bg-paper-raised p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base text-ink">Stuck users</h3>
          <p className="text-xs text-ink-soft mt-0.5">People who stalled. Names and avatars only, no email addresses.</p>
        </div>
        <button
          disabled={rows.length === 0}
          onClick={() => downloadCSV(`stuck-users-${segment}.csv`, stuckToCSV(rows, segment))}
          className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:border-primary hover:text-primary disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Segment">
        {STUCK_SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={segment === s.key}
            onClick={() => pick(s.key)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              segment === s.key ? 'bg-primary text-on-primary border-primary' : 'border-line text-ink-soft hover:text-ink'
            }`}
          >
            {s.label} · {counts.data ? counts.data[s.key] : '…'}
          </button>
        ))}
      </div>
      {segment === 'never_signed_in' && (
        <p className="text-sm text-ink-soft">
          Accounts we have never seen do anything. "Email never confirmed" usually means the confirmation email did not
          reach them. "Confirmed, never signed in" means they got past email, so ask them what they saw.
        </p>
      )}
      {counts.error && <ErrorNote message={counts.error} onRetry={counts.reload} />}
      {list.error ? (
        <ErrorNote message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Nobody is in this group right now.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4 font-medium">User</th>
                  <th className="py-2 pr-4 font-medium">Stopped at</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Last seen</th>
                  <th className="py-2 pr-4 font-medium">Trips</th>
                  <th className="py-2 pr-4 font-medium">Expenses</th>
                  <th className="py-2 font-medium whitespace-nowrap">Stuck for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((u) => (
                  <tr key={u.user_id}>
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <Avatar avatarPath={u.avatar_path} name={u.display_name} size="sm" />
                        <span className="text-ink">{u.display_name}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{stoppedAtText(u, segment)}</td>
                    <td className="py-2 pr-4 text-ink-soft whitespace-nowrap">{timeAgo(u.last_seen_at)}</td>
                    <td className="py-2 pr-4 num">{u.trips}</td>
                    <td className="py-2 pr-4 num">{u.expenses}</td>
                    <td className="py-2 num whitespace-nowrap">{stuckForDays(u, segment)} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-ink-soft num">
              Showing {rows.length} of {total}
            </span>
            {rows.length < total && (
              <button onClick={() => setPages(pages + 1)} className="text-primary font-medium hover:underline">
                Show more
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ------------------------------------------------------------------- Panel

export default function UsagePanel() {
  const [view, setView] = useState('overview')
  const [days, setDays] = useState(30)
  const [exclude, setExclude] = useState(true)
  const tz = useMemo(() => adminTimeZone(), [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-1.5" role="tablist" aria-label="Usage views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                view === v.id ? 'bg-primary text-on-primary border-primary' : 'border-line text-ink-soft hover:text-ink'
              }`}
            >
              {v.label}
            </button>
          ))}
          <span
            className="rounded-full border border-dashed border-line px-3 py-1 text-sm text-ink-soft/70"
            title="Feature adoption needs a few weeks of tracking data first"
          >
            Features · soon
          </span>
          <HelpLink to="admin-usage" className="self-center" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
        {view !== 'stuck' && (
          <label className="flex items-center gap-2">
            Period
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-line bg-paper-raised px-2 py-1 text-ink"
              aria-label="Period"
            >
              {PERIODS.map((p) => (
                <option key={p.days} value={p.days}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} className="accent-primary" />
          Exclude admins and test accounts
        </label>
        <span className="text-xs">Days are in your timezone ({tz})</span>
      </div>

      {view === 'overview' && <OverviewView days={days} exclude={exclude} tz={tz} />}
      {view === 'funnel' && <FunnelView days={days} exclude={exclude} tz={tz} />}
      {view === 'stuck' && <StuckView exclude={exclude} />}
    </div>
  )
}
