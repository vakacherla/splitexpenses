import { describe, expect, it } from 'vitest'
import { currencyDecimals, evaluateAmount, formatResult, MAX_LENGTH, resolveAmount } from './evalAmount'

const ok = (input, decimals) => {
  const r = evaluateAmount(input, decimals)
  expect(r.ok).toBe(true)
  return r.value
}
const bad = (input) => expect(evaluateAmount(input)).toEqual({ ok: false })

describe('evaluateAmount', () => {
  it('adds, subtracts, multiplies and divides', () => {
    expect(ok('12.50+8+3.20')).toBe(23.7)
    expect(ok('10-4')).toBe(6)
    expect(ok('6*7')).toBe(42)
    expect(ok('9/4')).toBe(2.25)
  })

  it('follows precedence', () => {
    expect(ok('2+3*4')).toBe(14)
    expect(ok('10-6/2')).toBe(7)
    expect(ok('2*3+4*5')).toBe(26)
  })

  it('supports parentheses, including nested ones', () => {
    expect(ok('(2+3)*4')).toBe(20)
    expect(ok('2*(3+(4-1))')).toBe(12)
    expect(ok('((5))')).toBe(5)
  })

  it('supports unary minus and plus', () => {
    expect(ok('-5+8')).toBe(3)
    expect(ok('8+-5')).toBe(3)
    expect(ok('--5')).toBe(5)
    expect(ok('+5')).toBe(5)
    expect(ok('3*-2')).toBe(-6)
  })

  it('accepts × ÷ and the minus sign as well as * / -', () => {
    expect(ok('6×7')).toBe(42)
    expect(ok('9÷4')).toBe(2.25)
    expect(ok('10−4')).toBe(6)
  })

  it('ignores whitespace', () => {
    expect(ok('  12.5 +  8 ')).toBe(20.5)
    expect(ok('1 + 2')).toBe(3)
  })

  it('rounds away float noise: 0.1+0.2 is 0.30', () => {
    expect(ok('0.1+0.2')).toBe(0.3)
    expect(formatResult(ok('0.1+0.2'), 2)).toBe('0.30')
    expect(ok('1.005')).toBe(1.01)
    expect(ok('10/3')).toBe(3.33)
  })

  it('rounds to the currency decimals it is given', () => {
    expect(ok('100/3', 0)).toBe(33)
    expect(ok('10/3', 3)).toBe(3.333)
  })

  it('accepts a trailing or leading decimal point', () => {
    expect(ok('12.+1')).toBe(13)
    expect(ok('.5+.25')).toBe(0.75)
  })

  it('rejects division by zero', () => {
    bad('1/0')
    bad('5/(3-3)')
    bad('0/0')
  })

  it('rejects dangling or doubled operators and empty parentheses', () => {
    bad('12.5+')
    bad('*5')
    bad('5*')
    bad('5**2')
    bad('()')
    bad('(5')
    bad('5)')
    bad('(')
    bad('1 2')
  })

  it('rejects letters, exponent notation and other characters', () => {
    bad('abc')
    bad('1e3')
    bad('5e')
    bad('12,50')
    bad('$5')
    bad('5%')
    bad('alert(1)')
    bad('Math.PI')
    bad('5^2')
    bad('0x10')
  })

  it('rejects empty and over-long input', () => {
    bad('')
    bad('   ')
    bad(null)
    bad(undefined)
    bad('1+'.repeat(MAX_LENGTH))
    bad('9'.repeat(MAX_LENGTH + 1))
  })

  it('rejects numbers with two decimal points', () => {
    bad('1.2.3')
    bad('.')
  })

  it('never runs code: nothing typed can reach eval or Function', () => {
    globalThis.__pwned = false
    bad('globalThis.__pwned=true')
    bad('(()=>{globalThis.__pwned=true})()')
    expect(globalThis.__pwned).toBe(false)
    delete globalThis.__pwned
  })
})

describe('resolveAmount', () => {
  it('leaves plain numbers exactly as before (parseFloat, not rounded)', () => {
    expect(resolveAmount('12')).toEqual({ kind: 'plain', value: 12 })
    expect(resolveAmount('12.5')).toEqual({ kind: 'plain', value: 12.5 })
    expect(resolveAmount('12.345')).toEqual({ kind: 'plain', value: 12.345 })
    expect(resolveAmount('12.')).toEqual({ kind: 'plain', value: 12 })
    expect(resolveAmount('.5')).toEqual({ kind: 'plain', value: 0.5 })
    expect(resolveAmount(' 7 ')).toEqual({ kind: 'plain', value: 7 })
    expect(resolveAmount('0')).toEqual({ kind: 'plain', value: 0 })
  })

  it('reports empty input as empty', () => {
    expect(resolveAmount('')).toEqual({ kind: 'empty', value: 0 })
    expect(resolveAmount('   ')).toEqual({ kind: 'empty', value: 0 })
    expect(resolveAmount(undefined)).toEqual({ kind: 'empty', value: 0 })
  })

  it('works out an expression', () => {
    expect(resolveAmount('12.50+8+3.20')).toEqual({ kind: 'calc', value: 23.7 })
    expect(resolveAmount('(2+3)×4')).toEqual({ kind: 'calc', value: 20 })
    expect(resolveAmount('100/3', 0)).toEqual({ kind: 'calc', value: 33 })
  })

  it('flags anything else instead of silently truncating it', () => {
    // parseFloat('12.5+8') used to give 12.5 and parseFloat('12,50') gave 12.
    expect(resolveAmount('12.5+').kind).toBe('invalid')
    expect(resolveAmount('12,50').kind).toBe('invalid')
    expect(resolveAmount('12abc').kind).toBe('invalid')
    expect(resolveAmount('1/0').kind).toBe('invalid')
    expect(resolveAmount('-5').kind).toBe('calc') // a calculation, so the existing "greater than zero" rule reports it
    expect(resolveAmount('-5').value).toBe(-5)
  })
})

describe('currencyDecimals and formatResult', () => {
  it('knows how many decimals a currency uses', () => {
    expect(currencyDecimals('USD')).toBe(2)
    expect(currencyDecimals('EUR')).toBe(2)
    expect(currencyDecimals('INR')).toBe(2)
    expect(currencyDecimals('JPY')).toBe(0)
    expect(currencyDecimals('KRW')).toBe(0)
    expect(currencyDecimals('NOT-A-CURRENCY')).toBe(2)
  })

  it('formats a settled result for the field', () => {
    expect(formatResult(23.7, 2)).toBe('23.70')
    expect(formatResult(33, 0)).toBe('33')
    expect(formatResult(3.333, 3)).toBe('3.333')
  })
})
