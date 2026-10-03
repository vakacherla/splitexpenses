import { describe, expect, it } from 'vitest'
import {
  MIN_USERS,
  addDays,
  biggestDrop,
  eventLabel,
  featureDiagnosis,
  featureRows,
  FEATURES,
  changeText,
  deviceText,
  formatDuration,
  liveRows,
  notEnoughData,
  pctOf,
  periodRange,
  stageRows,
  stoppedAtText,
  topEventRows,
  STUCK_SEGMENTS,
  stuckForDays,
  stuckToCSV,
  timeAgo,
  todayIn,
  whereText,
} from './usageStats'

describe('dates in the admin timezone', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-03', 1)).toBe('2026-10-04')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('"today" depends on the timezone', () => {
    const instant = new Date('2026-10-03T20:00:00Z')
    expect(todayIn('UTC', instant)).toBe('2026-10-03')
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-10-04')
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-10-03')
  })

  it('falls back to UTC for an unknown timezone', () => {
    expect(todayIn('Not/AZone', new Date('2026-10-03T20:00:00Z'))).toBe('2026-10-03')
  })

  it('builds an inclusive range ending today', () => {
    const now = new Date('2026-10-03T12:00:00Z')
    expect(periodRange(7, 'UTC', now)).toEqual({ from: '2026-09-27', to: '2026-10-03' })
    expect(periodRange(1, 'UTC', now)).toEqual({ from: '2026-10-03', to: '2026-10-03' })
    expect(periodRange(30, 'UTC', now).from).toBe('2026-09-04')
  })
})

describe('formatDuration', () => {
  it('reads in plain words', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(0)).toBe('under 1 min')
    expect(formatDuration(59)).toBe('under 1 min')
    expect(formatDuration(1800)).toBe('30 min')
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(15900)).toBe('4 h 25 min')
    expect(formatDuration(86400)).toBe('1 d')
    expect(formatDuration(6 * 86400 + 2 * 3600)).toBe('6 d 2 h')
    expect(formatDuration(-5)).toBe('under 1 min')
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  it('describes recency', () => {
    expect(timeAgo(null, now)).toBe('never')
    expect(timeAgo('2026-10-03T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-10-03T11:30:00Z', now)).toBe('30 min ago')
    expect(timeAgo('2026-10-03T09:00:00Z', now)).toBe('3 h ago')
    expect(timeAgo('2026-09-30T12:00:00Z', now)).toBe('3 d ago')
    expect(timeAgo('garbage', now)).toBe('never')
  })
})

describe('changeText', () => {
  it('shows direction and size', () => {
    expect(changeText(14, 12, 'vs yesterday')).toEqual({ text: '+2 vs yesterday', tone: 'up' })
    expect(changeText(9, 12, 'vs last week')).toEqual({ text: '−3 vs last week', tone: 'down' })
    expect(changeText(5, 5, 'vs yesterday')).toEqual({ text: 'no change vs yesterday', tone: 'flat' })
    expect(changeText(5, null, 'vs yesterday')).toEqual({ text: '', tone: 'flat' })
  })
})

describe('pctOf and notEnoughData', () => {
  it('rounds and refuses to divide by zero', () => {
    expect(pctOf(1, 3)).toBe(33)
    expect(pctOf(2, 3)).toBe(67)
    expect(pctOf(0, 10)).toBe(0)
    expect(pctOf(5, 0)).toBeNull()
    expect(pctOf(null, 10)).toBeNull()
  })

  it('flags small samples', () => {
    expect(notEnoughData(MIN_USERS - 1)).toBe(true)
    expect(notEnoughData(MIN_USERS)).toBe(false)
    expect(notEnoughData(undefined)).toBe(true)
  })
})

