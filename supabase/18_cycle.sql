-- =====================================================================
-- Jae's Runway · 18_cycle.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Cycle tracking: the days of each period, so Runway can show them on the
-- calendar and estimate the next one. Private to your login like everything
-- else. Nothing here deletes data.
-- =====================================================================

create table if not exists public.periods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  start_date  date not null,
  end_date    date,
  created_at  timestamptz not null default now(),
  unique (user_id, start_date),
  check (end_date is null or end_date >= start_date)
);
alter table public.periods enable row level security;
drop policy if exists "Owner can do everything" on public.periods;
create policy "Owner can do everything" on public.periods for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A discreet heads-up in the morning summary (switch in 🔔)
alter table public.settings add column if not exists alert_cycle boolean not null default true;

select 'Cycle tracking is set up ✓' as result;
