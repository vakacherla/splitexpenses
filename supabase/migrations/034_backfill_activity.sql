-- One-time backfill for src/pages/GroupView.jsx's Activity tab. The feed
-- (migration 026) only ever logged events going forward from when it
-- shipped — anything that happened to a group before that point (or,
-- for member joins, before this specific join ever ran through
-- join_group_by_code) has always shown as "Nothing yet" even for a
-- group with real Ledger/Balances history. This reconstructs what can
-- be reconstructed from data that's still there, matching the exact
-- summary format each live logActivity() call already uses, so a
-- backfilled row is indistinguishable from one that was always there.
--
-- What's reconstructable, and backfilled: expenses added (skipping
-- rows created by a CSV import batch — those are represented by their
-- one consolidated csv_import row below, same as live behavior never
-- logs both), settlements recorded, CSV imports, and members joining
-- (skipping each group's own creator, since join_group_by_code — the
-- only path that ever logs member_joined — was never how a creator
-- themselves got added, live or backfilled).
--
-- What's NOT reconstructable, and deliberately skipped: expense edits
-- (no historical trace of what changed or when), expense deletions and
-- settlement/member removals (deleted_at exists but nothing records
-- *who* removed it — expenses/settlements have no "deleted_by" column
-- — and a wrong guess is worse than a gap). A deleted expense still
-- gets its original "added" event backfilled; it just won't show a
-- matching removal, the same partial picture you'd already get for
-- anything that predates this migration.
--
-- Idempotent: every insert below is guarded by a matching NOT EXISTS
-- against activity_events on (group_id, entity_id, event_type), so
-- running this more than once — or running it after some of this
-- history already got logged live — never creates a duplicate row.
--
-- Run this once in the SQL Editor of your existing project.

insert into public.activity_events (group_id, actor_id, actor_name, event_type, summary, entity_id, created_at)
select
  e.group_id,
  e.created_by,
  coalesce(p.display_name, 'Someone'),
  'expense_added',
  e.description || ' — ' || e.amount || ' ' || e.currency,
  e.id,
  e.created_at
from public.expenses e
left join public.profiles p on p.id = e.created_by
where e.import_batch_id is null
  and not exists (
    select 1 from public.activity_events a
    where a.group_id = e.group_id and a.entity_id = e.id and a.event_type = 'expense_added'
  );

insert into public.activity_events (group_id, actor_id, actor_name, event_type, summary, entity_id, created_at)
select
  s.group_id,
  s.created_by,
  coalesce(p.display_name, 'Someone'),
  'settlement_added',
  s.amount || ' ' || s.currency,
  s.id,
  s.created_at
from public.settlements s
left join public.profiles p on p.id = s.created_by
where not exists (
  select 1 from public.activity_events a
  where a.group_id = s.group_id and a.entity_id = s.id and a.event_type = 'settlement_added'
);

insert into public.activity_events (group_id, actor_id, actor_name, event_type, summary, entity_id, created_at)
select
  b.group_id,
  b.created_by,
  coalesce(p.display_name, 'Someone'),
  'csv_import',
  b.row_count || ' expense' || (case when b.row_count = 1 then '' else 's' end)
    || coalesce(' from ' || b.filename, ''),
  b.id,
  b.created_at
from public.import_batches b
left join public.profiles p on p.id = b.created_by
where not exists (
  select 1 from public.activity_events a
  where a.group_id = b.group_id and a.entity_id = b.id and a.event_type = 'csv_import'
);

insert into public.activity_events (group_id, actor_id, actor_name, event_type, summary, entity_id, created_at)
select
  gm.group_id,
  gm.user_id,
  coalesce(p.display_name, 'Someone'),
  'member_joined',
  coalesce(p.display_name, 'Someone'),
  gm.user_id,
  gm.joined_at
from public.group_members gm
join public.groups g on g.id = gm.group_id
left join public.profiles p on p.id = gm.user_id
where gm.user_id <> g.created_by
  and not exists (
    select 1 from public.activity_events a
    where a.group_id = gm.group_id and a.entity_id = gm.user_id and a.event_type = 'member_joined'
  );