const funnel = {
  stages: [
    { key: 'signed_up', label: 'Signed up', users: 120, basis: null, median_seconds: null },
    { key: 'trip', label: 'Created or joined a trip', users: 84, basis: 'signed_up', basis_users: 120, median_seconds: 4800 },
    { key: 'expense', label: 'Added an expense', users: 61, basis: 'trip', basis_users: 84, median_seconds: 11100 },
    { key: 'shared', label: 'Shared an invite', users: null, basis: 'expense', basis_users: 61, median_seconds: null },
    { key: 'joined', label: 'Someone joined their trip', users: 33, basis: 'expense', basis_users: 61, median_seconds: 100000 },
    { key: 'settled', label: 'Settled up', users: 14, basis: 'expense', basis_users: 61, median_seconds: 500000 },
  ],
}

describe('stageRows', () => {
  const rows = stageRows(funnel)

  it('computes percentages of signups and of each stage basis', () => {
    expect(rows[1]).toMatchObject({ pctSignups: 70, pctBasis: 70 })
    expect(rows[2]).toMatchObject({ pctSignups: 51, pctBasis: 73 })
    expect(rows[4]).toMatchObject({ pctSignups: 28, pctBasis: 54 })
    expect(rows[5]).toMatchObject({ pctSignups: 12, pctBasis: 23 })
  })

  it('marks an unavailable stage instead of showing zero', () => {
    expect(rows[3]).toMatchObject({ unavailable: true, pctSignups: null, pctBasis: null, users: null })
  })

  it('has no basis percentage for the first stage and survives empty input', () => {
    expect(rows[0].pctBasis).toBeNull()
    expect(stageRows(null)).toEqual([])
  })
})

describe('biggestDrop', () => {
  it('picks the stage that loses the largest share of its basis', () => {
    expect(biggestDrop(stageRows(funnel))).toMatchObject({ key: 'settled', lost: 47 })
  })
  it('ignores unavailable stages and empty funnels', () => {
    expect(biggestDrop([])).toBeNull()
    const onlyUnavailable = [{ key: 'shared', unavailable: true, basisUsers: 10, users: null }]
    expect(biggestDrop(onlyUnavailable)).toBeNull()
  })
})

describe('stuck users', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  const row = {
    display_name: 'Maya, "M" Iyer',
    signed_up_at: '2026-09-30T08:00:00Z',
    last_seen_at: '2026-09-19T08:00:00Z',
    trips: 0,
    expenses: 0,
  }

  it('measures "stuck for" from signup, or from last seen for the quiet segment', () => {
    expect(stuckForDays(row, 'no_trip', now)).toBe(3)
    expect(stuckForDays(row, 'quiet', now)).toBe(14)
    expect(stuckForDays({ signed_up_at: null, last_seen_at: null }, 'quiet', now)).toBeNull()
  })

  it('exports a CSV with names and numbers, quoting properly, and no email column', () => {
    const csv = stuckToCSV([row], 'no_trip', now)
    const [header, line] = csv.split('\n')
    expect(header).toBe('Name,Segment,Signed up,Last seen,Trips,Expenses,Days stuck')
    expect(line).toBe('"Maya, ""M"" Iyer",No trip yet,2026-09-30,2026-09-19,0,0,3')
    expect(header.toLowerCase()).not.toContain('email')
  })

  it('puts "Never signed in" first and describes why they stopped', () => {
    expect(STUCK_SEGMENTS[0].key).toBe('never_signed_in')
    expect(stoppedAtText({ email_confirmed: false }, 'never_signed_in')).toBe('Email never confirmed')
    expect(stoppedAtText({ email_confirmed: true }, 'never_signed_in')).toBe('Email confirmed, never signed in')
    expect(stoppedAtText({}, 'never_signed_in')).toBe('Account created, never signed in')
    expect(stoppedAtText({ email_confirmed: false }, 'no_trip')).toBe('Signed up, no trip')
  })

  it('adds a yes/no email column for never-signed-in rows only, never an address', () => {
    const rows = [
      { display_name: 'A', signed_up_at: '2026-09-29T00:00:00Z', last_seen_at: null, trips: 0, expenses: 0, email_confirmed: false },
      { display_name: 'B', signed_up_at: '2026-09-29T00:00:00Z', last_seen_at: null, trips: 0, expenses: 0, email_confirmed: true },
      { display_name: 'C', signed_up_at: '2026-09-29T00:00:00Z', last_seen_at: null, trips: 0, expenses: 0 },
    ]
    const csv = stuckToCSV(rows, 'never_signed_in', new Date('2026-10-03T12:00:00Z')).split('\n')
    expect(csv[0]).toBe('Name,Segment,Signed up,Last seen,Trips,Expenses,Days stuck,Email confirmed')
    expect(csv[1]).toMatch(/,no$/)
    expect(csv[2]).toMatch(/,yes$/)
    expect(csv[3]).toMatch(/,$/)
    expect(csv.join('\n')).not.toMatch(/@/)
    expect(stuckToCSV(rows, 'no_trip').split('\n')[0]).not.toContain('Email confirmed')
  })

  it('exports just the header for an empty list', () => {
    expect(stuckToCSV([], 'quiet', now).split('\n')).toHaveLength(1)
  })
})

