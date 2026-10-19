-- =====================================================================
-- Jae's Runway · 01_schema.sql
-- Paste into Supabase → SQL Editor → New query → Run.
-- Creates every table, the "only you can see your rows" security rules,
-- auto-updated timestamps, and journal search.
-- Safe to read top to bottom: nothing here deletes data.
-- =====================================================================

-- Fuzzy search on journal text (also finds emoji and partial words)
create extension if not exists pg_trgm with schema extensions;

-- Keeps updated_at current on every edit
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- SETTINGS (one row per user)
-- ---------------------------------------------------------------------
create table public.settings (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name    text not null default 'Jae',
  timezone        text not null default 'America/New_York',
  week_starts_on  smallint not null default 1 check (week_starts_on between 0 and 6),  -- 1 = Monday
  pay_start       date,                                                                -- first payday on the schedule
  pay_every_days  integer not null default 14 check (pay_every_days > 0),
  hide_balances   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- MONEY: bank accounts, paycheck, cards, bills, subscriptions, Afterpay
-- ---------------------------------------------------------------------
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,                         -- "SoFi Checking"
  institution     text,                                  -- "SoFi"
  kind            text not null default 'checking' check (kind in ('checking', 'savings', 'vault')),
  balance         numeric(12,2),
  balance_as_of   timestamptz,
  role_note       text,                                  -- "Bills & subscriptions"
  sort            smallint not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- How each paycheck splits across accounts (the usual amounts)
create table public.paycheck_splits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id      uuid not null references public.accounts(id) on delete cascade,
  amount          numeric(12,2) not null check (amount >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, account_id)
);

-- What actually landed on a given payday (history; optional per payday)
create table public.paychecks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pay_date        date not null,
  account_id      uuid not null references public.accounts(id) on delete cascade,
  amount          numeric(12,2) not null check (amount >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, pay_date, account_id)
);

create table public.cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  last4           text check (last4 is null or last4 ~ '^[0-9]{4}$'),   -- never store full numbers
  due_day         smallint not null check (due_day between 1 and 31),
  balance         numeric(12,2),
  credit_limit    numeric(12,2),
  minimum_payment numeric(12,2),
  apr             numeric(5,2),
  autopay         boolean not null default false,
  color           text not null default '#6D28D9',
  tracking_since  date not null default current_date,  -- no "overdue" before this date
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Other monthly bills (rent, phone, car...)
create table public.bills (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  due_day         smallint not null check (due_day between 1 and 31),
  amount          numeric(12,2),
  account_id      uuid references public.accounts(id) on delete set null,
  autopay         boolean not null default false,
  color           text not null default '#F97316',
  tracking_since  date not null default current_date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  amount          numeric(12,2) not null check (amount >= 0),
  cycle           text not null default 'monthly' check (cycle in ('weekly', 'monthly', 'yearly')),
  charge_day      smallint not null check (charge_day between 1 and 31),     -- day of month (weekly: 0-6 not used)
  charge_month    smallint check (charge_month between 1 and 12),            -- yearly only
  account_id      uuid references public.accounts(id) on delete set null,   -- charges a bank account...
  card_id         uuid references public.cards(id) on delete set null,      -- ...or a card, never both
  category        text not null default 'Subscription',
  trial_ends      date,
  started_on      date not null default current_date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (num_nonnulls(account_id, card_id) <= 1),
  check (cycle <> 'yearly' or charge_month is not null)
);

create table public.afterpay_orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  total           numeric(12,2) not null check (total > 0),
  order_date      date not null default current_date,
  installments    smallint not null default 4 check (installments between 1 and 12),
  interval_days   smallint not null default 14 check (interval_days > 0),
  account_id      uuid references public.accounts(id) on delete set null,
  card_id         uuid references public.cards(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (num_nonnulls(account_id, card_id) <= 1)
);

-- "Mark paid" for cards, bills and Afterpay installments
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id           uuid references public.cards(id) on delete cascade,
  bill_id           uuid references public.bills(id) on delete cascade,
  afterpay_order_id uuid references public.afterpay_orders(id) on delete cascade,
  installment_no    smallint,
  due_date          date not null,
  amount            numeric(12,2) not null check (amount > 0),   -- what you actually paid
  paid_on           date not null default current_date,
  account_id        uuid references public.accounts(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (num_nonnulls(card_id, bill_id, afterpay_order_id) = 1),
  check (afterpay_order_id is null or installment_no is not null)
);
create unique index payments_card_due     on public.payments (card_id, due_date)              where card_id is not null;
create unique index payments_bill_due     on public.payments (bill_id, due_date)              where bill_id is not null;
create unique index payments_afterpay_inst on public.payments (afterpay_order_id, installment_no) where afterpay_order_id is not null;

-- Spending log: purchases you enter, plus auto-logged subscriptions & Afterpay
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on       date not null default current_date,
  amount            numeric(12,2) not null check (amount > 0),
  description       text not null,
  category          text not null default 'Other',
  account_id        uuid references public.accounts(id) on delete set null,
  card_id           uuid references public.cards(id) on delete set null,
  source            text not null default 'manual' check (source in ('manual', 'subscription', 'afterpay', 'bill', 'savings')),
  subscription_id   uuid references public.subscriptions(id) on delete set null,
  afterpay_order_id uuid references public.afterpay_orders(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (num_nonnulls(account_id, card_id) <= 1)
);
-- A subscription can only auto-log once per charge date
create unique index transactions_sub_once on public.transactions (subscription_id, occurred_on) where subscription_id is not null;
create index transactions_user_date on public.transactions (user_id, occurred_on desc);

