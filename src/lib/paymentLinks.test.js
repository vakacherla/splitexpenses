import { describe, it, expect } from 'vitest'
import { buildPaymentLink } from './paymentLinks'

describe('buildPaymentLink', () => {
  it('UPI link includes pn (payee name) per spec — BHIM and other strict apps reject it without one', () => {
    const link = buildPaymentLink('upi', 'ram@icici', 100, 'INR', 'Dinner', 'Ram Vakacherla')
    const params = new URL(link).searchParams
    expect(params.get('pa')).toBe('ram@icici')
    expect(params.get('pn')).toBe('Ram Vakacherla')
    expect(params.get('am')).toBe('100.00')
    expect(params.get('cu')).toBe('INR')
    expect(params.get('tn')).toBe('Dinner')
  })

  it('UPI link falls back to the handle for pn when no display name is given', () => {
    const link = buildPaymentLink('upi', 'ram@icici', 50, 'INR', null, undefined)
    const params = new URL(link).searchParams
    expect(params.get('pn')).toBe('ram@icici')
  })

  it('returns null without a provider or handle', () => {
    expect(buildPaymentLink(null, 'ram@icici', 50, 'INR')).toBeNull()
    expect(buildPaymentLink('upi', '', 50, 'INR')).toBeNull()
  })
})
