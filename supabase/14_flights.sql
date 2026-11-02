-- =====================================================================
-- Jae's Runway · 14_flights.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- A small cache for flight lookups (next Delta flights on your standby
-- days), so Runway asks the flight-data service as little as possible.
-- Only the email reader (server) uses it. Nothing here deletes data.
-- =====================================================================

create table if not exists public.flight_cache (
  key         text primary key,            -- e.g. ATL|2026-11-02T12:00
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);
alter table public.flight_cache enable row level security;   -- no policies: the app can't read it, only the reader can

select 'Flight lookups are set up ✓' as result;