-- ---------------------------------------------------------------------
-- SAVINGS CHALLENGE
-- ---------------------------------------------------------------------
create table public.savings_challenges (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  start_date      date not null,
  every_days      smallint not null default 14 check (every_days > 0),
  deposit_count   smallint not null check (deposit_count > 0),
  first_amount    numeric(12,2) not null,
  step_amount     numeric(12,2) not null default 0,     -- -4 = each deposit is $4 less
  from_account_id uuid references public.accounts(id) on delete set null,
  to_account_id   uuid references public.accounts(id) on delete set null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.savings_deposits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  challenge_id    uuid not null references public.savings_challenges(id) on delete cascade,
  deposit_no      smallint not null check (deposit_no > 0),
  amount          numeric(12,2) not null check (amount > 0),
  saved_on        date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (challenge_id, deposit_no)
);

-- ---------------------------------------------------------------------
-- JOURNAL
-- ---------------------------------------------------------------------
create table public.journal_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date      date not null,                       -- your calendar day, not a timestamp
  body            text not null default '',
  mood            text check (mood is null or mood in ('happy', 'loved', 'neutral', 'sad', 'tired', 'sick', 'stressed')),
  search          tsvector generated always as (to_tsvector('english', coalesce(body, ''))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, entry_date)                          -- one entry per day
);
create index journal_search_words on public.journal_entries using gin (search);
create index journal_search_text  on public.journal_entries using gin (body extensions.gin_trgm_ops);

create table public.tags (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  color           text not null default '#6D28D9',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index tags_unique_name on public.tags (user_id, lower(name));   -- no "Work" and "work"

create table public.entry_tags (
  entry_id        uuid not null references public.journal_entries(id) on delete cascade,
  tag_id          uuid not null references public.tags(id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (entry_id, tag_id)
);

-- ---------------------------------------------------------------------
-- CALENDAR EVENTS & TO-DOS
-- ---------------------------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title           text not null,
  event_date      date not null,
  start_time      time,                                 -- local wall-clock time
  end_time        time,
  location        text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index events_user_date on public.events (user_id, event_date);

create table public.todos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text            text not null,
  due_date        date,                                 -- null = anytime
  done_at         timestamptz,
  repeat          text not null default 'none' check (repeat in ('none', 'weekly', 'monthly', 'quarterly', 'yearly')),
  repeated_from   uuid references public.todos(id) on delete set null,
  sort            integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (repeat = 'none' or due_date is not null)
);
create index todos_user_due on public.todos (user_id, due_date) where done_at is null;

-- ---------------------------------------------------------------------
-- TRIPS
-- ---------------------------------------------------------------------
create table public.people (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  color            text not null default '#6D28D9',
  passport_expires date,                                -- expiration only, never the number
  is_self          boolean not null default false,
  sort             smallint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.trips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  destination      text,
  start_date       date,
  end_date         date,
  status           text not null default 'idea' check (status in ('idea', 'planning', 'booked', 'done')),
  is_international boolean not null default false,
  budget           numeric(12,2),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.trip_travelers (
  trip_id          uuid not null references public.trips(id) on delete cascade,
  person_id        uuid not null references public.people(id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (trip_id, person_id)
);

-- Flights, hotel, car, drives, dinners, tours. Dates/times are LOCAL to
-- where they happen, so they read exactly like the boarding pass.
create table public.trip_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id          uuid not null references public.trips(id) on delete cascade,
  kind             text not null check (kind in ('flight', 'hotel', 'car', 'drive', 'food', 'event', 'other')),
  item_date        date not null,
  item_time        time,
  end_date         date,
  end_time         time,
  title            text not null,
  details          text,
  confirmation     text,
  cost             numeric(12,2),
  cost_due_on      date,                                -- e.g. pay-at-hotel on checkout day
  account_id       uuid references public.accounts(id) on delete set null,
  card_id          uuid references public.cards(id) on delete set null,
  -- flight-only fields
  airline          text,
  flight_number    text,
  origin           text,                                -- airport code, e.g. ATL
  destination      text,                                -- airport code, e.g. MSY
  pass_type        text check (pass_type in ('standby', 'award', 'ticket')),   -- standby / award certificate / bought
  flight_status    text check (flight_status in ('listed', 'cleared', 'confirmed', 'missed')),
  alternates       jsonb not null default '[]'::jsonb,  -- backup flights: [{"time":"10:40","flight":"DL123"}]
  sort             smallint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (num_nonnulls(account_id, card_id) <= 1),
  check (kind = 'flight' or (pass_type is null and flight_status is null))
);
create index trip_items_trip_date on public.trip_items (trip_id, item_date, item_time);

-- Who is on which flight (standby families can get split up)
create table public.trip_item_travelers (
  item_id          uuid not null references public.trip_items(id) on delete cascade,
  person_id        uuid not null references public.people(id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (item_id, person_id)
);

create table public.packing_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id          uuid not null references public.trips(id) on delete cascade,
  text             text not null,
  packed           boolean not null default false,
  sort             smallint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SECURITY: row-level security on every table.
-- Signed-in you can read/write only rows with your user_id.
-- Anyone not signed in sees nothing at all.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  all_tables text[] := array[
    'settings', 'accounts', 'paycheck_splits', 'paychecks', 'cards', 'bills', 'subscriptions',
    'afterpay_orders', 'payments', 'transactions', 'savings_challenges', 'savings_deposits',
    'journal_entries', 'tags', 'entry_tags', 'events', 'todos',
    'people', 'trips', 'trip_travelers', 'trip_items', 'trip_item_travelers', 'packing_items'
  ];
  join_tables text[] := array['entry_tags', 'trip_travelers', 'trip_item_travelers'];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Owner can do everything" on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    if not (t = any (join_tables)) then
      execute format(
        'create trigger set_updated_at before update on public.%I '
        'for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end;
$$;

-- Done. Next: create your login (Authentication → Users), then run 02_seed.sql.
