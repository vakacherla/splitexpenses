import { describe, it, expect } from 'vitest'
import { friendlyError } from './errors'

describe('friendlyError', () => {
  it('translates a raw RLS violation into plain language', () => {
    const error = { message: 'new row violates row-level security policy for table "expenses"' }
    expect(friendlyError(error)).toBe("You don't have permission to do that.")
  })

  it('translates a foreign key violation', () => {
    const error = { message: 'update or delete on table "groups" violates foreign key constraint "expenses_group_id_fkey"' }
    expect(friendlyError(error)).toMatch(/something it depends on may have just changed/)
  })

  it('translates a network failure', () => {
    expect(friendlyError({ message: 'Failed to fetch' })).toMatch(/Couldn't reach the server/)
  })

  it('passes through an already-readable message unchanged', () => {
    expect(friendlyError({ message: "That invite code doesn't match any group." })).toBe(
      "That invite code doesn't match any group."
    )
  })

  it('falls back to the default when there is no message', () => {
    expect(friendlyError({})).toBe('Something went wrong — please try again.')
    expect(friendlyError(null)).toBe('Something went wrong — please try again.')
  })

  it('accepts a custom fallback', () => {
    expect(friendlyError(null, 'Could not save.')).toBe('Could not save.')
  })
})
