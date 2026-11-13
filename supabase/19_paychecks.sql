-- =====================================================================
-- Jae's Runway · 19_paychecks.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- What each paycheck actually was (per account), so balances, In vs out and
-- the monthly recap use the real amount instead of the usual one.
-- Nothing here deletes data.
-- =====================================================================

create table if not exists public.paycheck_actuals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pay_date    date not null,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  amount      numeric(12,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (user_id, pay_date, account_id)
);
alter table public.paycheck_actuals enable row level security;
drop policy if exists "Owner can do everything" on public.paycheck_actuals;
create policy "Owner can do everything" on public.paycheck_actuals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

select 'Paycheck amounts are set up ✓' as result;
