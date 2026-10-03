-- Part 4 of the invite-links migration (054), for pasting into the Supabase SQL editor
-- one piece at a time if the editor stops partway through the whole file. Run the parts in
-- order. Each part is safe to run more than once. This part: mark_invite_shared, then who may call what for create_invite and mark_invite_shared.

-- ---------------------------------------------------------------------------
-- mark_invite_shared: record when and how the inviter sent the link
-- ---------------------------------------------------------------------------
-- The first value wins. Someone else's link is silently left alone.

create or replace function public.mark_invite_shared(p_id uuid, p_how text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_how is null or p_how not in ('share', 'whatsapp', 'email', 'copy') then
    raise exception 'Unknown way of sharing.' using errcode = '22023';
  end if;
  if auth.uid() is null then
    return;
  end if;
  update public.invites
  set shared_at = coalesce(shared_at, now()),
      shared_via = coalesce(shared_via, p_how)
  where id = p_id and inviter_id = auth.uid();
end;
$$;

revoke all on function public.create_invite(text, uuid, text) from public, anon;
revoke all on function public.mark_invite_shared(uuid, text) from public, anon;
grant execute on function public.create_invite(text, uuid, text) to authenticated;
grant execute on function public.mark_invite_shared(uuid, text) to authenticated;

notify pgrst, 'reload schema';
