# Jae's Runway

Personal calendar, journal, money and trip planner. React + Vite + TypeScript + Tailwind, Supabase for data and login, Vercel for hosting.

## Setup (one time)

1. **Supabase:** run `supabase/01_schema.sql`, create your login (Authentication → Users), turn off new sign-ups, then run your personal `02_seed.sql` (kept out of this public repo).
2. **Vercel:** import this repo. Under **Settings → Environment Variables** add:
   - `VITE_SUPABASE_URL` – Project URL from Supabase → Project Settings → API
   - `VITE_SUPABASE_ANON_KEY` – the anon / publishable key (never the service_role / secret key)
3. Redeploy. Every push to `main` deploys automatically after that.

## Phone

Open the site in Safari (iPhone) or Chrome (Android) → Share / menu → **Add to Home Screen**. It opens full screen with the Runway icon.

## Layout

```
src/
  App.tsx              login gate + "missing keys" screen
  components/
    AppShell.tsx       header, Week | Bills | Money tabs, + Log, payday / due / overdue pills
    Login.tsx          email + password sign-in
    WeekView.tsx       week of paydays, bills, subscriptions, to-dos, journal
    DayBills.tsx       the selected day's payday, bills due (Mark paid) and auto-pay
    BillsView.tsx      Bills tab: overview, cards, Afterpay, subscriptions, other bills
    MoneyView.tsx      Money tab: checking balances, savings challenge, paycheck, spending
    LogPurchase.tsx    the + Log window (SoFi heads-up, Afterpay split)
    JournalEditor.tsx  write a day: mood, tags, timestamps, emojis, autosave
    JournalSearch.tsx  header search across journal text and tags
  lib/
    journal.ts         journal reads/writes, tags, search
    money.ts           what's due each day, paydays, mark paid / undo, bills data
    supabase.ts        Supabase client (anon key only; row-level security protects data)
    dates.ts           local-calendar date helpers (no UTC day shifts)
    types.ts           row shapes for the database tables
supabase/
  01_schema.sql        all tables + security rules
  (02_seed.sql)        personal setup data: run once in Supabase, kept out of this repo
```

## Build order

1. ✅ Starter: login + week view reading real data
2. ✅ Journal: write, mood, tags, timestamps, autosave, search
3. ✅ Bills: cards, mark paid with actual amount, Afterpay orders, subscriptions, other monthly bills
4. ✅ Money: balances (estimated since last update), paycheck split, savings challenge, purchase log (+ Log), auto-logged subscriptions
5. Phone layout: Home (balances, 3 days, to-dos, journal, travel), bottom tabs
6. To-dos and calendar events
7. Trips: itinerary, standby / award certificate flights, travelers, packing, passports
8. Later: alerts, "ask it" (can I afford this?), confirmation-email import
