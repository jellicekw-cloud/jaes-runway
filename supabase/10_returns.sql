-- =====================================================================
-- Jae's Runway · 10_returns.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Returns and refunds: track a return from "started" to "refund landed",
-- and put the refund back where you paid. Nothing here deletes data.
-- =====================================================================

-- How an order was paid ('a:<account id>', 'c:<card id>'), so its refund knows where to go
alter table public.orders add column if not exists pay_with text;

-- One row per return (a return can be part of an order: just the items you sent back)
create table public.returns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id        uuid references public.orders(id) on delete set null,
  store           text not null,
  order_number    text,
  items           text,
  amount          numeric(12,2),                 -- the refund you're expecting (or got)
  status          text not null default 'started' check (status in ('started', 'dropped_off', 'refunded')),
  started_on      date not null default current_date,
  drop_off_by     date,                          -- the store's deadline to send it back
  dropped_off_on  date,
  refunded_on     date,
  refund_to       text,                          -- 'a:<account>', 'c:<card>', 'p:<afterpay plan>', 'none' (gift card / store credit)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index returns_user_status on public.returns (user_id, status);
alter table public.returns enable row level security;
create policy "Owner can do everything" on public.returns for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger set_updated_at before update on public.returns for each row execute function public.set_updated_at();

-- Afterpay: a refund comes off the last payments first
alter table public.afterpay_orders add column if not exists refunded numeric(12,2) not null default 0;

-- Refunds go in the spending log as a negative amount, so "spent" is what you really kept
alter table public.transactions drop constraint if exists transactions_amount_check;
alter table public.transactions add constraint transactions_amount_check check (amount <> 0);

select 'Returns are set up ✓' as result;
