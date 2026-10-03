import { describe, expect, it } from 'vitest'
import { USAGE_NOTICE, USAGE_SWITCH_HINT, USAGE_SWITCH_LABEL } from './usageNotice'

describe('usage notice', () => {
  it('says what is recorded, what never is, and that nothing is sold or shared', () => {
    expect(USAGE_NOTICE).toMatch(/which features you use/i)
    expect(USAGE_NOTICE).toMatch(/type of device/i)
    expect(USAGE_NOTICE).toMatch(/never record what you spend or who you split with/i)
    expect(USAGE_NOTICE).toMatch(/never sell or share/i)
  })

  it('has a switch label and hint', () => {
    expect(USAGE_SWITCH_LABEL).toBe('Share usage data')
    expect(USAGE_SWITCH_HINT).toMatch(/nothing about how you use the app is recorded/i)
  })
})
