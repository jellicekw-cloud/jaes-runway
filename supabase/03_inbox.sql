-- =====================================================================
-- Jae's Runway · 03_inbox.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Adds the email Inbox and package tracking. Nothing here deletes data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ORDERS: packages you're waiting on (from emails or added by hand)
-- ---------------------------------------------------------------------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store             text not null,
  order_number      text,
  items             text,                                 -- "Echo Dot, 2 phone cases"
  total             numeric(12,2),
  ordered_on        date,
  status            text not null default 'ordered'
                    check (status in ('ordered', 'shipped', 'out_for_delivery', 'delivered', 'delayed', 'cancelled')),
  carrier           text,
  tracking_number   text,
  expected_on       date,                                 -- store's estimate; null = no date yet
  delayed_from      date,                                 -- the day it was expected before a delay email
  delivered_on      date,
  delivered_time    time,
  afterpay_order_id uuid references public.afterpay_orders(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index orders_user_status on public.orders (user_id, status);
create unique index orders_user_store_number on public.orders (user_id, lower(store), order_number) where order_number is not null;

-- ---------------------------------------------------------------------
-- INBOX: every email forwarded to Runway (or pasted in)
-- status: reading → review (ready to add) | unsure (take a look) | auto (updated an order by itself)
--         → added | skipped | merged (folded into another card) | error
-- ---------------------------------------------------------------------
create table public.inbox_emails (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source          text not null default 'forward' check (source in ('forward', 'paste')),
  message_id      text,                                   -- stops the same email being read twice
  from_name       text,
  from_address    text,
  subject         text,
  sent_at         timestamptz,
  body            text not null default '',
  status          text not null default 'reading'
                  check (status in ('reading', 'review', 'unsure', 'auto', 'added', 'skipped', 'merged', 'error')),
  kind            text,                                   -- order | shipping | afterpay | afterpay_payment | appointment | trip | gmail_confirm | other
  summary         text,                                   -- one line from the AI
  suggestion      jsonb not null default '{}'::jsonb,     -- what it found: order, afterpay, appointment, trip_item
  order_id        uuid references public.orders(id) on delete set null,
  error           text,
  handled_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index inbox_user_status on public.inbox_emails (user_id, status, created_at desc);
create unique index inbox_user_message on public.inbox_emails (user_id, message_id) where message_id is not null;

-- Same security as every other table: only you can see or change your rows
do $$
declare t text;
begin
  foreach t in array array['orders', 'inbox_emails'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Owner can do everything" on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- Done. Next: set up the email reader (see INBOX_SETUP.md).
