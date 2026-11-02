-- =====================================================================
-- Jae's Runway · 16_wallet.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- A cash Wallet: cash you take out, a $40-per-payday cash budget, and
-- recounts. Cash never counts in "Can I afford it?". Nothing here deletes data.
-- =====================================================================

-- Accounts can now be cash
alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check check (kind in ('checking', 'savings', 'vault', 'cash'));

-- Your cash budget per paycheck ($40 = $20 a week)
alter table public.settings add column if not exists cash_per_payday numeric(12,2) not null default 40;

-- The Wallet itself (starts empty: count your cash once in the app)
insert into public.accounts (user_id, name, institution, kind, role_note, sort)
select s.user_id, 'Wallet', 'Cash', 'cash', '$40 cash per payday', 5
from public.settings s
where not exists (select 1 from public.accounts x where x.user_id = s.user_id and x.kind = 'cash');

select 'Wallet is set up ✓' as result;
