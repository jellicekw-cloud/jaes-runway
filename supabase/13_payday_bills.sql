-- =====================================================================
-- Jae's Runway · 13_payday_bills.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Bills that come out every payday (every 2 weeks), like a mortgage or
-- car note paid biweekly. Nothing here deletes data.
-- =====================================================================

alter table public.bills add column if not exists frequency text not null default 'monthly' check (frequency in ('monthly', 'payday'));

select 'Payday bills are set up ✓' as result;
