-- =====================================================================
-- Jae's Runway · 08_paydown.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Extra payments toward credit cards (on top of the monthly minimum), and how much
-- of your safe extra Runway should suggest on payday. Nothing here deletes data.
-- =====================================================================

create table public.card_extra_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id      uuid not null references public.cards(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  paid_on      date not null default current_date,
  account_id   uuid references public.accounts(id) on delete set null,   -- the checking account it came from
  created_at   timestamptz not null default now()
);
create index card_extra_user_date on public.card_extra_payments (user_id, paid_on desc);

alter table public.card_extra_payments enable row level security;
create policy "Owner can do everything" on public.card_extra_payments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Share of the safe extra to suggest on payday (40 = 40%)
alter table public.settings add column paydown_share smallint not null default 40 check (paydown_share between 10 and 100);

-- Done.
