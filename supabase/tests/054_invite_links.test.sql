-- Behaviour tests for migration 054 (per-invite links, phase 1).
-- Needs the scratch database from the other test scripts, with migrations 031,
-- 032 and 040 (circles) and 054 applied. Fixture rows live in a transaction that
-- is rolled back. Never run this against production.
--
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/054_invite_links.test.sql
--
-- Cast: Casey (trip creator and circle creator), Max (member of the trip),
-- Olly and Pat (outsiders, new accounts), Zed (suspended), Una (inviter who gets
-- suspended later), Cap (used only to test the daily cap).

\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to anon, authenticated;

begin;

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000c', 'casey@test.invalid'),
  ('c0000000-0000-0000-0000-00000000000d', 'max@test.invalid'),
  ('c0000000-0000-0000-0000-00000000000e', 'olly@test.invalid'),
  ('c0000000-0000-0000-0000-00000000000f', 'pat@test.invalid'),
  ('c0000000-0000-0000-0000-000000000010', 'zed@test.invalid'),
  ('c0000000-0000-0000-0000-000000000011', 'una@test.invalid'),
  ('c0000000-0000-0000-0000-000000000012', 'cap@test.invalid'),
  ('c0000000-0000-0000-0000-000000000013', 'quin@test.invalid'),
  ('c0000000-0000-0000-0000-000000000014', 'rae@test.invalid');
update public.profiles set display_name = 'Casey Lee',  avatar_path = 'casey.jpg', created_at = now() - interval '60 days' where id = 'c0000000-0000-0000-0000-00000000000c';
update public.profiles set display_name = 'Max Moss',   created_at = now() - interval '60 days' where id = 'c0000000-0000-0000-0000-00000000000d';
update public.profiles set display_name = 'Olly Oak'   where id = 'c0000000-0000-0000-0000-00000000000e';
update public.profiles set display_name = 'Pat Pine',   created_at = now() - interval '40 days' where id = 'c0000000-0000-0000-0000-00000000000f';
update public.profiles set display_name = 'Zed Zinc'   where id = 'c0000000-0000-0000-0000-000000000010';
update public.profiles set display_name = 'Una Umber', created_at = now() - interval '60 days' where id = 'c0000000-0000-0000-0000-000000000011';
update public.profiles set display_name = 'Cap Cedar', created_at = now() - interval '60 days' where id = 'c0000000-0000-0000-0000-000000000012';
update public.profiles set display_name = 'Quin Quill' where id = 'c0000000-0000-0000-0000-000000000013';
update public.profiles set display_name = 'Rae Reed'   where id = 'c0000000-0000-0000-0000-000000000014';
update auth.users set banned_until = now() + interval '1 day' where id = 'c0000000-0000-0000-0000-000000000010';

insert into public.groups (id, name, home_currency, created_by, banner_path) values
  ('d0000000-0000-0000-0000-00000000000a', 'Goa weekend', 'USD', 'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000a/banner.jpg'),
  ('d0000000-0000-0000-0000-00000000000b', 'Old trip', 'USD', 'c0000000-0000-0000-0000-00000000000c', null);
update public.groups set archived_at = now() where id = 'd0000000-0000-0000-0000-00000000000b';
insert into public.group_members (group_id, user_id) values
  ('d0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c'),
  ('d0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000d'),
  ('d0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000011'),
  ('d0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000012'),
  ('d0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c');

insert into public.circles (id, name, created_by) values
  ('e0000000-0000-0000-0000-00000000000a', 'Smith Family', 'c0000000-0000-0000-0000-00000000000c');
