-- =====================================================================
-- Jae's Runway · 07_alerts.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Phone notifications: which phone to send to, your choices, and a log so nothing is sent twice.
-- (The every-15-minutes schedule is a separate, personal script: 07b_alerts_schedule.sql.)
-- Nothing here deletes data.
-- =====================================================================

-- Your choices (one row, on your settings)
alter table public.settings
  add column alert_morning      boolean not null default true,
  add column alert_morning_at   time    not null default '07:00',
  add column alert_inbox        boolean not null default true,
  add column alert_bills        boolean not null default true,
  add column alert_side_work    boolean not null default true,
  add column alert_packages     boolean not null default false,
  add column alert_trips        boolean not null default false,
  add column alert_dates        boolean not null default false,
  add column quiet_from         time    not null default '22:00',
  add column quiet_until        time    not null default '07:00';

-- The phone(s) that said "Allow notifications"
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  device      text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

-- Every alert sent, by a key like "morning:2026-10-23" or "bills:2026-10-24", so each goes out once
create table public.alert_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key       text not null,
  title     text,
  body      text,
  sent_at   timestamptz not null default now(),
  unique (user_id, key)
);

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'alert_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Owner can do everything" on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- The email reader keeps its notification signing keys here. No policies: only the server can read it.
create table public.app_keys (
  name        text primary key,
  value       text not null,
  created_at  timestamptz not null default now()
);
alter table public.app_keys enable row level security;

-- Done. Next: 07b_alerts_schedule.sql (the personal one), then turn alerts on in Runway.
