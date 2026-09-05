-- Follow-up to 027: that migration only checked ordering (end >= start),
-- but a native <input type="date"> happily accepts a typed year like
-- "0005" or "0644" with no complaint — caught live with exactly that.
-- Same reasoning as 027 for why this needs a DB-side check too, not just
-- the client-side one in src/lib/tripDates.js: this table is only ever
-- touched via a plain supabase.from('groups').update(...), no RPC, so
-- nothing else stops a future caller from skipping the client check.
--
-- Run this once in the SQL Editor of your existing project.

-- Caught live on a group with start_date '0005-05-05' and end_date
-- '0644-04-04' — unlike 027's ordering fix, there's no sensible corrected
-- value to swap in for a typo'd year, so clear the field back to unset
-- rather than guess. The group keeps its data; whoever manages it just
-- needs to re-enter real trip dates if they still want them.
update public.groups set start_date = null
where start_date is not null and (start_date < '2000-01-01' or start_date > '2100-12-31');

update public.groups set end_date = null
where end_date is not null and (end_date < '2000-01-01' or end_date > '2100-12-31');

alter table public.groups
  add constraint groups_start_date_year_range
  check (start_date is null or (start_date >= '2000-01-01' and start_date <= '2100-12-31'));

alter table public.groups
  add constraint groups_end_date_year_range
  check (end_date is null or (end_date >= '2000-01-01' and end_date <= '2100-12-31'));
