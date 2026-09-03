// Admin account actions: list every user, suspend/unsuspend, delete an account,
// or promote/demote admin status.
//
// This runs server-side (not in the browser) specifically because these
// actions need the Supabase Admin API, which requires the service-role
// key — a key that must never be shipped to frontend code. The app calls
// this function with the caller's own login token; the function re-checks
// that the caller is actually a platform admin (profiles.is_admin) before
// doing anything, using its own privileged connection — it does not trust
// anything the client claims about itself.
//
// The promote/demote actions specifically require the caller to be a
// SUPER admin, not just any admin — see profiles.is_super_admin and the
// prevent_admin_self_promotion trigger in the schema for the full
// reasoning. Every action here also refuses to let a caller target their
// own account, which is what makes "can the last super admin ever be
// removed" a structurally impossible question rather than a rule someone
// has to remember to follow.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Scoped to the caller's own token, purely to find out who's asking.
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not authenticated' }, 401)

    // Full-privilege client for everything past this point.
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('is_admin, is_super_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !callerProfile?.is_admin) {
      return json({ error: 'Admins only.' }, 403)
    }

    const { action, userId } = await req.json()

    if (action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (error) return json({ error: error.message }, 400)

      const { data: profiles } = await admin.from('profiles').select('id, display_name, is_admin, is_super_admin')
      const byId = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

      const users = data.users.map((u) => ({
        id: u.id,
        email: u.email,
        display_name: byId[u.id]?.display_name ?? null,
        is_admin: byId[u.id]?.is_admin ?? false,
        is_super_admin: byId[u.id]?.is_super_admin ?? false,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until ?? null,
      }))

      return json({ users })
    }

    if (action === 'suspend' || action === 'unsuspend') {
      if (!userId) return json({ error: 'userId is required' }, 400)
      if (userId === user.id) return json({ error: "You can't suspend your own account." }, 400)

      // Supabase Auth's own API names this "ban" (ban_duration /
      // banned_until) — that's their naming, not ours; the app only
      // ever shows the person "suspend" / "suspended".
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: action === 'suspend' ? '876000h' : 'none',
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'delete') {
      if (!userId) return json({ error: 'userId is required' }, 400)
      if (userId === user.id) return json({ error: "You can't delete your own account." }, 400)

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) {
        // A foreign-key violation here means this person paid for or was
        // added to an expense somewhere — deleting them would corrupt
        // someone else's shared ledger, so it's blocked rather than
        // cascaded away silently. Suspend instead, or have them settle up and
        // leave their groups first.
        const message = /foreign key|violates/i.test(error.message)
          ? "Can't delete this account — they have expense or payment history in a group. Suspend them instead, or have them settle up and leave their groups first."
          : error.message
        return json({ error: message }, 400)
      }
      return json({ ok: true })
    }

    if (action === 'promote_admin' || action === 'demote_admin' || action === 'promote_super' || action === 'demote_super') {
      if (!callerProfile.is_super_admin) {
        return json({ error: 'Only a super admin can change admin status.' }, 403)
      }
      if (!userId) return json({ error: 'userId is required' }, 400)
      if (userId === user.id) return json({ error: "You can't change your own admin status." }, 400)

      const updates =
        action === 'promote_admin'
          ? { is_admin: true }
          : action === 'demote_admin'
            ? { is_admin: false, is_super_admin: false } // can't be a super admin without being an admin
            : action === 'promote_super'
              ? { is_admin: true, is_super_admin: true }
              : { is_super_admin: false } // demote_super: stays a regular admin

      const { error } = await admin.from('profiles').update(updates).eq('id', userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
