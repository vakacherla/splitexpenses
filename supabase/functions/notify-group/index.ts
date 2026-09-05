// Pushes an activity notification (an expense was added, a payment was
// recorded, a CSV import finished) to specific members of a group —
// the general-purpose counterpart to `remind`'s settle-up-specific nudge.
// Reuses the exact same sendPush sender and push_subscriptions table.
//
// Never trusts the client's target list at face value: looks up the
// group's real membership with the service-role client, confirms the
// caller is actually in it, and intersects the requested targets against
// it. Without that check this endpoint would let any signed-in user push
// an arbitrary title/body to an arbitrary user id, which is exactly the
// kind of thing a public Edge Function must not allow.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendPush } from '../_shared/notify.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not authenticated' }, 401)

    const { groupId, targetUserIds, title, body, url } = await req.json()
    if (!groupId || !Array.isArray(targetUserIds) || !title || !body) {
      return json({ error: 'groupId, targetUserIds, title, and body are required' }, 400)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: members, error: membersError } = await serviceClient
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
    if (membersError) return json({ error: membersError.message }, 500)

    const memberIds = new Set((members ?? []).map((m) => m.user_id))
    if (!memberIds.has(user.id)) return json({ error: 'Not a member of this group' }, 403)

    const validTargets = targetUserIds.filter((id: string) => memberIds.has(id))

    let sent = 0
    for (const targetId of validTargets) {
      const result = await sendPush(serviceClient, targetId, { title, body, url })
      sent += result.sent ?? 0
    }

    return json({ targeted: validTargets.length, sent })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
