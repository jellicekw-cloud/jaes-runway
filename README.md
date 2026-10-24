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
    Trips.tsx          Trips tab, trip details, itinerary form, travel card, trip mode, day panel trip items
    MoneyView.tsx      Money tab: checking balances, savings challenge, paycheck, spending
    PhoneShell.tsx     phone layout: greeting bar, bottom tabs, + button
    PhoneHome.tsx      phone Home: balances, savings, next 3 days, 3-day journal
    MonthView.tsx      month calendar with the selected day below
    icons.tsx          line icons
    LogPurchase.tsx    the + Add window: purchase (SoFi heads-up, Afterpay split), to-do, event
    Plans.tsx          to-do rows, a day's plans, the anytime to-do card
    JournalEditor.tsx  write a day: mood, tags, timestamps, emojis, autosave
    JournalSearch.tsx  header search across journal text and tags
  lib/
    journal.ts         journal reads/writes, tags, search
    trips.ts           trips, travelers, itinerary items, standby flow, packing, passports
    money.ts           what's due each day, paydays, balances, savings, spending
    plans.ts           to-dos and events, repeating to-dos
    useIsPhone.ts      switches to the phone layout under 768px wide
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
5. ✅ Phone layout: Home (balances, savings, next 3 days, 3-day journal), month calendar, bottom tabs with +
6. ✅ To-dos (anytime, dated, late roll forward, repeating) and calendar events; + Add: Purchase | To-do | Event
7. ✅ Trips: itinerary (flights, hotel, car, drives, food, events), standby / award certificate flights with backups, who's on each flight, packing, passports, budget; trips on the week, month, day panels and phone Home (travel card + trip mode)
8. ✅ Inbox: forwarded emails (CloudMailin → Supabase Edge Function → Claude) become orders, Afterpay plans, appointments and trip items to review; shipping / delay / delivery emails update orders on their own; Arriving today, package chips on the calendar, paste-an-email. Setup: INBOX_SETUP.md
9. ✅ Birthdays & dates: birthdays (with ages), anniversaries, remembrance and other yearly dates; on the calendar every year; heads-up a week before (phone Home card, desktop pill); gift ideas $40 and under from Claude, "I'll get this" adds a to-do. Setup: run supabase/04_dates.sql, then re-paste the runway-inbox function (gift ideas live there)
10. ✅ Money in: side work (expected 15th and 30th into SoFi, confirm with "It landed"), Zelle (NFCU), refunds, gifts; + Add → Money in; counted in balance estimates; Money tab totals (in vs out this month); Inbox turns Zelle / deposit emails into Money in cards (payroll is skipped). Setup: run supabase/05_money_in.sql, then re-paste the runway-inbox function
11. ✅ Trip photos: private album per trip (shrunk on the phone, sorted by the day taken), viewer with captions / move day / delete, cover from Unsplash or your own photo, covers on the Trips list and Home, photos on trip days. Setup: PHOTOS_SETUP.md
12. ✅ Trip costs with a pay-on day (hotel, car, tours; not flights) count in Due before payday; order cards log the purchase as spending (Paid with: account, card, or don't log)
13. ✅ Phone notifications (Android/Chrome): 7 am summary, Inbox right away, bills the evening before, side work check; quiet hours; 🔔 panel with switches. Setup: ALERTS_SETUP.md
14. ✅ Can I afford it? (phone Home, Money tab): walks each account day by day to the next payday (bills, auto-pay, Afterpay, savings, trip costs, paychecks, expected side work), $250 cushion, suggests the day it fits; Afterpay plan and card % used (30% line)
15. ✅ Card paydown: on payday (and 2 days after) suggests 40% of what's safely extra in NFCU (above the $250 cushion through next payday), highest APR first; I paid it / Not this time; Bills paydown plan (debt-free date, interest, minimums only vs extra each payday, history with Undo). Setup: run supabase/08_paydown.sql
16. ✅ Paydown progress (balance history chart, interest avoided, confetti when a card is paid off or drops under 30%), statement-closing nudge (pay $X to report under 30%; app + morning summary), monthly recap (Home on the 1st–3rd, Money tab, morning summary line). Setup: run supabase/09_progress.sql, re-paste the reader
17. ✅ Returns and refunds: the reader tracks return emails (started, dropped off) on their own and turns refund emails into a card to review; the refund goes back where you paid (card balance down, SoFi/NFCU up, Afterpay comes off the last payments, gift card not counted); Returns list in the Inbox (Dropped off, Refund came, + Start a return, Return on a delivered order); drop-off deadline and late-refund lines in the morning summary; Read again on handled emails. Setup: run supabase/10_returns.sql, re-paste the reader
18. ✅ Money out: "You sent" Zelle / Cash App emails become a Money out card (from NFCU, category Sent to people, with a what-for note); requests and failed payments are filed away. Lyft / Uber receipts are logged automatically under Rides on the card the receipt names (else NFCU), and a ride on a trip's first or last day is added to that trip. Setup: re-paste the reader
8. Later: alerts, "ask it" (can I afford this?), confirmation-email import
