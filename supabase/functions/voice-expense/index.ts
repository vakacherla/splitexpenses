// voice-expense — speech (or text) in, a structured reading of the expense(s) out.
//
// The mobile app records the person's voice and sends it here, so the Gemini
// and OpenAI keys never leave the server. Two steps:
//   1. Audio -> words (Gemini): the words exactly as spoken, an English
//      translation and the language. Skipped when the caller sends text.
//   2. Words -> expenses (OpenAI, strict JSON schema): amount, payer, who shares,
//      date, doubtful names. One entry per separate payment in the sentence.
//
// This function only READS the sentence. It never saves anything and it is
// never trusted: the app re-checks every id, amount and date it returns
// (normalizeLLMOutput in the app) and the person reviews before saving.
//
// Prompt, schema and instructions below are copied from the app's llmParse.ts
// and geminiSpeech.ts, which are covered by the golden test sets. The app's
// tests/voiceFunction.test.mjs fails if they drift apart.
//
// Secrets (staging): GEMINI_API_KEY, OPENAI_API_KEY. Same per-user daily cap
// mechanism as the typed-sentence parser (consume_ai_quota, migration 048).
// Audio is never stored or logged.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const DAILY_LIMIT = 60
const MAX_AUDIO_B64_CHARS = 8_000_000 // ~6 MB of audio, about 3 minutes of speech
const MAX_TEXT_CHARS = 1000
const MAX_MEMBERS = 60
const MAX_EXPENSES = 5
const OPENAI_MODEL = 'gpt-4o'
const GEMINI_MODEL = Deno.env.get('GEMINI_SPEECH_MODEL') ?? 'gemini-3.1-flash-lite'

const CURRENCIES = ['INR', 'USD', 'EUR'];

const EXPENSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'description',
    'amount',
    'currency',
    'payerId',
    'participantIds',
    'weights',
    'dateISO',
    'unknownNames',
    'assumedNames',
    'confident',
    'assumptions',
  ],
  properties: {
    description: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string', enum: CURRENCIES },
    payerId: { type: 'string' },
    participantIds: { type: 'array', items: { type: 'string' } },
    weights: {
      anyOf: [
        { type: 'null' },
        {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['memberId', 'weight'],
            properties: { memberId: { type: 'string' }, weight: { type: 'number' } },
          },
        },
      ],
    },
    dateISO: { type: 'string' },
    unknownNames: { type: 'array', items: { type: 'string' } },
    assumedNames: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heard', 'memberId'],
        properties: { heard: { type: 'string' }, memberId: { type: 'string' } },
      },
    },
    confident: { type: 'boolean' },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
};

const SCHEMA = {
  name: 'expenses',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['expenses'],
    properties: { expenses: { type: 'array', items: EXPENSE_SCHEMA } },
  },
};

const SYSTEM_PROMPT = `You turn a spoken expense into structured data for a trip expense-splitting app.
The text comes from speech recognition (often translated from Hindi, Telugu, Spanish or a mix), so expect mishearings, odd word order and number words.

Rules:
- The speaker is the member whose id is given as "me". "I", "me", "my", "we", "us" refer to the speaker. The speaker pays unless someone else is clearly named as the payer ("Anita paid", "Anita ne pay kiya", or trailing like "Dinner 90 euros Priya paid" → payer is Priya).
- participantIds: everyone who shares the cost. ALWAYS include the payer. "everyone", "all of us", "hum sab", or no mention of anyone means all members. "except X" means all but X. "just/only A and B" means exactly them (plus the payer).
- A possessive name is part of what was bought, NOT a participant: in "Rohan's farewell dinner 500 with Priya" the people are the speaker and Priya only, and the description is "Farewell dinner". People introduced with "with", "between", "and", "split" etc. share the cost.
- DEFAULT: if no person is named as sharing the cost (e.g. "dinner €40", "Priya paid 90 euros for dinner", "two thousand for dinner"), participantIds is ALL members — never just the payer. If the speech never says who shares ("spent 500 on groceries"), participantIds is ALL members.
- Use ONLY the member ids provided. Names may be misheard: map a spoken name to the member whose name SOUNDS closest (e.g. "Shauren" → "Shaurin"). If a name clearly matches no member, do NOT invent one: put the spoken name in unknownNames and leave it out of participantIds.
- amount: the number in major units (rupees/dollars/euros), no currency symbol. Keep decimals exactly ("1,250.50" → 1250.5). Understand number words in any language ("noota yabhai" = 150, "ek hazaar" = 1000). If no amount was said, use 0.
- currency: INR unless the speech or the original-language words clearly indicate USD ($, dollars, dólares) or EUR (€, euros). The translation sometimes drops "$"; check the original words when given.
- description: a short Title-case noun phrase for WHAT was bought ("Dinner", "Auto-rickshaw", "Movie tickets"). Keep meaningful qualifiers ("Farewell dinner", "Airport taxi"). No people's names, no amounts, no verbs like "spent/paid".
- dateISO: YYYY-MM-DD. Today and yesterday are given — use the "yesterday" value for "yesterday", "last night" and "yesterday's X". Otherwise today.
- weights: only for an explicitly uneven split ("Rohan owes half" → payer 1, Rohan 1; "Priya two shares"). Otherwise null.
- assumedNames: every spoken name you matched to a member WITHOUT it being spelled the same — a sound-alike guess (heard "Shauren", matched Shaurin; heard "Shoran", matched Rohan). Give the heard word and the member id. Exact matches, and matches given in "learned mishearings", are NOT listed. Only list a match when the names differ by about one letter. Different people often have similar names (Rohan / Rohini / Rohit, Priya / Pria): if a name is not nearly identical to a member's, it is NOT a mishearing — put it in unknownNames and leave it out of participantIds.
- confident: true only if amount, payer and people are all clear and nothing was guessed. False if amount is 0, a name was unknown or doubtful, or you had to guess.
- Separate payments: if the speech describes more than one distinct payment — different amounts, each with its own payer or item ("I paid 200 for tickets, Bhavani paid 300 for snacks") — return one entry per payment in spoken order. Never merge them and never drop one. Each payment needs its OWN spoken amount: "Priya and Anita owe me" or "split it" say who shares, they are NOT extra payments. One amount spoken means exactly one entry. When the sentence gives a single split instruction ("split with Rohan", "between us", "all of us"), apply it to EVERY payment in the sentence unless a payment states its own different split. Example: "I paid 500 for the taxi and 1200 for dinner, split with Rohan" → two entries (taxi 500, dinner 1200), BOTH paid by the speaker and BOTH shared by exactly the speaker and Rohan. A single payment is the norm: return exactly one entry.
- If "original words before translation" is given, check it for people's names that the English transcript left out (translation can drop a name). Treat any such name like a spoken name: match it to a member, or put it in unknownNames. Never ignore a person who was spoken.
- assumptions: brief notes the user should see, e.g. "No payer named — assumed you paid." Empty when nothing was assumed.`;

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    original: { type: 'STRING' },
    english: { type: 'STRING' },
    language: { type: 'STRING' },
  },
  required: ['original', 'english', 'language'],
};

