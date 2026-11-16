-- =====================================================================
-- Jae's Runway · 20_budget.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- The monthly Budget page: what you budget per line each month, which
-- category a line goes in, a note per month, Fidelity (tracking only),
-- and the Lizella mortgage + HOA bills. Nothing here deletes data.
-- =====================================================================

-- What you budgeted for a line in a month (lines with no row use the usual amount)
create table if not exists public.budget_amounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month       date not null,               -- first day of the month
  line_key    text not null,               -- bill:<id>, card:<id>, sub:<id>, spend:Food, cash, save:challenge ...
  amount      numeric(12,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (user_id, month, line_key)
);

-- A line you moved to another category
create table if not exists public.budget_line_cats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  line_key    text not null,
  category    text not null check (category in ('House', 'Food', 'Utilities', 'Transportation', 'Life Insurance', 'Credit Cards',
                                                 'Streaming Services', 'Miscellaneous Expenses', 'Savings Contributions')),
  unique (user_id, line_key)
);

-- A note for the month (like "Add'l income info" on your sheet)
create table if not exists public.budget_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month       date not null,
  note        text not null default '',
  unique (user_id, month)
);

do $$
declare t text;
begin
  foreach t in array array['budget_amounts', 'budget_line_cats', 'budget_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner can do everything" on public.%I', t);
    execute format('create policy "Owner can do everything" on public.%I for all to authenticated '
                   'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Accounts can now be "invest" (tracking only: never counted anywhere)
alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check check (kind in ('checking', 'savings', 'vault', 'cash', 'stash', 'invest'));

insert into public.accounts (user_id, name, institution, kind, role_note, sort)
select s.user_id, 'Fidelity', 'Fidelity', 'invest', 'Tracking only', 8
from public.settings s
where not exists (select 1 from public.accounts x where x.user_id = s.user_id and x.kind = 'invest');

-- Lizella mortgage ($300) and HOA ($75), monthly from NFCU.
-- Due on the 1st until you set the real day on the Bills tab; tracked from December.
insert into public.bills (user_id, name, due_day, amount, account_id, color, tracking_since)
select s.user_id, b.name, 1, b.amount,
       (select a.id from public.accounts a where a.user_id = s.user_id and a.kind = 'checking' and a.institution = 'NFCU' limit 1),
       b.color, date '2026-12-01'
from public.settings s
cross join (values ('Lizella Mortgage', 300.00, '#22405F'), ('HOA', 75.00, '#0F766E')) as b(name, amount, color)
where not exists (select 1 from public.bills x where x.user_id = s.user_id and lower(x.name) = lower(b.name));

select 'Budget is set up ✓' as result;
