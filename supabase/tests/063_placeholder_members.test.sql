-- Behaviour tests for migration 063 (placeholder members, option A).
-- Needs the scratch database from the other test scripts with migrations through 063
-- applied. Fixture rows live in a transaction that is rolled back. Never run this
-- against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/063_placeholder_members.test.sql
--
-- Cast: Alice (trip creator and member), Ben (new person who takes over a placeholder),
-- Cara (already in the trip: the merge case), Dev (outsider), Eve (suspended inviter case),
-- Jaya, Kit and Lou (placeholders, created the way the Edge Function creates them).

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-00000000000a', 'alice@test.invalid'),
  ('a1000000-0000-0000-0000-00000000000b', 'ben@test.invalid'),
  ('a1000000-0000-0000-0000-00000000000c', 'cara@test.invalid'),
  ('a1000000-0000-0000-0000-00000000000d', 'dev@test.invalid'),
  ('a1000000-0000-0000-0000-00000000000e', 'eve@test.invalid'),
  ('a1000000-0000-0000-0000-0000000000a1', 'jaya@test.invalid'),
  ('a1000000-0000-0000-0000-0000000000a2', 'kit@test.invalid'),
  ('a1000000-0000-0000-0000-0000000000a3', 'lou@test.invalid');
update public.profiles set display_name = 'Alice' where id = 'a1000000-0000-0000-0000-00000000000a';
update public.profiles set display_name = 'Ben'   where id = 'a1000000-0000-0000-0000-00000000000b';
update public.profiles set display_name = 'Cara'  where id = 'a1000000-0000-0000-0000-00000000000c';

insert into public.groups (id, name, home_currency, created_by) values
  ('b1000000-0000-0000-0000-00000000000a', 'Goa', 'INR', 'a1000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-00000000000b', 'Hampi', 'INR', 'a1000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-00000000000c', 'Old', 'INR', 'a1000000-0000-0000-0000-00000000000a');
insert into public.group_members (group_id, user_id) values
  ('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000c'),
  ('b1000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-00000000000c', 'a1000000-0000-0000-0000-00000000000a');
update public.groups set archived_at = now() where id = 'b1000000-0000-0000-0000-00000000000c';

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $$ begin execute 'reset role'; end $$;

-- Net balance the way the web computes it: paid minus shares, plus settlements sent, minus received.
create or replace function pg_temp.net(g uuid, u uuid) returns numeric language sql as $$
  select coalesce((select sum(amount_in_home) from public.expenses where group_id = g and deleted_at is null and paid_by = u), 0)
       - coalesce((select sum(s.share_in_home) from public.expense_splits s join public.expenses e on e.id = s.expense_id where e.group_id = g and e.deleted_at is null and s.user_id = u), 0)
       + coalesce((select sum(amount_in_home) from public.settlements where group_id = g and from_user = u), 0)
       - coalesce((select sum(amount_in_home) from public.settlements where group_id = g and to_user = u), 0);
$$;

create or replace function pg_temp.mkph(ph uuid, g uuid, nm text, actor uuid) returns void language plpgsql as $$
begin
  perform public.register_placeholder(ph, g, nm, actor);
end $$;

-- Handy: a link for a placeholder, made by a member; returns the token.
create or replace function pg_temp.mkinv(uid uuid, g uuid, ph uuid) returns text language plpgsql as $$
declare t text;
begin
  perform pg_temp.as_user(uid);
  t := (select invite_token from public.create_invite('trip', g, null, ph));
  perform pg_temp.as_owner();
  return t;
end $$;

-- 1. register_placeholder flags the account, names it, hides the email and adds it to the trip.
do $$
declare r jsonb; p record;
begin
  r := public.register_placeholder('a1000000-0000-0000-0000-0000000000a1', 'b1000000-0000-0000-0000-00000000000a', '  Jaya  ', 'a1000000-0000-0000-0000-00000000000a');
  select * into p from public.profiles where id = 'a1000000-0000-0000-0000-0000000000a1';
  assert p.is_placeholder and p.claimed_into is null, 'flagged';
  assert p.display_name = 'Jaya', 'name trimmed';
  assert p.email = 'not-joined-a1000000@placeholder.invalid', format('email hidden: %s', p.email);
  assert p.placeholder_group = 'b1000000-0000-0000-0000-00000000000a' and p.placeholder_added_by = 'a1000000-0000-0000-0000-00000000000a', 'who added where';
  assert exists (select 1 from public.group_members where group_id = 'b1000000-0000-0000-0000-00000000000a' and user_id = p.id), 'added to trip';
  assert (r ->> 'display_name') = 'Jaya', 'reply';
  raise notice 'PASS 1 register_placeholder flags, names, hides the email and adds to the trip';