describe('feature adoption diagnosis (REQ-USE-10)', () => {
  const base = { totalUsers: 40, active: 20 }

  it('says nothing with fewer than 10 users or nobody active', () => {
    expect(featureDiagnosis({ ...base, totalUsers: 9, tried: 10, repeated: 10 })).toBeNull()
    expect(featureDiagnosis({ ...base, totalUsers: 10, tried: 0, repeated: 0, active: 0 })).toBeNull()
  })

  it('a discovery gap is tried by under 15% of active users', () => {
    expect(featureDiagnosis({ ...base, tried: 2, repeated: 2 })).toBe('discovery') // 10%
    expect(featureDiagnosis({ ...base, tried: 0, repeated: 0 })).toBe('discovery')
  })

  it('exactly 15% tried is not a discovery gap', () => {
    expect(featureDiagnosis({ ...base, tried: 3, repeated: 3 })).toBe('healthy') // 15%, all repeated
    expect(featureDiagnosis({ ...base, tried: 3, repeated: 0 })).toBe('quality')
  })

  it('a quality gap is tried by 15%+ but repeated by under 30% of those', () => {
    expect(featureDiagnosis({ ...base, tried: 10, repeated: 2 })).toBe('quality') // 20%
    expect(featureDiagnosis({ ...base, tried: 10, repeated: 0 })).toBe('quality')
  })

  it('exactly 30% repeated is healthy', () => {
    expect(featureDiagnosis({ ...base, tried: 10, repeated: 3 })).toBe('healthy')
    expect(featureDiagnosis({ ...base, tried: 10, repeated: 9 })).toBe('healthy')
  })

  it('exactly 10 users is enough for a diagnosis', () => {
    expect(featureDiagnosis({ totalUsers: 10, active: 10, tried: 1, repeated: 1 })).toBe('discovery')
  })
})

describe('feature rows', () => {
  it('lists every feature in a fixed order, zero when untracked', () => {
    const rows = featureRows({ active_users: 20, total_users: 40, features: [{ feature: 'receipt_scan', tried: 8, repeated: 4 }] })
    expect(rows.map((r) => r.key)).toEqual(FEATURES.map((f) => f.key))
    const scan = rows.find((r) => r.key === 'receipt_scan')
    expect(scan).toMatchObject({ tried: 8, repeated: 4, triedOnce: 4, pctTried: 40, pctRepeated: 20, diagnosis: 'healthy' })
    expect(rows.find((r) => r.key === 'tour')).toMatchObject({ tried: 0, repeated: 0, pctTried: 0, diagnosis: 'discovery' })
  })

  it('never lets repeated exceed tried, and copes with no data', () => {
    expect(featureRows({ active_users: 5, total_users: 5, features: [{ feature: 'help', tried: 1, repeated: 3 }] }).find((r) => r.key === 'help').repeated).toBe(1)
    const empty = featureRows(null)
    expect(empty).toHaveLength(FEATURES.length)
    expect(empty[0]).toMatchObject({ tried: 0, pctTried: null, diagnosis: null })
  })
})

