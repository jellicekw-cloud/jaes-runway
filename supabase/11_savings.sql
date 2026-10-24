-- =====================================================================
-- Jae's Runway · 11_savings.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Adds your DECU savings account (auto transfer from NFCU every 2 weeks),
-- a soft goal, and money moves in and out of savings (DECU and the SoFi Vault).
-- Savings never counts toward "Can I afford it?" or the paydown suggestion.
-- Nothing here deletes data.
-- =====================================================================

-- An automatic transfer into a savings account, and a soft goal
alter table public.accounts add column if not exists auto_from_account_id uuid references public.accounts(id) on delete set null;
alter table public.accounts add column if not exists auto_amount numeric(12,2) check (auto_amount is null or auto_amount > 0);
alter table public.accounts add column if not exists auto_next_on date;                    -- any one transfer day; repeats every auto_every_days
alter table public.accounts add column if not exists auto_every_days smallint not null default 14 check (auto_every_days > 0);
alter table public.accounts add column if not exists goal_amount numeric(12,2);

-- Money you move into or out of savings yourself ("Added more", "Took some out")
create table if not exists public.transfers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_account_id  uuid references public.accounts(id) on delete cascade,
  to_account_id    uuid references public.accounts(id) on delete cascade,
  amount           numeric(12,2) not null check (amount > 0),
  moved_on         date not null default current_date,
  note             text,
  created_at       timestamptz not null default now(),
  check (from_account_id is not null or to_account_id is not null)
);
create index if not exists transfers_user_date on public.transfers (user_id, moved_on desc);
alter table public.transfers enable row level security;
drop policy if exists "Owner can do everything" on public.transfers;
create policy "Owner can do everything" on public.transfers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Your DECU savings account: comes from NFCU every 2 weeks, soft goal $500.
-- Set the amount, the next transfer day and the balance on the Money tab.
insert into public.accounts (user_id, name, institution, kind, role_note, sort, auto_from_account_id, goal_amount)
select a.user_id, 'DECU Savings', 'DECU', 'savings', 'Auto from NFCU every 2 weeks', 4, a.id, 500
from public.accounts a
where a.institution = 'NFCU' and a.kind = 'checking'
  and not exists (select 1 from public.accounts x where x.user_id = a.user_id and x.institution = 'DECU')
limit 1;

select 'Savings is set up ✓' as result;
