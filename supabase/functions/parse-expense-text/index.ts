// Reads a typed sentence like "lunch 24.50 split with Anna and Ben" and
// pulls out a description, amount, currency, date, category, payer, and
// split participants — pre-filling the add-expense form rather than
// saving anything itself. A smaller version of what receipt-scan already
// does for a photographed receipt: same two-provider Gemini/Qwen
// fallback, same "omit rather than guess" instruction, same
// review-before-save handoff to the client.
//
// The one thing a receipt never needed: resolving names to actual
// people. Rather than hand-roll fuzzy name matching, the caller's group
// member list is sent in and the response schema constrains payer_id /
// participant_ids to an enum of those real ids — the model can match
// "Anna", a nickname, or "I"/"me" (via the isSelf flag) to the right
// person, but it can never hallucinate an id that doesn't exist in this
// group. Whatever it can't confidently resolve is simply omitted; the
// client already knows how to default those (payer -> the caller,
// participants -> everyone), exactly like a fresh manual add does.
//
// Any signed-in group member can call this — same permission bar as
// receipt-scan (logged in, nothing more).

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const CATEGORIES = [
  'Food',
  'Lodging',
  'Flights',
  'Train',
  'Taxi/Cab',
  'Groceries',
  'Shopping',
  'Activities',
  'Utilities',
  'Misc',
]

type Member = { id: string; name: string; isSelf?: boolean }

function buildSchema(memberIds: string[]) {
  return {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: "Short description of what the expense was for, e.g. 'Lunch', 'Taxi to airport'.",
      },
      amount: { type: 'number', description: 'The total amount, as a plain number.' },
      currency: {
        type: 'string',
        description: 'Three-letter ISO currency code, e.g. USD, INR, EUR — only if explicitly stated or implied by a symbol.',
      },
      date: { type: 'string', description: "The expense's date in YYYY-MM-DD format, resolved from words like 'today' or 'yesterday' using the given current date." },
      category: { type: 'string', enum: CATEGORIES, description: 'Best-fit category from the given list.' },
      payer_id: {
        type: 'string',
        enum: memberIds,
        description: 'The id of whoever paid, matched from the given member list. Use the isSelf member for "I"/"me"/"my".',
      },
      participant_ids: {
        type: 'array',
        description: 'The ids of everyone the cost should be split between, matched from the given member list.',
        items: { type: 'string', enum: memberIds },
      },
    },
  }
}

function buildPrompt(text: string, members: Member[], homeCurrency: string, today: string) {
  return (
    'Parse this expense description into JSON matching the given schema.\n\n' +
    `Sentence: "${text}"\n\n` +
    `Today's date: ${today}\n` +
    `Default currency if none is mentioned: ${homeCurrency}\n` +
    `Group members (match names, nicknames, or "I"/"me" against these):\n${JSON.stringify(members)}\n\n` +
    'If a field genuinely cannot be determined, omit it rather than guessing — ' +
    'especially payer_id and participant_ids: only include a person if the sentence actually refers to them.'
  )
}

function isUsable(result: unknown): result is { amount: number } {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as { amount?: unknown }).amount === 'number' &&
    (result as { amount: number }).amount > 0
  )
}

async function tryGemini(apiKey: string, prompt: string, schema: unknown) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`Gemini error (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no content')
  return JSON.parse(text)
}

async function tryQwen(apiKey: string, prompt: string, schema: unknown) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen/qwen2.5-vl-72b-instruct',
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nJSON schema:\n${JSON.stringify(schema)}\n\nRespond with ONLY the JSON object, no other text.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    throw new Error(`Qwen error (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Qwen returned no content')
  return JSON.parse(text.replace(/^```json\s*|```\s*$/g, '').trim())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!geminiKey && !openrouterKey) {
      return json(
        {
          error:
            'No text provider configured. Run: supabase secrets set GEMINI_API_KEY=your-key (and optionally OPENROUTER_API_KEY=your-key for the Qwen fallback).',
        },
        500
      )
    }

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not authenticated' }, 401)

    const { text, members, homeCurrency, today } = await req.json()
    if (!text || typeof text !== 'string') {
      return json({ error: 'text is required' }, 400)
    }
    if (!Array.isArray(members) || !homeCurrency || !today) {
      return json({ error: 'members, homeCurrency, and today are required' }, 400)
    }

    const memberIds = (members as Member[]).map((m) => m.id)
    const schema = buildSchema(memberIds)
    const prompt = buildPrompt(text, members, homeCurrency, today)

    const attempts: string[] = []

    if (geminiKey) {
      try {
        const result = await tryGemini(geminiKey, prompt, schema)
        if (isUsable(result)) return json({ ...result, _source: 'gemini' })
        attempts.push('gemini: no usable amount found')
      } catch (err) {
        attempts.push(`gemini: ${err instanceof Error ? err.message : 'failed'}`)
      }
    }

    if (openrouterKey) {
      try {
        const result = await tryQwen(openrouterKey, prompt, schema)
        if (isUsable(result)) return json({ ...result, _source: 'qwen' })
        attempts.push('qwen: no usable amount found')
      } catch (err) {
        attempts.push(`qwen: ${err instanceof Error ? err.message : 'failed'}`)
      }
    }

    return json(
      {
        error: `Couldn't parse that — try rewording it, or fill the form in by hand. (${attempts.join('; ')})`,
      },
      502
    )
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