function speechInstructions(memberNames: string[]): string {
  const names =
    memberNames.length > 0
      ? `People in this group: ${memberNames.join(', ')}. When one of these names is spoken, spell it exactly like this.`
      : '';
  return [
    'This is a short voice note from someone recording a shared expense (what they paid for, how much, who it was split with). The speaker may use Telugu, Hindi, Tamil, Spanish, English or a mix of languages.',
    'Return JSON with:',
    '- original: the speech transcribed exactly as spoken, in the original language and its own script. Keep English words in English.',
    '- english: a faithful natural English translation. Keep every number, amount and currency exactly as spoken ("375 dollars" stays 375 dollars, rupees stay rupees). Keep personal names as names, never translate them. Never drop anyone who is mentioned: list EVERY person named, even one that is not in the group, and remember the speaker counts as "I" (in Telugu "nenu" means I; "A, nenu, B vellam" means "A, B and I went").',
    '- language: the main language as a short code such as "te", "hi", "ta", "es", "en".',
    names,
    'If there is no clear speech, return empty strings. Never invent words that were not said.',
  ]
    .filter(Boolean)
    .join('\n');
}


type Member = { id: string; name: string }

function isoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    return await run(c.signal)
  } finally {
    clearTimeout(t)
  }
}

async function geminiOnce(audioB64: string, mimeType: string, key: string, memberNames: string[]) {
  const res = await withTimeout(30000, (signal) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: speechInstructions(memberNames) }, { inline_data: { mime_type: mimeType, data: audioB64 } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
      }),
      signal,
    })
  )
  if (!res.ok) throw new Error(`speech HTTP ${res.status}`)
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  let obj: { original?: unknown; english?: unknown; language?: unknown }
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('speech unreadable')
  }
  const original = typeof obj.original === 'string' ? obj.original.trim() : ''
  const english = typeof obj.english === 'string' ? obj.english.trim() : ''
  const language = typeof obj.language === 'string' && obj.language.trim() ? obj.language.trim().toLowerCase().split(/[-_]/)[0] : 'en'
  return { original, english, language }
}

async function transcribe(audioB64: string, mimeType: string, key: string, memberNames: string[]) {
  const delays = [1000, 2000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await geminiOnce(audioB64, mimeType, key, memberNames)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      const busy = /HTTP (429|500|502|503)/.test(msg)
      if (!busy || attempt >= delays.length) throw e
      await sleep(delays[attempt])
    }
  }
}

function userMessage(transcript: string, original: string | undefined, members: Member[], meId: string, today: string, aliases: Record<string, string>) {
  const lines = [
    `today: ${today}`,
    `yesterday: ${shiftISO(today, -1)}`,
    `me (the speaker): ${meId}`,
    `members: ${JSON.stringify(members.map((m) => ({ id: m.id, name: m.name })))}`,
  ]
  if (Object.keys(aliases).length > 0) lines.push(`learned mishearings (heard word → member id): ${JSON.stringify(aliases)}`)
  lines.push(`transcript: ${transcript}`)
  if (original && original.trim() !== transcript.trim()) lines.push(`original words before translation: ${original}`)
  return lines.join('\n')
}

