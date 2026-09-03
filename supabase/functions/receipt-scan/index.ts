// Reads a receipt photo and pulls out a description, total amount,
// currency, date, and best-guess category — pre-filling the add-expense
// form rather than saving anything itself.
//
// Two providers, tried in order:
//   1. Gemini 2.5 Flash — free tier, tried first on every scan
//   2. Qwen2.5-VL-72B (via OpenRouter) — only called if Gemini fails
//      outright or comes back with something unusable (no valid amount)
// This is a fallback, not a race: Qwen only gets called — and only costs
// anything — when Gemini didn't already get the job done. Configure
// either or both; the function uses whichever secrets are actually set.
//
// Any signed-in group member can call this — it doesn't touch privileged
// data, so unlike admin-users there's no special-permission check beyond
// "you're logged in" (which also keeps both keys from being hittable by
// anonymous requests).

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

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: "Short description, e.g. the merchant name — 'Trattoria Milano', 'Uber', 'Whole Foods'.",
    },
    amount: { type: 'number', description: 'The total amount charged, as a plain number.' },
    currency: { type: 'string', description: 'Three-letter ISO currency code the receipt is in, e.g. USD, INR, EUR.' },
    date: { type: 'string', description: 'The receipt date in YYYY-MM-DD format.' },
    category: { type: 'string', enum: CATEGORIES, description: 'Best-fit category from the given list.' },
  },
}

const PROMPT =
  'Read this receipt and extract its details as JSON matching the given schema. ' +
  'If a field genuinely cannot be determined, omit it rather than guessing.'

// A result only counts as usable if it has a real total — everything else
// (description, category, date) is a nice-to-have the client already
// tolerates missing. A missing/zero amount is the signal something went
// wrong and it's worth trying the other provider.
function isUsable(result: unknown): result is { amount: number } {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as { amount?: unknown }).amount === 'number' &&
    (result as { amount: number }).amount > 0
  )
}

async function tryGemini(apiKey: string, imageBase64: string, mimeType: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: PROMPT }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RECEIPT_SCHEMA,
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

async function tryQwen(apiKey: string, imageBase64: string, mimeType: string) {
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
          content: [
            { type: 'text', text: `${PROMPT}\n\nRespond with ONLY the JSON object, no other text.` },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    throw new Error(`Qwen error (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Qwen returned no content')
  // Not every provider behind OpenRouter honors response_format strictly —
  // strip a stray ```json fence if the model added one anyway.
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
            'No vision provider configured. Run: supabase secrets set GEMINI_API_KEY=your-key (and optionally OPENROUTER_API_KEY=your-key for the Qwen fallback).',
        },
        500
      )
    }

    // Confirm the caller is actually signed in — not what they claim to
    // be, but that a real session exists.
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not authenticated' }, 401)

    const { imageBase64, mimeType } = await req.json()
    if (!imageBase64 || !mimeType) {
      return json({ error: 'imageBase64 and mimeType are required' }, 400)
    }

    const attempts: string[] = []

    if (geminiKey) {
      try {
        const result = await tryGemini(geminiKey, imageBase64, mimeType)
        if (isUsable(result)) return json({ ...result, _source: 'gemini' })
        attempts.push('gemini: no usable amount found')
      } catch (err) {
        attempts.push(`gemini: ${err instanceof Error ? err.message : 'failed'}`)
      }
    }

    if (openrouterKey) {
      try {
        const result = await tryQwen(openrouterKey, imageBase64, mimeType)
        if (isUsable(result)) return json({ ...result, _source: 'qwen' })
        attempts.push('qwen: no usable amount found')
      } catch (err) {
        attempts.push(`qwen: ${err instanceof Error ? err.message : 'failed'}`)
      }
    }

    return json(
      {
        error: `Couldn't read that receipt — try a clearer photo, or fill it in by hand. (${attempts.join('; ')})`,
      },
      502
    )
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
