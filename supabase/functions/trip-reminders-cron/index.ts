// Runs once a day (see migration 016's pg_cron schedule) — sweeps every
// non-archived group whose end_date has passed, and if anyone still owes
// money there, sends them a settle-up nudge by whichever of email/push
// is configured. A per-group cooldown (last_reminder_sent_at) keeps this
// from re-firing every single day for the same overdue trip; it's
// updated after every group this sweep looks at, settled or not, so a
// long-since-settled trip doesn't get rescanned forever either.
//
// No specific caller to authenticate — this is a system job, not a user
// action. Supabase's platform-level JWT gate (the anon key pg_cron
// passes) blocks raw unauthenticated internet traffic; everything this
// function actually does runs on its own service-role key, the same
// pattern admin-users uses for genuinely privileged, non-user-scoped
// work.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { computeNetBalances, simplifyDebts, sendReminderEmail, sendPush } from '../_shared/notify.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const COOLDOWN_DAYS = 3

Deno.serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const today = new Date().toISOString().slice(0, 10)

    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, home_currency, end_date')
      .is('archived_at', null)
      .not('end_date', 'is', null)
      .lt('end_date', today)
      .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${cooldownCutoff}`)

    if (groupsError) return json({ error: groupsError.message }, 500)

    let groupsProcessed = 0
    let remindersSent = 0

    for (const group of groups ?? []) {
      groupsProcessed += 1

      const [{ data: members }, { data: expenses }, { data: settlements }] = await Promise.all([
        supabase.from('group_members').select('user_id').eq('group_id', group.id),
        supabase
          .from('expenses')
          .select('paid_by, amount_in_home, expense_splits(user_id, share_in_home)')
          .eq('group_id', group.id)
          .is('deleted_at', null),
        supabase.from('settlements').select('from_user, to_user, amount_in_home').eq('group_id', group.id),
      ])

      const net = computeNetBalances((members ?? []).map((m) => m.user_id), expenses ?? [], settlements ?? [])
      const transactions = simplifyDebts(net)

      for (const t of transactions) {
        const { data: debtorProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', t.from)
          .single()

        const amountText = `${t.amount.toFixed(2)} ${group.home_currency}`
        const subject = `Trip ended — you still owe ${amountText} in "${group.name}"`
        const text = `"${group.name}" ended on ${group.end_date}. You still owe ${amountText} — settle up when you get a chance.`

        if (debtorProfile?.email) {
          try {
            await sendReminderEmail(debtorProfile.email, subject, text)
            remindersSent += 1
          } catch {
            // Best-effort — one failed email shouldn't stop the rest of
            // the sweep or the push attempt below.
          }
        }
        try {
          await sendPush(supabase, t.from, { title: subject, body: text })
        } catch {
          // Same reasoning — push is independent of email.
        }
      }

      await supabase.from('groups').update({ last_reminder_sent_at: new Date().toISOString() }).eq('id', group.id)
    }

    return json({ groupsProcessed, remindersSent })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
