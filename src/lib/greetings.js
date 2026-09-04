// Dashboard hero greeting — one picked per browser session (sessionStorage,
// not every render) so it doesn't shuffle every time the Dashboard
// re-mounts from navigating away and back, but does feel fresh across
// separate visits. `wm` is the giant faint background character on the
// hero card, chosen to match the greeting's tone rather than always
// showing the currency symbol. Kept to plain pre-emoji Unicode symbols
// (✦ ◎ ⌂ ₹) for the watermark specifically so it renders as a flat
// monochrome glyph, not colorful platform emoji, at that size.
const GREETINGS = [
  { title: 'Good to see you, {name} 👋', sub: 'Where are we off to this time?', wm: '◎' },
  { title: 'Welcome back, {name} 🤗', sub: "Let's see who owes who this time.", wm: '₹' },
  { title: "Hey {name}, adventure's calling 🧳", sub: "Pick a trip and let's get splitting.", wm: '✦' },
  { title: 'Namaste, {name} 🙏', sub: 'Ready for the next journey?', wm: '◎' },
  { title: 'Back for more, {name}? 😄', sub: "Let's settle some scores, shall we?", wm: '₹' },
  { title: 'Long time, no ledger, {name} 🧾', sub: "Let's catch up on who owes what.", wm: '₹' },
  { title: 'Welcome home, {name} 🏡', sub: 'Every trip, every rupee, right here.', wm: '⌂' },
  { title: 'Good to see you, {name} ✨', sub: 'Somewhere out there, a bill needs splitting.', wm: '✦' },
  { title: "{name}'s in the house 💸", sub: "Time to see what everyone's been spending.", wm: '₹' },
]

const SESSION_KEY = 'dashboard_greeting_index_v1'

// Picks the greeting *template* once per session — the `{name}` placeholder
// stays in `title` deliberately, substituted at render time instead of
// here, since `profile` (and so the real first name) usually isn't loaded
// yet on the first render that picks this.
export function pickGreetingTemplate() {
  let index
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored !== null && Number(stored) >= 0 && Number(stored) < GREETINGS.length) {
      index = Number(stored)
    }
  } catch {
    // storage unavailable — fall through to picking fresh, just won't persist
  }
  if (index === undefined) {
    index = Math.floor(Math.random() * GREETINGS.length)
    try {
      sessionStorage.setItem(SESSION_KEY, String(index))
    } catch {
      // storage unavailable (private browsing, quota) — greeting just
      // won't stay stable across a remount this session, harmless
    }
  }
  return GREETINGS[index]
}
