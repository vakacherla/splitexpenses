// Lets a signed-in group member send an on-demand "hey, you owe me"
// nudge to whoever the Balances tab's debt-simplification already says
// they're owed money by — mirroring Splitwise's per-transaction "Remind"
// button. Sends by whichever of email/push is actually configured (see
// _shared/notify.ts); neither is required for the rest of the app to
// work.
//
// The amount is never trusted from the client — it's recomputed here
// from the group's actual expenses/settlements, the same way the
// Balances tab itself does, so a stale or tampered client value can't
// misstate what's owed.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { computeNetBalances, simplifyDebts, sendReminderEmail, sendPush } from '../_shared/notify.ts'

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Scoped to the caller's own JWT, so every query below is naturally
    // limited by RLS to groups/expenses the caller can actually see —
    // this is what stops someone nudging a debt in a group they're not
    // even a member of.
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Not authenticated' }, 401)

    const { groupId, debtorUserId } = await req.json()
    if (!groupId || !debtorUserId) return json({ error: 'groupId and debtorUserId are required' }, 400)
    if (debtorUserId === user.id) return json({ error: "You can't remind yourself." }, 400)

    const [{ data: group, error: groupError }, { data: members, error: membersError }] = await Promise.all([
      callerClient.from('groups').select('id, name, home_currency').eq('id', groupId).single(),
      callerClient.from('group_members').select('user_id').eq('group_id', groupId),
    ])
    if (groupError || !group) return json({ error: 'Group not found, or you’re not a member.' }, 404)
    if (membersError) return json({ error: membersError.message }, 500)

    const [{ data: expenses, error: expensesError }, { data: settlements, error: settlementsError }] =
      await Promise.all([
        callerClient
          .from('expenses')
          .select('paid_by, amount_in_home, expense_splits(user_id, share_in_home)')
          .eq('group_id', groupId)
          .is('deleted_at', null),
        callerClient.from('settlements').select('from_user, to_user, amount_in_home').eq('group_id', groupId),
      ])
    if (expensesError) return json({ error: expensesError.message }, 500)
    if (settlementsError) return json({ error: settlementsError.message }, 500)

    const net = computeNetBalances(
      (members ?? []).map((m) => m.user_id),
      expenses ?? [],
      settlements ?? []
    )
    const transactions = simplifyDebts(net)
    const match = transactions.find((t) => t.from === debtorUserId && t.to === user.id)
    if (!match) {
      return json(
        { error: "That doesn't match what's currently owed — balances may have just changed. Refresh and try again." },
        409
      )
    }

    // Service-role client: reading the debtor's email/push subscriptions
    // (not the caller's own) needs to bypass their own-rows-only RLS.
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    const [{ data: debtorProfile }, { data: creditorProfile }] = await Promise.all([
      serviceClient.from('profiles').select('email, display_name').eq('id', debtorUserId).single(),
      serviceClient.from('profiles').select('display_name').eq('id', user.id).single(),
    ])

    const amountText = `${match.amount.toFixed(2)} ${group.home_currency}`
    const creditorName = creditorProfile?.display_name ?? 'Someone in the group'
    const subject = `${creditorName} sent you a reminder — ${group.name}`
    const text = `${creditorName} reminded you: you owe ${amountText} in "${group.name}".`

    const results: Record<string, unknown> = {}
    if (debtorProfile?.email) {
      try {
        results.email = await sendReminderEmail(debtorProfile.email, subject, text)
      } catch (err) {
        results.email = { error: err instanceof Error ? err.message : 'failed' }
      }
    }
    try {
      results.push = await sendPush(serviceClient, debtorUserId, { title: subject, body: text })
    } catch (err) {
      results.push = { error: err instanceof Error ? err.message : 'failed' }
    }

    return json({ ok: true, amount: match.amount, currency: group.home_currency, ...results })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