async function parseOnce(message: string, key: string) {
  const res = await withTimeout(20000, (signal) =>
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: SCHEMA },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
      }),
      signal,
    })
  )
  if (!res.ok) throw new Error(`parse HTTP ${res.status}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('parse empty')
  const parsed = JSON.parse(content) as { expenses?: unknown }
  if (!Array.isArray(parsed.expenses) || parsed.expenses.length === 0) throw new Error('parse no expenses')
  return parsed.expenses.slice(0, MAX_EXPENSES)
}

async function parseExpenses(message: string, key: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await parseOnce(message, key)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (attempt >= 1 || !/HTTP (429|500|502|503)/.test(msg)) throw e
      await sleep(1500)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return json({ error: 'Voice entry is not set up on this server yet (missing OPENAI_API_KEY).' }, 500)

    const callerClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not authenticated' }, 401)
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return json({ error: 'Your account is suspended. Contact the administrator.' }, 403)
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'Send a JSON body.' }, 400)
    const { audioBase64, mimeType, transcript, originalTranscript, members, meId, today, nameAliases } = body as Record<string, unknown>

    if (!Array.isArray(members) || members.length === 0 || members.length > MAX_MEMBERS) return json({ error: 'members is required.' }, 400)
    const memberList: Member[] = []
    for (const m of members as { id?: unknown; name?: unknown }[]) {
      if (typeof m?.id !== 'string' || typeof m?.name !== 'string') return json({ error: 'Each member needs an id and a name.' }, 400)
      memberList.push({ id: m.id, name: m.name.slice(0, 80) })
    }
    if (typeof meId !== 'string' || !memberList.some((m) => m.id === meId)) return json({ error: 'meId must be one of the members.' }, 400)
    if (!isoDate(today)) return json({ error: 'today must be YYYY-MM-DD.' }, 400)

    const hasAudio = typeof audioBase64 === 'string' && audioBase64.length > 0
    const hasText = typeof transcript === 'string' && transcript.trim().length > 0
    if (!hasAudio && !hasText) return json({ error: 'Send audioBase64 or transcript.' }, 400)
    if (hasAudio && (audioBase64 as string).length > MAX_AUDIO_B64_CHARS) return json({ error: 'That recording is too long. Keep it under a couple of minutes.' }, 413)
    if (hasText && (transcript as string).length > MAX_TEXT_CHARS) return json({ error: 'That is too long. Keep it to a sentence or two.' }, 413)
    if (hasAudio && !geminiKey) return json({ error: 'Voice entry is not set up on this server yet (missing GEMINI_API_KEY).' }, 500)

    const aliases: Record<string, string> = {}
    if (nameAliases && typeof nameAliases === 'object') {
      for (const [k, v] of Object.entries(nameAliases as Record<string, unknown>)) {
        if (typeof v === 'string' && memberList.some((m) => m.id === v)) aliases[String(k).slice(0, 40)] = v
      }
    }

    // Daily per-user cap, counted before any paid call (migration 048).
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: withinLimit, error: quotaError } = await adminClient.rpc('consume_ai_quota', { p_user: user.id, p_feature: 'voice', p_limit: DAILY_LIMIT })
    if (quotaError) return json({ error: 'Could not check your daily limit. Please try again.' }, 500)
    if (!withinLimit) return json({ error: `You've reached today's limit of ${DAILY_LIMIT} voice entries. It resets tomorrow (UTC). You can still type the expense.` }, 429)

    let words = hasText ? (transcript as string).trim() : ''
    let original = hasText && typeof originalTranscript === 'string' ? originalTranscript.trim() : ''
    let language: string | undefined

    if (hasAudio) {
      try {
        const t = await transcribe(audioBase64 as string, typeof mimeType === 'string' && mimeType ? mimeType : 'audio/mp4', geminiKey as string, memberList.map((m) => m.name))
        if (!t.original && !t.english) return json({ error: "Couldn't hear anything. Try speaking closer to the mic.", code: 'no_speech' }, 422)
        words = t.english || t.original
        language = t.language
        original = t.language !== 'en' && t.original && t.original !== words ? t.original : ''
      } catch {
        return json({ error: 'Could not turn the recording into words. Please try again.' }, 502)
      }
    }

    try {
      const expenses = await parseExpenses(userMessage(words, original || undefined, memberList, meId, today as string, aliases), openaiKey)
      return json({ transcript: words, originalTranscript: original || undefined, language, expenses, source: 'gemini+gpt-4o' })
    } catch {
      // Words were heard but could not be read as an expense: give them back so the app can still show them.
      return json({ error: "Couldn't understand that. Try again, or type the expense." }, 502)
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
