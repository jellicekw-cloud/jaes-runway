-- =====================================================================
-- Jae's Runway · 12_affirm.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Affirm loans live next to your Afterpay plans: a fixed monthly payment,
-- a set number of payments, from NFCU. Nothing here deletes data.
-- =====================================================================

alter table public.afterpay_orders add column if not exists provider text not null default 'afterpay' check (provider in ('afterpay', 'affirm'));
alter table public.afterpay_orders add column if not exists interval_months smallint check (interval_months is null or interval_months between 1 and 12);   -- set = monthly
alter table public.afterpay_orders add column if not exists payment_amount numeric(12,2) check (payment_amount is null or payment_amount > 0);         -- set = fixed payment (Affirm)

select 'Affirm is set up ✓' as result;
