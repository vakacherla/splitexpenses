// Arithmetic in the amount field (REQ-EXP-13): "12.50+8+3.20" becomes 23.70.
//
// A hand-written tokenizer and precedence parser. It never uses eval or Function:
// the only characters it understands are digits, ".", + - * / (and × ÷ −),
// parentheses and spaces, so nothing typed into the field can run as code.
//
//   expression := term (("+" | "-") term)*
//   term       := factor (("*" | "/") factor)*
//   factor     := ("+" | "-") factor | number | "(" expression ")"
//
// Rejected: letters (so no 1e3), empty input, a dangling operator, unbalanced
// parentheses, division by zero, a result that is not a finite number, and input
// longer than MAX_LENGTH.

export const MAX_LENGTH = 100

const SYMBOLS = { '×': '*', '÷': '/', '−': '-', '–': '-', '—': '-' }

function tokenize(input) {
  const tokens = []
  let i = 0
  while (i < input.length) {
    const ch = SYMBOLS[input[i]] ?? input[i]
    if (ch === ' ' || ch === '\t' || ch === ' ') {
      i += 1
    } else if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i
      let dots = 0
      while (j < input.length && ((input[j] >= '0' && input[j] <= '9') || input[j] === '.')) {
        if (input[j] === '.') dots += 1
        j += 1
      }
      const text = input.slice(i, j)
      if (dots > 1 || text === '.') return null
      tokens.push({ type: 'num', value: Number(text) })
      i = j
    } else if ('+-*/'.includes(ch)) {
      tokens.push({ type: 'op', value: ch })
      i += 1
    } else if (ch === '(' || ch === ')') {
      tokens.push({ type: ch })
      i += 1
    } else {
      return null // a letter, a comma, anything else: not arithmetic
    }
  }
  return tokens
}

// Returns { ok: true, value } or { ok: false }. `value` is rounded to `decimals`
// places (default 2) so 0.1 + 0.2 is 0.3, not 0.30000000000000004.
export function evaluateAmount(input, decimals = 2) {
  const text = String(input ?? '')
  if (text.trim() === '' || text.length > MAX_LENGTH) return { ok: false }
  const tokens = tokenize(text)
  if (!tokens || tokens.length === 0) return { ok: false }

  let pos = 0
  const peek = () => tokens[pos]
  const FAIL = Symbol('fail')

  function factor() {
    const t = peek()
    if (!t) return FAIL
    if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
      pos += 1
      const inner = factor()
      return inner === FAIL ? FAIL : t.value === '-' ? -inner : inner
    }
    if (t.type === 'num') {
      pos += 1
      return t.value
    }
    if (t.type === '(') {
      pos += 1
      const inner = expression()
      if (inner === FAIL || !peek() || peek().type !== ')') return FAIL
      pos += 1
      return inner
    }
    return FAIL
  }

  function term() {
    let left = factor()
    if (left === FAIL) return FAIL
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = peek().value
      pos += 1
      const right = factor()
      if (right === FAIL) return FAIL
      if (op === '/') {
        if (right === 0) return FAIL
        left /= right
      } else {
        left *= right
      }
    }
    return left
  }

  function expression() {
    let left = term()
    if (left === FAIL) return FAIL
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = peek().value
      pos += 1
      const right = term()
      if (right === FAIL) return FAIL
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  const result = expression()
  if (result === FAIL || pos !== tokens.length || !Number.isFinite(result)) return { ok: false }
  const factorOf10 = 10 ** Math.max(0, Math.min(8, decimals))
  // toPrecision(12) strips float noise first, so 1.005 rounds to 1.01 and 0.1+0.2 to 0.3.
  const rounded = Math.round(Number((result * factorOf10).toPrecision(12))) / factorOf10
  return { ok: true, value: rounded === 0 ? 0 : rounded }
}

// A plain number as people type it today: digits with an optional decimal point
// and nothing else ("12", "12.5", "12.", ".5"). These keep behaving exactly as
// before (parseFloat), not rounded, so ordinary entry cannot change.
const PLAIN = /^\s*(\d+\.?\d*|\.\d+)\s*$/

// What the amount field currently holds:
//   kind 'empty'    nothing typed
//   kind 'plain'    an ordinary number (value = parseFloat, as before)
//   kind 'calc'     an expression that works out (value = its result)
//   kind 'invalid'  text that is neither (blocks Save: "Check the calculation")
export function resolveAmount(input, decimals = 2) {
  const text = String(input ?? '')
  if (text.trim() === '') return { kind: 'empty', value: 0 }
  if (PLAIN.test(text)) return { kind: 'plain', value: parseFloat(text) || 0 }
  const r = evaluateAmount(text, decimals)
  return r.ok ? { kind: 'calc', value: r.value } : { kind: 'invalid', value: 0 }
}

// How many decimal places a currency uses (2 for USD, 0 for JPY, 3 for KWD).
export function currencyDecimals(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  } catch {
    return 2
  }
}

// The text to put back in the field once an expression is settled.
export function formatResult(value, decimals) {
  return Number(value).toFixed(Math.max(0, decimals))
}
