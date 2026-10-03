import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The Supabase dashboard's SQL editor reads inside function bodies, mistakes
// the INTO form of select (used to fill a variable) for creating a table, and
// then mangles the script ("unterminated dollar-quoted string"). Migrations
// are applied by pasting them into that editor, so from 049 onward fill
// variables with `x := (select ...)` instead. Migration 049 failed this way
// on 3 Oct 2026.

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations')

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

// Removes every "insert into" so only a select-into form is left to find.
function selectIntoMatches(sql) {
  const cleaned = stripComments(sql).replace(/\binsert\s+into\b/gi, 'insert_')
  return [...cleaned.matchAll(/\bselect\b[^;]*?\binto\s+[a-z_][a-z0-9_.]*/gi)].map((m) => m[0].replace(/\s+/g, ' ').slice(-60))
}

describe('migrations are safe to paste into the Supabase SQL editor', () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 49)
    .sort()

  it('finds the migrations it is meant to check', () => {
    expect(files).toContain('049_usage_insights.sql')
    expect(files).toContain('050_usage_admin_reports.sql')
  })

  for (const file of files) {
    it(`${file} has no select ... into <name>`, () => {
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8')
      expect(selectIntoMatches(sql)).toEqual([])
    })
  }

  it('the checker itself catches the pattern that broke migration 049', () => {
    const bad = 'create function f() returns int as $$ declare n int; begin select count(*) into n from t; return n; end $$ language plpgsql;'
    expect(selectIntoMatches(bad).length).toBe(1)
    const multiline = 'begin\n  with x as (select 1)\n  select jsonb_build_object(1) into res\n  from x;\nend'
    expect(selectIntoMatches(multiline).length).toBe(1)
  })

  it('does not flag insert into, or the word in comments', () => {
    expect(selectIntoMatches('insert into public.t (a) select 1;')).toEqual([])
    expect(selectIntoMatches('-- select 1 into x\nselect 1;')).toEqual([])
  })
})
