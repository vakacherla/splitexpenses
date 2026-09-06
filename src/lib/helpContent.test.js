import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HELP_SECTIONS } from './helpContent.jsx'

// Every HelpLink on every screen has to point at a section that actually
// exists — a typo'd or stale id renders nothing (HelpLink silently no-ops
// when it can't find the section), which is exactly how a screen's "?"
// icon quietly stops doing anything. This walks the real source files
// instead of hardcoding the list of screens, so a new HelpLink usage is
// covered automatically.

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function jsxFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) jsxFiles(full, files)
    else if (entry.name.endsWith('.jsx')) files.push(full)
  }
  return files
}

describe('help section targets', () => {
  const validIds = new Set(HELP_SECTIONS.map((s) => s.id))

  it('has at least one section', () => {
    expect(HELP_SECTIONS.length).toBeGreaterThan(0)
  })

  it('every section has a non-empty id, title, and body', () => {
    for (const section of HELP_SECTIONS) {
      expect(section.id, 'section missing id').toBeTruthy()
      expect(section.title, `${section.id} missing title`).toBeTruthy()
      expect(section.body, `${section.id} missing body`).toBeTruthy()
    }
  })

  it('has no duplicate section ids', () => {
    const ids = HELP_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every literal <HelpLink to="..."> target points at a real section', () => {
    const missing = []
    for (const file of jsxFiles(SRC_DIR)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(/<HelpLink\s+to="([a-z-]+)"/g)) {
        if (!validIds.has(match[1])) missing.push(`${path.relative(SRC_DIR, file)}: "${match[1]}"`)
      }
    }
    expect(missing).toEqual([])
  })

  it('TripView tab-to-section mapping points at real sections', () => {
    const text = fs.readFileSync(path.join(SRC_DIR, 'pages/TripView.jsx'), 'utf8')
    const block = text.match(/TAB_HELP_SECTION\s*=\s*\{([\s\S]*?)\}/)?.[1]
    expect(block, 'TAB_HELP_SECTION not found in TripView.jsx').toBeTruthy()
    const ids = [...block.matchAll(/:\s*'([a-z-]+)'/g)].map((m) => m[1])
    // Every trip tab (ledger/balances/reports/activity/members) should map to something.
    expect(ids.length).toBeGreaterThanOrEqual(5)
    for (const id of ids) {
      expect(validIds.has(id), `TAB_HELP_SECTION has unknown id "${id}"`).toBe(true)
    }
  })
})
