-- =====================================================================
-- Jae's Runway · 05_money_in.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Money that comes in besides your paycheck: side work, Zelle, refunds, gifts.
-- Also sets up Side work as expected on the 15th and 30th into SoFi.
-- Nothing here deletes data.
-- =====================================================================

-- Money you expect on set days of the month (side work: 15th and 30th).
-- A day of 29–31 falls on the last day in shorter months, same as bills.
create table public.income_sources (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  account_id       uuid references public.accounts(id) on delete set null,
  days             smallint[] not null default '{}',
  expected_amount  numeric(12,2) check (expected_amount is null or expected_amount > 0),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Every deposit that isn't your paycheck
create table public.income (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  received_on       date not null default current_date,
  amount            numeric(12,2) not null check (amount > 0),
  kind              text not null default 'other' check (kind in ('side_work', 'zelle', 'refund', 'gift', 'other')),
  from_name         text,                                   -- who or where it came from
  account_id        uuid references public.accounts(id) on delete set null,
  income_source_id  uuid references public.income_sources(id) on delete set null,
  expected_on       date,                                   -- the 15th/30th this deposit is for
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index income_user_date on public.income (user_id, received_on desc);
create unique index income_once_per_expected on public.income (income_source_id, expected_on)
  where income_source_id is not null and expected_on is not null;

do $$
declare t text;
begin
  foreach t in array array['income_sources', 'income'] loop
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

-- Side work: 15th and 30th, into SoFi
insert into public.income_sources (user_id, name, account_id, days)
select s.user_id, 'Side work',
       (select a.id from public.accounts a where a.user_id = s.user_id and a.kind = 'checking' and a.institution ilike 'sofi%' order by a.sort limit 1),
       '{15,30}'
from public.settings s;

-- Done.
