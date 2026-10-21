-- =====================================================================
-- Jae's Runway · 04_dates.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Birthdays, anniversaries and other dates that come back every year.
-- Nothing here deletes data.
-- =====================================================================

create table public.special_dates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind            text not null default 'birthday' check (kind in ('birthday', 'anniversary', 'memorial', 'other')),
  name            text not null,                          -- "Chicken", "Thor & me", "Grandma"
  month           smallint not null check (month between 1 and 12),
  day             smallint not null check (day between 1 and 31),
  year            smallint check (year between 1900 and 2100),   -- optional: lets Runway show ages / years
  likes           text,                                   -- what they're into, for better gift ideas
  gift_ideas      jsonb not null default '[]'::jsonb,     -- last suggestions: [{title, price, why, search}]
  gift_ideas_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (day <= case month when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end)
);
create index special_dates_user_month on public.special_dates (user_id, month, day);

alter table public.special_dates enable row level security;
create policy "Owner can do everything" on public.special_dates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger set_updated_at before update on public.special_dates
  for each row execute function public.set_updated_at();

-- Done.
