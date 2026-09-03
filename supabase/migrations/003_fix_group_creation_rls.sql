-- Fixes a bug in the original "groups: members can view" policy: creating a
-- group failed with "new row violates row-level security policy for table
-- groups" because the insert's RETURNING clause is gated by this same
-- SELECT policy, and the creator isn't a group_members row yet at that
-- exact instant (that insert happens right after, from the client).
--
-- Safe to run even if you already hit this bug and have groups stuck in a
-- bad state — this only changes the policy, it doesn't touch data.

drop policy if exists "groups: members can view" on public.groups;

create policy "groups: members can view" on public.groups
  for select using (public.is_group_member(id) or created_by = auth.uid());
