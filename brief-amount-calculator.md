# Brief for Claude Code — Calculator in the amount field

**Goal:** let people type arithmetic ("12.50+8+3.20") into the amount field and get a result, instead of switching apps.
Trip entry is arithmetic: shared items, tax, tip. **Effort:** medium — the work is mobile UX, not the math.
**Priority:** quick win (independent of the growth stack).

## Verified starting point
- `AddExpenseForm.jsx` amount input: `inputMode="decimal"`, value in `amount` state, `parsedAmount = parseFloat(amount) || 0`.
- **Latent bug to fix on the way:** `parseFloat('12.5+8')` silently returns `12.5` — extra input is dropped with no warning.
  (Likewise `parseFloat('12,50')` returns `12`. Flag only; don't guess locale rules in this change.)
- **iOS catch:** the decimal keypad has no `+ − × ÷` keys. A calculator needs its own operator buttons or a text keyboard.
- Existing bounds: `MAX_AMOUNT` / `isAmountTooLarge` in `src/lib/amountBounds.js`.

## Spec
1. **Pure parser** `src/lib/evalAmount.js` → `evaluateAmount(input)` returning `{ ok: true, value }` or `{ ok: false }`.
   - Hand-written tokenizer + precedence parser. **No `eval`, no `Function`.**
   - Support: digits with `.` decimals, `+ - * /` plus `× ÷`, parentheses, unary minus, whitespace.
   - Reject: letters, exponent notation (`1e3`), empty/trailing operators, division by zero, absurdly long input.
   - Plain numbers must behave exactly as today (no regression for the 99% case).
2. **UI (recommended):** a compact operator row *directly under the field* (`+ − × ÷ ( )` and backspace), always visible while the field
   is focused. Avoid keyboard-overlay positioning tricks on iOS. Buttons insert at the caret and have `aria-label`s.
3. **Live preview:** when the text contains an operator, show `= 24.70` beneath the field (`aria-live="polite"`). On blur, replace the
   field with the result rounded to the currency's minor units (2 decimals; 0 for JPY and similar).
4. **Invalid expression:** show "Check the calculation" and block Save. This also replaces today's silent truncation.
5. Result must be > 0 and pass `isAmountTooLarge`. Itemized mode keeps its own total.
6. **Scope:** main Amount field first. Second pass, same helper: item amounts, tax, and tip fields.
7. Update the `adding-expense` section in `helpContent.jsx` (one short paragraph + example).

## Tests
- Unit tests for `evaluateAmount`: precedence (`2+3*4`), parentheses, `0.1+0.2` rounds to `0.30`, unary minus, `×`/`÷` symbols,
  whitespace, `1/0`, `12.5+`, `abc`, `1e3`, very long input, and plain numbers.
- Editing an existing expense still round-trips (the seeded amount is a plain number).
- TESTING.md cases: iPhone Safari, Android Chrome, JPY, offline add, itemized mode unaffected.

## Out of scope
Locale-aware decimal commas, voice entry, a full calculator keypad overlay.
