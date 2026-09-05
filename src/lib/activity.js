import { supabase } from './supabaseClient'

// Best-effort logging/notification — mirrors the tolerance AddExpenseForm
// already applies to its own "best-effort extras" (saveAsDefault etc.):
// a failure here should never block or fail the caller's own save, since
// the actual mutation (the expense/settlement/membership change) already
// succeeded by the time either of these is called.

export async function logActivity({ groupId, actorId, actorName, eventType, summary, entityId }) {
  try {
    await supabase.from('activity_events').insert({
      group_id: groupId,
      actor_id: actorId,
      actor_name: actorName,
      event_type: eventType,
      summary,
      entity_id: entityId ?? null,
    })
  } catch {
    // Feed row missing is a cosmetic loss, not a data-integrity one.
  }
}

export async function notifyGroup({ groupId, targetUserIds, title, body, url }) {
  if (!targetUserIds || targetUserIds.length === 0) return
  try {
    await supabase.functions.invoke('notify-group', {
      body: { groupId, targetUserIds, title, body, url },
    })
  } catch {
    // A missed push is not worth surfacing as an error to the actor —
    // the feed row (logActivity, called alongside this) is the durable
    // record; push is just the "right now" nudge on top of it.
  }
}