insert into public.circle_members (circle_id, user_id) values
  ('e0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $$ begin execute 'reset role'; end $$;

-- Put a person back to "outsider" between checks (trip, circle, and any record of
-- having used a link), so each check starts from a known state.
create or replace function pg_temp.reset(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  delete from public.group_members where user_id = uid and group_id = 'd0000000-0000-0000-0000-00000000000a';
  delete from public.circle_members where user_id = uid;
  delete from public.invite_accepts where user_id = uid;
end $$;

-- Handy: make a link as a given user and hand back its token.
create or replace function pg_temp.mk(uid uuid, kind text, target uuid, lbl text default null) returns text language plpgsql as $$
declare t text;
begin
  perform pg_temp.as_user(uid);
  t := (select invite_token from public.create_invite(kind, target, lbl));
  perform pg_temp.as_owner();
  return t;
end $$;

-- 1. A member can make a link; its shape and defaults are right.
do $$
declare r record; lbl text;
begin
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000d');
  select * into r from public.create_invite('trip', 'd0000000-0000-0000-0000-00000000000a', '   Priya   ');
  perform pg_temp.as_owner();
  assert length(r.invite_token) = 32, 'token length';
  assert r.invite_max_uses = 20, 'max uses';
  assert r.invite_expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour', 'expiry about 14 days';
  lbl := (select label from public.invites where id = r.invite_id);
  assert lbl = 'Priya', format('label trimmed: [%s]', lbl);
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000d');
  select * into r from public.create_invite('trip', 'd0000000-0000-0000-0000-00000000000a', repeat('x', 100));
  perform pg_temp.as_owner();
  assert length((select label from public.invites where id = r.invite_id)) = 40, 'label cut to 40';
  raise notice 'PASS 1 member makes a link: random 32-char token, 20 uses, 14 days, label trimmed and capped';
end $$;

-- 2. Who may not make a link.
do $$
declare failed boolean;
begin
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000e');   -- outsider
  failed := false;
  begin perform * from public.create_invite('trip', 'd0000000-0000-0000-0000-00000000000a'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'outsider made a link';
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
  failed := false;
  begin perform * from public.create_invite('trip', 'd0000000-0000-0000-0000-00000000000b'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'link made for an archived trip';
  failed := false;
  begin perform * from public.create_invite('team', 'd0000000-0000-0000-0000-00000000000a'); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'unknown kind accepted';
  perform pg_temp.as_anon();
  failed := false;
  begin perform * from public.create_invite('trip', 'd0000000-0000-0000-0000-00000000000a'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon made a link';
  perform pg_temp.as_owner();
  raise notice 'PASS 2 outsider, signed-out caller, archived trip and unknown type are all refused';
end $$;

-- 3. A suspended person cannot make or accept links.
do $$
declare failed boolean; tok text;
begin
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  perform pg_temp.as_user('c0000000-0000-0000-0000-000000000010');
  failed := false;
  begin perform public.accept_invite(tok); exception when insufficient_privilege then failed := true; end;
  assert failed, 'suspended person accepted';
  failed := false;
  begin perform * from public.create_invite('trip', 'd0000000-0000-0000-0000-00000000000a'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'suspended person made a link';
  perform pg_temp.as_owner();
  raise notice 'PASS 3 suspended person cannot make or accept a link';
end $$;

-- 4. At most 20 new links a day per person.
do $$
declare failed boolean := false; i integer;
begin
  perform pg_temp.as_user('c0000000-0000-0000-0000-000000000012');
  for i in 1..20 loop perform * from public.create_invite('trip', 'd0000000-0000-0000-0000-00000000000a'); end loop;
  begin perform * from public.create_invite('trip', 'd0000000-0000-0000-0000-00000000000a'); exception when sqlstate '54000' then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'daily cap not enforced';
  raise notice 'PASS 4 daily cap of 20 links enforced';
end $$;

-- 5. The tables are closed to the API.
do $$
declare seen integer; failed boolean := false;
begin
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000d');
  seen := (select count(*) from public.invites);
  assert seen = 0, 'member could read invites directly';
  seen := (select count(*) from public.invite_accepts);
  assert seen = 0, 'member could read invite_accepts directly';
  begin
    insert into public.invites (token, kind, group_id, inviter_id)
    values ('forged', 'trip', 'd0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000d');
  exception when others then failed := true; end;
  assert failed, 'member forged a link row';
  perform pg_temp.as_owner();
  raise notice 'PASS 5 invites and invite_accepts cannot be read or written through the API';
end $$;

-- 6. The preview shows only what a stranger may see.
do $$
declare tok text; r jsonb; opens_before integer; opens_after integer; id1 uuid;
begin
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  id1 := (select id from public.invites where token = tok);
  opens_before := (select open_count from public.invites where id = id1);
  perform pg_temp.as_anon();
  r := public.preview_invite(tok);
  perform pg_temp.as_owner();
  opens_after := (select open_count from public.invites where id = id1);
  assert r->>'state' = 'ok', format('state %s', r->>'state');
  assert r->>'name' = 'Goa weekend', 'trip name';
  assert r->>'inviter_first_name' = 'Casey', 'inviter first name only';
  assert r->>'inviter_avatar_path' = 'casey.jpg', 'inviter photo';
  assert r->>'banner_path' = 'd0000000-0000-0000-0000-00000000000a/banner.jpg', 'trip cover photo';
  assert r->'target_id' = 'null'::jsonb, 'target id hidden from a stranger';
  assert (select array_agg(k order by k) from jsonb_object_keys(r) k) =
         array['banner_path','icon_seed','inviter_avatar_path','inviter_first_name','kind','name','state','target_id'],
         'unexpected keys in the preview';
  assert r::text !~* '@|Lee|Max|Moss', 'preview leaked a surname, member or email';
  assert opens_after = opens_before + 1, 'open not counted';
  raise notice 'PASS 6 preview: safe summary only (name, cover, inviter first name), counts the open';
end $$;

-- 7. Garbage tokens.
do $$
begin
  perform pg_temp.as_anon();
  assert public.preview_invite('nope')->>'state' = 'not_found', 'garbage';
  assert public.preview_invite(null)->>'state' = 'not_found', 'null';
  assert public.preview_invite(repeat('a', 200))->>'state' = 'not_found', 'too long';
  perform pg_temp.as_owner();
  raise notice 'PASS 7 unknown, empty and oversized tokens say not_found';
end $$;

-- 8. Joining: the member row, the new-account flag, and doing it twice.
do $$
declare tok text; r jsonb; accepts integer; flag boolean; ismember boolean;
begin
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000e');   -- Olly, brand new account
  r := public.accept_invite(tok);
  assert r->>'already_member' = 'false' and r->>'name' = 'Goa weekend', format('accept result %s', r);
  r := public.accept_invite(tok);                                    -- again
  assert r->>'already_member' = 'true', 'second accept should say already a member';
  assert public.preview_invite(tok)->>'state' = 'already_member', 'preview for a member';
  assert public.preview_invite(tok)->>'target_id' = 'd0000000-0000-0000-0000-00000000000a', 'member gets the trip id';
  perform pg_temp.as_owner();
  ismember := exists (select 1 from public.group_members where group_id = 'd0000000-0000-0000-0000-00000000000a' and user_id = 'c0000000-0000-0000-0000-00000000000e');
  accepts := (select count(*) from public.invite_accepts a join public.invites i on i.id = a.invite_id where i.token = tok);
  flag := (select a.new_account from public.invite_accepts a join public.invites i on i.id = a.invite_id where i.token = tok limit 1);
  assert ismember, 'not added to the trip';
  assert accepts = 1, format('accept recorded %s times', accepts);
  assert flag, 'new account flag should be true';
  raise notice 'PASS 8 join adds the member once, records a new-account flag, repeat is harmless';
end $$;

-- 9. An existing account joining is not marked new.
do $$
declare tok text; flag boolean;
begin
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');   -- Pat, 40 days old
  perform public.accept_invite(tok);
  perform pg_temp.as_owner();
  flag := (select a.new_account from public.invite_accepts a join public.invites i on i.id = a.invite_id where i.token = tok limit 1);
  assert flag = false, 'old account marked as new';
  raise notice 'PASS 9 an existing account joining is not counted as a new account';
end $$;

-- 10. The use limit. Quin takes the only place; Rae is then told it is full.
do $$
declare tok text; failed boolean := false; r jsonb;
begin
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  update public.invites set max_uses = 1 where token = tok;
  perform pg_temp.as_user('c0000000-0000-0000-0000-000000000013');
  perform public.accept_invite(tok);
  perform pg_temp.as_user('c0000000-0000-0000-0000-000000000014');
  r := public.preview_invite(tok);
  assert r->>'state' = 'full', format('preview state %s', r->>'state');
  begin perform public.accept_invite(tok); exception when sqlstate '22023' then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'limit not enforced';
  assert not exists (select 1 from public.group_members where user_id = 'c0000000-0000-0000-0000-000000000014'), 'Rae got in anyway';
  raise notice 'PASS 10 a link stops working once it has been used as many times as it allows';
end $$;

-- 11. Expired and turned-off links.
do $$
declare tok text; failed boolean; r jsonb;
begin
  perform pg_temp.reset('c0000000-0000-0000-0000-00000000000f');
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  update public.invites set expires_at = now() - interval '1 minute' where token = tok;
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');
  assert public.preview_invite(tok)->>'state' = 'expired', 'expired preview';
  failed := false;
  begin perform public.accept_invite(tok); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'expired link accepted';
  perform pg_temp.as_owner();

  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  update public.invites set revoked_at = now() where token = tok;
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');
  assert public.preview_invite(tok)->>'state' = 'revoked', 'revoked preview';
  failed := false;
  begin perform public.accept_invite(tok); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'revoked link accepted';
  perform pg_temp.as_owner();
  raise notice 'PASS 11 expired and turned-off links are refused, with a reason';
end $$;

-- 12. Someone removed from a trip cannot come back through the same link.
do $$
declare tok text; failed boolean := false;
begin
  perform pg_temp.reset('c0000000-0000-0000-0000-00000000000f');
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');
  perform public.accept_invite(tok);
  perform pg_temp.as_owner();
  delete from public.group_members where group_id = 'd0000000-0000-0000-0000-00000000000a' and user_id = 'c0000000-0000-0000-0000-00000000000f';
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');
  assert public.preview_invite(tok)->>'state' = 'removed', 'removed preview';
  begin perform public.accept_invite(tok); exception when insufficient_privilege then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'removed member rejoined with the same link';
  raise notice 'PASS 12 a removed member cannot reuse the same link';
end $$;

-- 13. A suspended inviter's links stop working; an archived trip's links too.
do $$
declare tok text; failed boolean; tok2 text;
begin
  perform pg_temp.reset('c0000000-0000-0000-0000-00000000000f');
  tok := pg_temp.mk('c0000000-0000-0000-0000-000000000011', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  update auth.users set banned_until = now() + interval '1 day' where id = 'c0000000-0000-0000-0000-000000000011';
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');
  assert public.preview_invite(tok)->>'state' = 'revoked', 'suspended inviter preview';
  failed := false;
  begin perform public.accept_invite(tok); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'suspended inviter link accepted';
  perform pg_temp.as_owner();

  tok2 := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  update public.groups set archived_at = now() where id = 'd0000000-0000-0000-0000-00000000000a';
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');
  assert public.preview_invite(tok2)->>'state' = 'archived', 'archived preview';
  failed := false;
  begin perform public.accept_invite(tok2); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'archived trip link accepted';
  perform pg_temp.as_owner();
  update public.groups set archived_at = null where id = 'd0000000-0000-0000-0000-00000000000a';
  raise notice 'PASS 13 suspended inviter and archived trip stop their links';
end $$;

-- 14. Circle links add the person to the circle.
do $$
declare tok text; r jsonb; ismember boolean;
begin
  perform pg_temp.reset('c0000000-0000-0000-0000-00000000000f');
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'circle', 'e0000000-0000-0000-0000-00000000000a');
  perform pg_temp.as_anon();
  assert public.preview_invite(tok)->>'name' = 'Smith Family', 'circle name';
  assert public.preview_invite(tok)->>'kind' = 'circle', 'circle kind';
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');
  r := public.accept_invite(tok);
  perform pg_temp.as_owner();
  ismember := exists (select 1 from public.circle_members where circle_id = 'e0000000-0000-0000-0000-00000000000a' and user_id = 'c0000000-0000-0000-0000-00000000000f');
  assert ismember and r->>'kind' = 'circle', 'not added to the circle';
  raise notice 'PASS 14 a circle link adds the person to the circle';
end $$;

-- 15. Recording when and how a link was shared.
do $$
declare tok text; id1 uuid; failed boolean := false; via1 text; at1 timestamptz;
begin
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000d', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  id1 := (select id from public.invites where token = tok);
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000d');
  perform public.mark_invite_shared(id1, 'whatsapp');
  perform public.mark_invite_shared(id1, 'copy');                    -- first value wins
  begin perform public.mark_invite_shared(id1, 'carrier pigeon'); exception when sqlstate '22023' then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'unknown way of sharing accepted';
  via1 := (select shared_via from public.invites where id = id1);
  at1 := (select shared_at from public.invites where id = id1);
  assert via1 = 'whatsapp' and at1 is not null, format('shared_via %s', via1);
  -- someone else cannot change it
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
  perform public.mark_invite_shared(id1, 'email');
  perform pg_temp.as_owner();
  assert (select shared_via from public.invites where id = id1) = 'whatsapp', 'another user changed it';
  -- and a signed-out caller cannot call it at all
  perform pg_temp.as_anon();
  failed := false;
  begin perform public.mark_invite_shared(id1, 'copy'); exception when insufficient_privilege then failed := true; end;
  perform pg_temp.as_owner();
  assert failed, 'anon could call mark_invite_shared';
  raise notice 'PASS 15 shared_at and shared_via: first value wins, only the inviter, not signed-out callers';
end $$;

-- 16. A signed-out caller can preview but not accept.
do $$
declare tok text; failed boolean := false;
begin
  perform pg_temp.reset('c0000000-0000-0000-0000-00000000000f');
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000c', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  perform pg_temp.as_anon();
  begin perform public.accept_invite(tok); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon accepted';
  assert public.preview_invite(tok)->>'state' = 'ok', 'anon cannot preview';
  perform pg_temp.as_owner();
  raise notice 'PASS 16 signed-out callers can preview but not accept';
end $$;

-- 17. Deleting the inviter removes their links and the records of who joined.
do $$
declare tok text; left_over integer;
begin
  perform pg_temp.reset('c0000000-0000-0000-0000-00000000000f');
  tok := pg_temp.mk('c0000000-0000-0000-0000-00000000000d', 'trip', 'd0000000-0000-0000-0000-00000000000a');
  perform pg_temp.as_user('c0000000-0000-0000-0000-00000000000f');
  perform public.accept_invite(tok);
  perform pg_temp.as_owner();
  delete from auth.users where id = 'c0000000-0000-0000-0000-00000000000d';
  left_over := (select count(*) from public.invites where token = tok)
             + (select count(*) from public.invite_accepts a where a.user_id = 'c0000000-0000-0000-0000-00000000000f' and not exists (select 1 from public.invites i where i.id = a.invite_id));
  assert left_over = 0, 'links or accept records survived their inviter';
  raise notice 'PASS 17 deleting the inviter removes their links';
end $$;

rollback;