end $$;

-- 2. register_placeholder refusals.
do $$
declare failed boolean;
begin
  failed := false; begin perform public.register_placeholder('a1000000-0000-0000-0000-0000000000a2', 'b1000000-0000-0000-0000-00000000000a', 'Kit', 'a1000000-0000-0000-0000-00000000000d'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'a non-member added someone';
  failed := false; begin perform public.register_placeholder('a1000000-0000-0000-0000-0000000000a2', 'b1000000-0000-0000-0000-00000000000c', 'Kit', 'a1000000-0000-0000-0000-00000000000a'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'added to an archived trip';
  failed := false; begin perform public.register_placeholder('a1000000-0000-0000-0000-0000000000a2', 'b1000000-0000-0000-0000-00000000000a', '   ', 'a1000000-0000-0000-0000-00000000000a'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'blank name accepted';
  failed := false; begin perform public.register_placeholder('a1000000-0000-0000-0000-0000000000a1', 'b1000000-0000-0000-0000-00000000000a', 'Again', 'a1000000-0000-0000-0000-00000000000a'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'an existing placeholder was registered again';
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
  failed := false; begin perform public.register_placeholder('a1000000-0000-0000-0000-0000000000a2', 'b1000000-0000-0000-0000-00000000000a', 'Kit', 'a1000000-0000-0000-0000-00000000000a'); exception when insufficient_privilege then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'a signed-in person called the server-only function';
  raise notice 'PASS 2 non-member, archived trip, blank name, repeat and direct calls are all refused';
end $$;

-- 3. Nobody can set the placeholder flags on themselves.
do $$
declare failed boolean;
begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000d');
  failed := false; begin update public.profiles set is_placeholder = true where id = 'a1000000-0000-0000-0000-00000000000d'; exception when insufficient_privilege then failed := true; end;
  assert failed, 'a person flagged themselves as a placeholder';
  failed := false; begin update public.profiles set claimed_into = 'a1000000-0000-0000-0000-00000000000a' where id = 'a1000000-0000-0000-0000-00000000000d'; exception when insufficient_privilege then failed := true; end;
  assert failed, 'a person set claimed_into';
  update public.profiles set display_name = 'Dev D' where id = 'a1000000-0000-0000-0000-00000000000d';
  perform pg_temp.as_owner();
  assert (select display_name from public.profiles where id = 'a1000000-0000-0000-0000-00000000000d') = 'Dev D', 'ordinary profile edits still work';
  raise notice 'PASS 3 placeholder flags are server-only; ordinary profile edits still work';
end $$;

-- 4. Making a link for a placeholder.
do $$
declare failed boolean; r record;
begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000c');   -- Cara, a member
  select * into r from public.create_invite('trip', 'b1000000-0000-0000-0000-00000000000a', 'for Jaya', 'a1000000-0000-0000-0000-0000000000a1');
  assert r.invite_max_uses = 1, 'a placeholder link is single use';
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000d');   -- outsider
  failed := false; begin perform * from public.create_invite('trip', 'b1000000-0000-0000-0000-00000000000a', null, 'a1000000-0000-0000-0000-0000000000a1'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'an outsider made a link for a placeholder';
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
  failed := false; begin perform * from public.create_invite('trip', 'b1000000-0000-0000-0000-00000000000b', null, 'a1000000-0000-0000-0000-0000000000a1'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'a link for a placeholder who is in a different trip';
  failed := false; begin perform * from public.create_invite('trip', 'b1000000-0000-0000-0000-00000000000a', null, 'a1000000-0000-0000-0000-00000000000c'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'a link "for" a real member';
  failed := false; begin perform * from public.create_invite('circle', 'b1000000-0000-0000-0000-00000000000a', null, 'a1000000-0000-0000-0000-0000000000a1'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'a placeholder link for a circle';
  perform pg_temp.as_owner();
  raise notice 'PASS 4 a member can make a one-use placeholder link; outsiders, wrong trip, real members and circles are refused';
end $$;

-- 5. The join screen can name who the link is for, to anyone holding it.
do $$
declare tok text; j jsonb;
begin
  tok := pg_temp.mkinv('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1');
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000b');
  j := public.preview_invite(tok);
  assert j ->> 'state' = 'ok' and j ->> 'placeholder_name' = 'Jaya', format('preview: %s', j);
  assert j -> 'target_id' = 'null'::jsonb and (j ->> 'already_member')::boolean = false, 'a stranger sees no trip id';
  perform pg_temp.as_owner();
  raise notice 'PASS 5 preview names the placeholder';
end $$;

-- Fixture ledger for Goa: Alice, Jaya (placeholder) and Cara are in it.
insert into public.expenses (id, group_id, description, paid_by, currency, amount, exchange_rate, amount_in_home, created_by, category) values
  ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000a', 'Dinner', 'a1000000-0000-0000-0000-00000000000a', 'INR', 900, 1, 900, 'a1000000-0000-0000-0000-00000000000a', 'Food'),
  ('e1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-00000000000a', 'Taxi', 'a1000000-0000-0000-0000-0000000000a1', 'INR', 300, 1, 300, 'a1000000-0000-0000-0000-00000000000a', 'Taxi/Cab'),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-00000000000a', 'Hotel', 'a1000000-0000-0000-0000-00000000000a', 'INR', 600, 1, 600, 'a1000000-0000-0000-0000-00000000000a', 'Lodging'),
  ('e1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-00000000000a', 'Lunch', 'a1000000-0000-0000-0000-00000000000a', 'USD', 20, 80, 1600, 'a1000000-0000-0000-0000-00000000000a', 'Food');
insert into public.expense_splits (expense_id, user_id, share_amount, share_in_home, percentage, share_units, adjustment) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 450, 450, null, null, null),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a1', 450, 450, null, null, null),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 150, 150, null, null, null),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a1', 150, 150, null, null, null),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 200, 200, 33.33, null, null),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000c', 200, 200, 33.33, null, null),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-0000000000a1', 200, 200, 33.34, null, null),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 10, 800, null, 1, null),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-0000000000a1', 10, 800, null, 1, null);
update public.expenses set split_type = 'equal', items = jsonb_build_array(
    jsonb_build_object('description', 'Biryani', 'amount', 400, 'participant_ids', jsonb_build_array('a1000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-00000000000a')),
    jsonb_build_object('description', 'Naan', 'amount', 200, 'participant_ids', jsonb_build_array('a1000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-00000000000c', 'a1000000-0000-0000-0000-00000000000a')))
  where id = 'e1000000-0000-0000-0000-000000000003';
insert into public.settlements (id, group_id, from_user, to_user, currency, amount, exchange_rate, amount_in_home, created_by) values
  ('f1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-00000000000a', 'INR', 100, 1, 100, 'a1000000-0000-0000-0000-00000000000a'),
  ('f1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-00000000000c', 'INR', 50, 1, 50, 'a1000000-0000-0000-0000-00000000000a');

-- Remember the balances before anyone claims.
create temp table before_net as
  select u, pg_temp.net('b1000000-0000-0000-0000-00000000000a', u) as n
  from (values ('a1000000-0000-0000-0000-00000000000a'::uuid), ('a1000000-0000-0000-0000-00000000000c'), ('a1000000-0000-0000-0000-0000000000a1')) v(u);
grant select on before_net to authenticated;

-- 6. A new person (Ben) takes over Jaya from the link: balances are exactly what they were.
do $$
declare tok text; j jsonb; nb numeric; pj numeric; na numeric; nc numeric;
begin
  tok := pg_temp.mkinv('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1');
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000b');
  j := public.accept_invite(tok);
  perform pg_temp.as_owner();
  assert (j ->> 'claimed_placeholder')::boolean, format('claim reported: %s', j);
  assert exists (select 1 from public.group_members where group_id = 'b1000000-0000-0000-0000-00000000000a' and user_id = 'a1000000-0000-0000-0000-00000000000b'), 'Ben is in the trip';
  assert not exists (select 1 from public.group_members where user_id = 'a1000000-0000-0000-0000-0000000000a1'), 'Jaya left the trip';
  assert not exists (select 1 from public.profiles where id = 'a1000000-0000-0000-0000-0000000000a1'), 'Jaya profile gone';
  assert not exists (select 1 from auth.users where id = 'a1000000-0000-0000-0000-0000000000a1'), 'Jaya account gone';
  nb := pg_temp.net('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000b');
  pj := (select n from before_net where u = 'a1000000-0000-0000-0000-0000000000a1');
  -- Jaya's settlement to Cara (50) collapses only in the merge case; here Ben is new, so it moves and Cara is unchanged.
  assert nb = pj, format('Ben took over Jaya exactly: ben %s vs jaya %s', nb, pj);
  na := pg_temp.net('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a');
  nc := pg_temp.net('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000c');
  assert na = (select n from before_net where u = 'a1000000-0000-0000-0000-00000000000a'), 'Alice unchanged';
  assert nc = (select n from before_net where u = 'a1000000-0000-0000-0000-00000000000c'), 'Cara unchanged';
  assert (select count(*) from public.expense_splits where user_id = 'a1000000-0000-0000-0000-0000000000a1') = 0, 'no splits left on Jaya';
  assert (select count(*) from public.expenses where paid_by = 'a1000000-0000-0000-0000-0000000000a1') = 0, 'no expenses left on Jaya';
  assert (select count(*) from public.settlements where from_user = 'a1000000-0000-0000-0000-0000000000a1' or to_user = 'a1000000-0000-0000-0000-0000000000a1') = 0, 'no settlements left on Jaya';
  assert (select paid_by from public.expenses where id = 'e1000000-0000-0000-0000-000000000002') = 'a1000000-0000-0000-0000-00000000000b', 'Taxi now paid by Ben';
  assert (select count(*) from public.expense_splits where expense_id = 'e1000000-0000-0000-0000-000000000003') = 3, 'hotel still has three shares';
  assert (select percentage from public.expense_splits where expense_id = 'e1000000-0000-0000-0000-000000000003' and user_id = 'a1000000-0000-0000-0000-00000000000b') = 33.34, 'percentage kept';
  assert (select share_units from public.expense_splits where expense_id = 'e1000000-0000-0000-0000-000000000004' and user_id = 'a1000000-0000-0000-0000-00000000000b') = 1, 'share units kept';
  raise notice 'PASS 6 a new person takes over a placeholder: every balance is exactly what it was, nothing left on the placeholder';
end $$;

-- 7. Itemized lists now name Ben, not Jaya.
do $$
declare it jsonb;
begin
  it := (select items from public.expenses where id = 'e1000000-0000-0000-0000-000000000003');
  assert it::text not like '%0000000000a1%', format('placeholder id left in items: %s', it);
  assert (it -> 0 -> 'participant_ids') @> to_jsonb('a1000000-0000-0000-0000-00000000000b'::text), 'Ben in the first item';
  assert jsonb_array_length(it -> 1 -> 'participant_ids') = 3, 'second item still has three people';
  raise notice 'PASS 7 itemized expenses point at the new person';
end $$;

-- 8. The link is single use and now dead.
do $$
declare tok text; failed boolean;
begin
  tok := (select token from public.invites where placeholder_id is null and inviter_id = 'a1000000-0000-0000-0000-00000000000a' and group_id = 'b1000000-0000-0000-0000-00000000000a' order by created_at desc limit 1);
  -- the used placeholder link: placeholder_id was nulled when Jaya's account was removed
  tok := (select i.token from public.invites i join public.invite_accepts a on a.invite_id = i.id where a.user_id = 'a1000000-0000-0000-0000-00000000000b');
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000d');
  failed := false; begin perform public.accept_invite(tok); exception when sqlstate '22023' then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'a used placeholder link let a second person in';
  assert not exists (select 1 from public.group_members where user_id = 'a1000000-0000-0000-0000-00000000000d'), 'Dev is not in the trip';
  raise notice 'PASS 8 the link works once';
end $$;

-- 9. Merge: Cara is already in the trip and opens a link for Kit, who paid and owes in the same expenses.
insert into public.expenses (id, group_id, description, paid_by, currency, amount, exchange_rate, amount_in_home, created_by, category) values
  ('e2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000a', 'Boat', 'a1000000-0000-0000-0000-0000000000a2', 'INR', 800, 1, 800, 'a1000000-0000-0000-0000-00000000000a', 'Activities'),
  ('e2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-00000000000a', 'Snacks', 'a1000000-0000-0000-0000-00000000000a', 'INR', 300, 1, 300, 'a1000000-0000-0000-0000-00000000000a', 'Food');
select pg_temp.mkph('a1000000-0000-0000-0000-0000000000a2', 'b1000000-0000-0000-0000-00000000000a', 'Kit', 'a1000000-0000-0000-0000-00000000000a');
insert into public.group_members (group_id, user_id) values ('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a2') on conflict do nothing;
insert into public.expense_splits (expense_id, user_id, share_amount, share_in_home) values
  ('e2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 200, 200),
  ('e2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000c', 300, 300),
  ('e2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a2', 300, 300),
  ('e2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 100, 100),
  ('e2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-0000000000a2', 200, 200);
insert into public.settlements (id, group_id, from_user, to_user, currency, amount, exchange_rate, amount_in_home, created_by) values
  ('f2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000c', 'a1000000-0000-0000-0000-0000000000a2', 'INR', 120, 1, 120, 'a1000000-0000-0000-0000-00000000000a'),
  ('f2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a2', 'a1000000-0000-0000-0000-00000000000a', 'INR', 30, 1, 30, 'a1000000-0000-0000-0000-00000000000a');
create temp table before_merge as
  select u, pg_temp.net('b1000000-0000-0000-0000-00000000000a', u) as n
  from (values ('a1000000-0000-0000-0000-00000000000a'::uuid), ('a1000000-0000-0000-0000-00000000000c'), ('a1000000-0000-0000-0000-0000000000a2')) v(u);
do $$
declare tok text; j jsonb; nc numeric; expect numeric;
begin
  tok := pg_temp.mkinv('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a2');
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000c');
  j := public.preview_invite(tok);
  assert j ->> 'state' = 'ok', format('a member can still open a placeholder link: %s', j);
  j := public.accept_invite(tok);
  perform pg_temp.as_owner();
  assert (j ->> 'claimed_placeholder')::boolean, 'merge claimed';
  nc := pg_temp.net('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000c');
  -- Cara's old net plus Kit's old net; the 120 Cara paid Kit cancels out (a payment to yourself), and so does nothing else.
  expect := (select n from before_merge where u = 'a1000000-0000-0000-0000-00000000000c') + (select n from before_merge where u = 'a1000000-0000-0000-0000-0000000000a2');
  assert nc = expect, format('merged balance: cara %s vs expected %s', nc, expect);
  assert (select n from before_merge where u = 'a1000000-0000-0000-0000-00000000000a') = pg_temp.net('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a'), 'Alice unchanged by the merge';
  assert (select share_in_home from public.expense_splits where expense_id = 'e2000000-0000-0000-0000-000000000001' and user_id = 'a1000000-0000-0000-0000-00000000000c') = 600, 'shared expense: shares added (300 + 300)';
  assert (select count(*) from public.expense_splits where expense_id = 'e2000000-0000-0000-0000-000000000001') = 2, 'one row per person after the merge';
  assert (select sum(share_in_home) from public.expense_splits where expense_id = 'e2000000-0000-0000-0000-000000000001') = 800, 'expense still adds up to 800';
  assert not exists (select 1 from public.settlements where id = 'f2000000-0000-0000-0000-000000000001'), 'the payment between the two collapsed';
  assert exists (select 1 from public.settlements where id = 'f2000000-0000-0000-0000-000000000002' and from_user = 'a1000000-0000-0000-0000-00000000000c'), 'the other settlement moved';
  assert not exists (select 1 from auth.users where id = 'a1000000-0000-0000-0000-0000000000a2'), 'Kit account gone';
  raise notice 'PASS 9 merge: an existing member claims a placeholder; shares add up, balances combine, nothing lost';
end $$;

-- 10. Placeholders are not users: reports skip them; a stale link for a claimed person is refused.
do $$
declare failed boolean;
begin
  perform pg_temp.mkph('a1000000-0000-0000-0000-0000000000a3', 'b1000000-0000-0000-0000-00000000000a', 'Lou', 'a1000000-0000-0000-0000-00000000000a');
  assert not exists (select 1 from public.usage_eligible(false) where id = 'a1000000-0000-0000-0000-0000000000a3'), 'a placeholder counted as a user (all users)';
  assert not exists (select 1 from public.usage_eligible(true) where id = 'a1000000-0000-0000-0000-0000000000a3'), 'a placeholder counted as a user (default view)';
  assert exists (select 1 from public.usage_eligible(false) where id = 'a1000000-0000-0000-0000-00000000000a'), 'real users still counted';
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
  failed := false; begin perform * from public.create_invite('trip', 'b1000000-0000-0000-0000-00000000000a', null, 'a1000000-0000-0000-0000-0000000000a1'); exception when sqlstate '22023' then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'a link for an already-claimed person';
  raise notice 'PASS 10 usage reports skip placeholders; links for claimed people are refused';
end $$;

-- 11. A link that was turned off, or expired, cannot claim.
do $$
declare tok text; failed boolean;
begin
  tok := pg_temp.mkinv('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a3');
  update public.invites set revoked_at = now() where token = tok;
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000d');
  failed := false; begin perform public.accept_invite(tok); exception when sqlstate '22023' then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'a revoked placeholder link claimed';
  assert exists (select 1 from public.profiles where id = 'a1000000-0000-0000-0000-0000000000a3' and is_placeholder), 'Lou still waiting';
  tok := pg_temp.mkinv('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a3');
  update public.invites set expires_at = now() - interval '1 minute' where token = tok;
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000d');
  failed := false; begin perform public.accept_invite(tok); exception when sqlstate '22023' then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'an expired placeholder link claimed';
  raise notice 'PASS 11 revoked and expired placeholder links cannot claim';
end $$;

-- 12. Ordinary invites are unchanged (regression).
do $$
declare tok text; j jsonb;
begin
  tok := pg_temp.mkinv('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-00000000000b', null);
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000d');
  j := public.preview_invite(tok);
  assert j ->> 'state' = 'ok' and (j -> 'placeholder_name') = 'null'::jsonb, format('plain preview: %s', j);
  j := public.accept_invite(tok);
  perform pg_temp.as_owner();
  assert (j ->> 'claimed_placeholder')::boolean = false and (j ->> 'already_member')::boolean = false, 'plain accept';
  assert exists (select 1 from public.group_members where group_id = 'b1000000-0000-0000-0000-00000000000b' and user_id = 'a1000000-0000-0000-0000-00000000000d'), 'Dev joined Hampi';
  perform pg_temp.as_user('a1000000-0000-0000-0000-00000000000d');
  j := public.accept_invite(tok);
  perform pg_temp.as_owner();
  assert (j ->> 'already_member')::boolean, 'second accept is a no-op';
  raise notice 'PASS 12 ordinary links behave exactly as before';
end $$;

-- 13. Limits: 20 people waiting per trip, and 20 added per person per day.
do $$
declare i int; failed boolean; uid uuid; msg text; actor uuid;
begin
  for i in 1..20 loop
    uid := gen_random_uuid();
    insert into auth.users (id, email) values (uid, format('bulk%s@test.invalid', i));
    actor := case when i % 2 = 0 then 'a1000000-0000-0000-0000-00000000000a'::uuid else 'a1000000-0000-0000-0000-00000000000d'::uuid end;
    perform public.register_placeholder(uid, 'b1000000-0000-0000-0000-00000000000b', format('Bulk %s', i), actor);
  end loop;
  uid := gen_random_uuid();
  insert into auth.users (id, email) values (uid, 'bulk21@test.invalid');
  failed := false;
  begin perform public.register_placeholder(uid, 'b1000000-0000-0000-0000-00000000000b', 'Bulk 21', 'a1000000-0000-0000-0000-00000000000a');
  exception when sqlstate '54000' then failed := true; msg := sqlerrm; end;
  assert failed and msg like '%20 people waiting%', format('the 21st placeholder in a trip: %s', msg);
  -- One person adding many across trips hits their own daily limit.
  update public.profiles set placeholder_added_by = 'a1000000-0000-0000-0000-00000000000c' where is_placeholder and placeholder_group = 'b1000000-0000-0000-0000-00000000000b';
  insert into public.group_members (group_id, user_id) values ('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000c') on conflict do nothing;
  failed := false;
  begin perform public.register_placeholder(uid, 'b1000000-0000-0000-0000-00000000000a', 'Over the day', 'a1000000-0000-0000-0000-00000000000c');
  exception when sqlstate '54000' then failed := true; msg := sqlerrm; end;
  assert failed and msg like '%added a lot of people today%', format('daily limit: %s', msg);
  raise notice 'PASS 13 at most 20 people waiting per trip and 20 added per person per day';
end $$;

rollback;
