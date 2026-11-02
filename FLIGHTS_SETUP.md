# Live flights on standby days (one-time setup)

On the day of a **non-rev standby** flight, the flight card shows your flight's live
status (gate, delays, cancellations) and the next Delta flights on the same route, with
**List me** to switch. If nothing is left that day, it shows the next morning's flights.
Seats and the standby list stay in your Delta travel app (that's company data).

Runway gets the flight data from **AeroDataBox** (through RapidAPI). It only looks
when a standby flight is today, and each lookup is saved for 10 minutes, so the free plan
goes a long way.

## 1. Get a free key (about 5 minutes)

1. Go to **rapidapi.com** and sign up (signing in with Google is fine).
2. Search for **AeroDataBox** and open it.
3. Open **Pricing** and subscribe to the **Basic** plan ($0). If it asks for a card, the
   Basic plan still costs nothing.
4. Open **Endpoints** (or Playground). On the right, under the request headers, copy the
   value next to **X-RapidAPI-Key**. That's your key.

## 2. Put the key in Supabase

1. Supabase → **Edge Functions** → **Secrets** → **Add new secret**.
2. Name: `AERODATABOX_KEY` · Value: the key you copied. Save.

## 3. Run the SQL and update the reader

1. SQL Editor: run `supabase/14_flights.sql`.
2. Re-paste the reader (`supabase/functions/runway-inbox/index.ts`) and deploy.
   Check that **Verify JWT** is still off.

## Using it

- Make sure the flight has its **From** and **To** airport codes (ATL, MSY) and the
  flight number, and is marked **Non-rev standby**.
- On the day, the card shows **✈ Live**. Tap ↻ to refresh (it also refreshes every 10
  minutes while Runway is open).
- **List me** switches your listing to that flight. The old one is kept in the notes.
- No key yet, or the free lookups ran out for the month? The **Delta flights … on
  Google** link under the list always works.
