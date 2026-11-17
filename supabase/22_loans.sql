-- =====================================================================
-- Jae's Runway · 22_loans.sql
-- Paste into Supabase → SQL Editor → New query → Run (once; safe to run again).
-- Loan tracker + your new car loan:
--   $24,633.17 at 6.29% for 48 months, $581.79 on the 19th, autopay from NFCU,
--   first payment Dec 19, 2026. Extra payments go straight to principal.
-- The Kia car note stops (this loan replaces it). Nothing is deleted:
-- the Kia bill is just turned off, with its history kept.
-- =====================================================================

create table if not exists public.loans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  principal    numeric(12,2) not null check (principal > 0),
  apr          numeric(6,3) not null check (apr >= 0),
  term_months  smallint not null check (term_months > 0),
  first_due    date not null,
  payment      numeric(12,2) not null check (payment > 0),
  bill_id      uuid references public.bills(id) on delete set null,   -- the monthly payment (shows on the calendar)
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.loan_extra_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id      uuid not null references public.loans(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  paid_on      date not null,
  account_id   uuid references public.accounts(id) on delete set null,   -- the checking account it came from
  created_at   timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['loans', 'loan_extra_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner can do everything" on public.%I', t);
    execute format('create policy "Owner can do everything" on public.%I for all to authenticated '
                   'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- The monthly payment as a bill: $581.79 on the 19th, autopay from NFCU, starting December
insert into public.bills (user_id, name, due_day, amount, account_id, autopay, color, tracking_since)
select a.user_id, 'Car loan', 19, 581.79, a.id, true, '#F59E0B', date '2026-12-01'
from public.accounts a
where a.institution = 'NFCU' and a.kind = 'checking'
  and not exists (select 1 from public.bills x where x.user_id = a.user_id and x.name = 'Car loan');

insert into public.loans (user_id, name, principal, apr, term_months, first_due, payment, bill_id)
select b.user_id, 'Car loan', 24633.17, 6.29, 48, date '2026-12-19', 581.79, b.id
from public.bills b
where b.name = 'Car loan'
  and not exists (select 1 from public.loans x where x.user_id = b.user_id and x.name = 'Car loan');

-- The Kia car note stops (turned off, history kept)
update public.bills set is_active = false
where is_active and name <> 'Car loan' and name ~* '(\mkia\M|car note)';

select 'Car loan is set up ✓ · Kia bills still on: ' ||
       (select count(*) from public.bills where is_active and name <> 'Car loan' and name ~* '(\mkia\M|car note)') as result;
