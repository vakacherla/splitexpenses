import { describe, expect, it, vi } from 'vitest'
import { fetchProfileRow, isMissingColumnError } from './profileFetch'

function fakeClient(responses) {
  const selects = []
  const queue = [...responses]
  const client = {
    from: () => ({
      select: (columns) => {
        selects.push(columns)
        return { eq: () => ({ single: () => Promise.resolve(queue.shift()) }) }
      },
    }),
  }
  return { client, selects }
}

const row = { id: 'u1', display_name: 'A', email: 'a@x', is_admin: false, is_super_admin: false, avatar_path: null }

describe('fetchProfileRow', () => {
  it('returns the row, including share_usage, in one request when the column exists', async () => {
    const { client, selects } = fakeClient([{ data: { ...row, share_usage: true }, error: null }])
    await expect(fetchProfileRow(client, 'u1')).resolves.toEqual({ ...row, share_usage: true })
    expect(selects).toHaveLength(1)
    expect(selects[0]).toContain('share_usage')
  })

  it('keeps an explicit false', async () => {
    const { client } = fakeClient([{ data: { ...row, share_usage: false }, error: null }])
    expect((await fetchProfileRow(client, 'u1')).share_usage).toBe(false)
  })

  it('falls back without the column when the database does not have it yet, reporting it unknown', async () => {
    const { client, selects } = fakeClient([
      { data: null, error: { code: '42703', message: 'column profiles.share_usage does not exist' } },
      { data: row, error: null },
    ])
    const result = await fetchProfileRow(client, 'u1')
    expect(result).toEqual({ ...row, share_usage: undefined })
    expect(result.share_usage).toBeUndefined()
    expect(selects).toHaveLength(2)
    expect(selects[1]).not.toContain('share_usage')
  })

  it('also recognises the missing column by message alone', async () => {
    const { client } = fakeClient([
      { data: null, error: { message: 'Could not find the share_usage column of profiles in the schema cache' } },
      { data: row, error: null },
    ])
    expect((await fetchProfileRow(client, 'u1')).id).toBe('u1')
  })

  it('does not hide other errors', async () => {
    const boom = { code: 'PGRST301', message: 'JWT expired' }
    const { client, selects } = fakeClient([{ data: null, error: boom }])
    await expect(fetchProfileRow(client, 'u1')).rejects.toBe(boom)
    expect(selects).toHaveLength(1)
  })

  it('throws if the fallback also fails', async () => {
    const second = { code: '500', message: 'server error' }
    const { client } = fakeClient([
      { data: null, error: { code: '42703', message: 'share_usage missing' } },
      { data: null, error: second },
    ])
    await expect(fetchProfileRow(client, 'u1')).rejects.toBe(second)
  })
})

describe('isMissingColumnError', () => {
  it('is false for no error and unrelated errors', () => {
    expect(isMissingColumnError(null)).toBe(false)
    expect(isMissingColumnError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(vi.isMockFunction(isMissingColumnError)).toBe(false)
  })
})
