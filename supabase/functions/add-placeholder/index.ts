// add-placeholder — add someone to a trip who has not joined yet.
//
// A placeholder is a real but passwordless account (flagged profiles.is_placeholder),
// so the trip's expenses, splits and balances need no special handling. This function
// creates that account with the admin API and then calls register_placeholder() (migration
// 063), which checks the caller is in the trip, the trip is open and the limits, flags the
// account and adds it to the trip. If anything after account creation fails, the account
// is deleted again so no stray accounts are left behind.
//
// The placeholder cannot sign in (banned, unusable address on a reserved domain). When
// the real person accepts an invite made for the placeholder, claim_placeholder() moves
// everything over and deletes it.
//
// Any signed-in trip member can call this.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not authenticated' }, 401)
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return json({ error: 'Your account is suspended. Contact the administrator.' }, 403)
    }

    const body = await req.json().catch(() => null)
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!UUID.test(groupId)) return json({ error: 'groupId is required.' }, 400)
    if (!name || name.length > 40) return json({ error: 'Give the person a name (up to 40 characters).' }, 400)

    const admin = createClient(supabaseUrl, serviceRoleKey)

    // Cheap check before creating anything, so a non-member never causes an account to be made.
    const { data: membership } = await admin.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', user.id).maybeSingle()
    if (!membership) return json({ error: 'You are not in that trip.' }, 403)

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `not-joined-${randomHex(8)}@placeholder.invalid`,
      email_confirm: true,
      ban_duration: '876000h',
      user_metadata: { display_name: name, is_placeholder: true },
    })
    if (createError || !created?.user) return json({ error: 'Could not add that person. Please try again.' }, 500)
    const newId = created.user.id

    const { data, error } = await admin.rpc('register_placeholder', { p_user: newId, p_group: groupId, p_name: name, p_actor: user.id })
    if (error) {
      await admin.auth.admin.deleteUser(newId)
      const code = (error as { code?: string }).code
      const status = code === '42501' ? 403 : code === '54000' ? 429 : code === '22023' ? 400 : 500
      return json({ error: status === 500 ? 'Could not add that person. Please try again.' : error.message }, status)
    }
    return json(data)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
