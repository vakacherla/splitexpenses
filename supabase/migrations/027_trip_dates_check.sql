-- Group settings' trip-dates form had no validation at all — end_date
-- before start_date saved without complaint, both client-side and in the
-- database. Fixed client-side in src/lib/tripDates.js (used by
-- GroupSettingsModal); this is the same rule enforced at the data layer
-- too, since the update goes through a plain supabase.from('groups')
-- .update(...) that any other future caller could just as easily skip
-- the client check on.
--
-- Run this once in the SQL Editor of your existing project.

-- The bug that prompted this was caught live on a real group, so there's
-- almost certainly a row already sitting in violation. Swap start/end on
-- any such row rather than leaving the constraint unable to apply, or
-- silently deleting someone's trip dates.
update public.groups
set start_date = end_date, end_date = start_date
where start_date is not null and end_date is not null and end_date < start_date;

alter table public.groups
  add constraint groups_trip_dates_order
  check (start_date is null or end_date is null or end_date >= start_date);
