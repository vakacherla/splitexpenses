-- Abuse protection while the app is free and sign-up is open (feedback item,
-- 2026-10-02). Two parts, neither needs a CAPTCHA key:
--
-- 1. Daily usage caps for the two AI features (receipt scan, typed-sentence
--    parse). They run on a free Gemini quota; a handful of junk accounts
--    could otherwise burn it for everyone. The Edge Functions call
--    consume_ai_quota() with the service role before spending any quota.
--
-- 2. A blocklist of throwaway-email domains, enforced by a trigger on
--    auth.users (the real guard) plus a pre-check function the sign-up form
--    uses to show a friendly message. example.com is deliberately NOT listed:
--    QA accounts use it.

-- ---------------------------------------------------------------------------
-- 1. AI usage caps
-- ---------------------------------------------------------------------------

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  feature text not null,
  uses integer not null default 0,
  primary key (user_id, day, feature)
);

-- No policies on purpose: with RLS on and nothing granted, only the service
-- role (which bypasses RLS) can touch it, so a user cannot reset their own
-- counter.
alter table public.ai_usage enable row level security;

-- Counts one use for today (UTC). Returns true if it was within the limit,
-- false if the user has already hit it.
create or replace function public.consume_ai_quota(p_user uuid, p_feature text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uses integer;
begin
  insert into public.ai_usage as u (user_id, day, feature, uses)
  values (p_user, (now() at time zone 'utc')::date, p_feature, 1)
  on conflict (user_id, day, feature)
  do update set uses = u.uses + 1
    where u.uses < p_limit
  returning u.uses into v_uses;

  return v_uses is not null;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Throwaway-email blocklist
-- ---------------------------------------------------------------------------

create table if not exists public.blocked_email_domains (
  domain text primary key check (domain = lower(domain))
);
alter table public.blocked_email_domains enable row level security;

insert into public.blocked_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'),
  ('guerrillamail.biz'), ('guerrillamail.de'), ('guerrillamailblock.com'), ('sharklasers.com'),
  ('grr.la'), ('pokemail.net'), ('spam4.me'), ('10minutemail.com'), ('10minutemail.net'),
  ('tempmail.com'), ('temp-mail.org'), ('temp-mail.io'), ('tempmail.net'), ('tempail.com'),
  ('tempmailo.com'), ('tempr.email'), ('tempinbox.com'), ('throwawaymail.com'), ('yopmail.com'),
  ('yopmail.fr'), ('yopmail.net'), ('trashmail.com'), ('trashmail.net'), ('trashmail.de'),
  ('getnada.com'), ('nada.email'), ('maildrop.cc'), ('mohmal.com'), ('dispostable.com'),
  ('fakeinbox.com'), ('mintemail.com'), ('mailnesia.com'), ('mytemp.email'), ('emailondeck.com'),
  ('burnermail.io'), ('discard.email'), ('discardmail.com'), ('spamgourmet.com'), ('mailcatch.com'),
  ('moakt.com'), ('tmpmail.org'), ('tmpmail.net'), ('inboxkitten.com'), ('harakirimail.com'),
  ('getairmail.com'), ('anonbox.net'), ('dropmail.me'), ('mail.tm'), ('emailfake.com'),
  ('fakemailgenerator.com'), ('crazymailing.com'), ('1secmail.com'), ('1secmail.org'),
  ('1secmail.net'), ('spambox.us'), ('mailforspam.com'), ('jetable.org'), ('minuteinbox.com'),
  ('luxusmail.org'), ('byom.de'), ('tempmailaddress.com')
on conflict do nothing;

-- True when the address's domain (or a parent domain) is on the blocklist.
create or replace function public.email_domain_is_blocked(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with d as (select lower(split_part(coalesce(p_email, ''), '@', 2)) as domain)
  select exists (
    select 1
    from public.blocked_email_domains b, d
    where d.domain <> ''
      and (d.domain = b.domain or d.domain like '%.' || b.domain)
  );
$$;

-- For the sign-up form: lets it show a friendly message before submitting.
create or replace function public.signup_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.email_domain_is_blocked(p_email);
$$;

grant execute on function public.signup_email_allowed(text) to anon, authenticated;
revoke all on function public.email_domain_is_blocked(text) from public, anon, authenticated;

-- The real enforcement: refuse the new account itself. (The form's pre-check
-- can be bypassed by calling the Auth API directly; this cannot.)
create or replace function public.block_throwaway_email_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.email_domain_is_blocked(new.email) then
    raise exception 'Please sign up with a permanent email address.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_throwaway_email_signup on auth.users;
create trigger block_throwaway_email_signup
  before insert on auth.users
  for each row execute function public.block_throwaway_email_signup();

notify pgrst, 'reload schema';
