-- =====================================================================
-- Jae's Runway · 15_seats.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- A seat and cabin for each person on a flight. Nothing here deletes data.
-- =====================================================================

alter table public.trip_item_travelers add column if not exists seat text;
alter table public.trip_item_travelers add column if not exists cabin text
  check (cabin is null or cabin in ('first', 'comfort', 'main', 'premium', 'delta_one'));

select 'Seats are set up ✓' as result;