describe('top events (REQ-USE-11)', () => {
  it('labels plain events, features and page views in words', () => {
    expect(eventLabel('app_open')).toBe('Opened the app')
    expect(eventLabel('expense_added')).toBe('Added an expense')
    expect(eventLabel('feature_used:receipt_scan')).toBe('Used receipt scan')
    expect(eventLabel('feature_used:csv_import')).toBe('Used CSV import')
    expect(eventLabel('feature_used:settle_up')).toBe('Used settle up')
    expect(eventLabel('page_view:/rates')).toBe('Viewed Exchange rates')
    expect(eventLabel('page_view:/trips/:id')).toBe('Viewed a trip')
  })

  it('falls back to readable text for anything unknown', () => {
    expect(eventLabel('feature_used:brand_new')).toBe('Used brand new')
    expect(eventLabel('page_view:/somewhere')).toBe('Viewed /somewhere')
    expect(eventLabel('something_else')).toBe('something else')
    expect(eventLabel(null)).toBe('')
  })

  it('turns the response into rows with a share of active people', () => {
    const rows = topEventRows({ active_users: 8, events: [{ event: 'app_open', users: 6 }, { event: 'settled_up', users: 1 }] })
    expect(rows).toEqual([
      { key: 'app_open', label: 'Opened the app', users: 6, pct: 75 },
      { key: 'settled_up', label: 'Settled up', users: 1, pct: 13 },
    ])
  })

  it('copes with no data and with nobody active', () => {
    expect(topEventRows(null)).toEqual([])
    expect(topEventRows({ active_users: 0, events: [{ event: 'app_open', users: 1 }] })[0].pct).toBeNull()
  })
})

describe('live users now (REQ-USE-26)', () => {
  it('describes a device in words and says nothing when unknown', () => {
    expect(deviceText({ form_factor: 'phone', install_mode: 'pwa', os: 'ios' })).toBe('Phone · installed app · iOS')
    expect(deviceText({ form_factor: 'desktop', install_mode: 'browser', os: 'macos' })).toBe('Desktop · browser · macOS')
    expect(deviceText({ form_factor: 'tablet', os: 'other' })).toBe('Tablet')
    expect(deviceText({})).toBeNull()
    expect(deviceText()).toBeNull()
  })

  it('says where someone is from the route pattern', () => {
    expect(whereText('/trips/:id')).toBe('Viewing a trip')
    expect(whereText('/rates')).toBe('Viewing Exchange rates')
    expect(whereText('/somewhere')).toBe('Viewing /somewhere')
    expect(whereText(null)).toBe('In the app')
  })

  it('shapes the response into rows, with fallbacks', () => {
    const now = new Date('2026-10-03T12:00:00Z')
    const rows = liveRows(
      {
        users: [
          { user_id: 'a', display_name: 'Una', avatar_path: 'a.jpg', last_seen_at: '2026-10-03T11:58:00Z', route: '/trips/:id', form_factor: 'phone', install_mode: 'pwa', os: 'ios' },
          { user_id: 'b', display_name: 'Ben', avatar_path: null, last_seen_at: '2026-10-03T11:59:50Z', route: null },
        ],
      },
      now
    )
    expect(rows[0]).toEqual({ userId: 'a', name: 'Una', avatarPath: 'a.jpg', where: 'Viewing a trip', device: 'Phone · installed app · iOS', seen: '2 min ago' })
    expect(rows[1]).toMatchObject({ name: 'Ben', where: 'In the app', device: 'Unknown device', seen: 'just now' })
    expect(liveRows(null)).toEqual([])
  })
})
