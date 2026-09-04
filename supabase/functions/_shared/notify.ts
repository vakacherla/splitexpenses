// Shared by both `remind` (manual, on-demand) and `trip-reminders-cron`
// (scheduled, automatic) — the two places this app sends someone a
// settle-up nudge. Each channel is independently optional: whichever of
// RESEND_API_KEY / the three VAPID_* secrets is actually set gets used;
// a channel that isn't configured is silently skipped rather than
// treated as a failure, same spirit as receipt-scan's two providers.

import webpush from 'npm:web-push@3'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export async function sendReminderEmail(to: string, subject: string, text: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { skipped: true }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') ?? 'Split Expenses <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
    }),
  })
  if (!res.ok) throw new Error(`Resend error (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return { sent: true }
}

// `supabase` must be a service-role client — reading someone else's push
// subscriptions (not the caller's own) only works past that table's
// "own rows only" RLS policy with the service-role key.
export async function sendReminderPush(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string }
) {
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return { skipped: true }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId)

  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
      sent += 1
    } catch (err) {
      // 404/410 = the browser or OS has dropped this subscription
      // (uninstalled, permission revoked) — clean it up rather than
      // retrying it forever.
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
  }
  return { attempted: subs?.length ?? 0, sent }
}

// Mirrors src/lib/balances.js exactly — kept as a small, separate copy
// rather than a shared import, since this runs in Deno and that runs in
// the browser build; duplicating ~25 lines of pure math is simpler than
// wiring up a shared package across two different toolchains for it.
export function computeNetBalances(
  memberIds: string[],
  expenses: { paid_by: string; amount_in_home: number; expense_splits: { user_id: string; share_in_home: number }[] }[],
  settlements: { from_user: string; to_user: string; amount_in_home: number }[]
) {
  const net = new Map(memberIds.map((id) => [id, 0]))

  for (const e of expenses) {
    net.set(e.paid_by, (net.get(e.paid_by) ?? 0) + e.amount_in_home)
    for (const split of e.expense_splits) {
      net.set(split.user_id, (net.get(split.user_id) ?? 0) - split.share_in_home)
    }
  }
  for (const s of settlements) {
    net.set(s.from_user, (net.get(s.from_user) ?? 0) + s.amount_in_home)
    net.set(s.to_user, (net.get(s.to_user) ?? 0) - s.amount_in_home)
  }
  return net
}

export function simplifyDebts(net: Map<string, number>) {
  const EPSILON = 0.01
  const creditors: { userId: string; amount: number }[] = []
  const debtors: { userId: string; amount: number }[] = []

  for (const [userId, amount] of net) {
    if (amount > EPSILON) creditors.push({ userId, amount })
    else if (amount < -EPSILON) debtors.push({ userId, amount: -amount })
  }
  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const transactions: { from: string; to: string; amount: number }[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]
    const amount = Math.min(debtor.amount, creditor.amount)
    if (amount > EPSILON) transactions.push({ from: debtor.userId, to: creditor.userId, amount })
    debtor.amount -= amount
    creditor.amount -= amount
    if (debtor.amount <= EPSILON) i += 1
    if (creditor.amount <= EPSILON) j += 1
  }
  return transactions
}
