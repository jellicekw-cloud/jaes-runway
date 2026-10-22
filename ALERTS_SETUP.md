# Setting up phone notifications

About 5 minutes. Works on Android in Chrome (best from Runway's Home screen icon).

## 1. Run the alerts script (Supabase)

Supabase → **SQL Editor** → **New query** → paste all of `supabase/07_alerts.sql` → **Run**. It should say *Success*.

## 2. Run your personal schedule script (Supabase)

`07b_alerts_schedule.sql` is **not in GitHub** because it contains your reader's password. Claude sends it to you
in the chat. Paste it into a new query and **Run**. It sets a timer that checks for alerts every 5 minutes.

If it says an extension isn't available: **Database → Extensions**, turn on **pg_cron** and **pg_net**, then run it again.

## 3. Update the email reader (Supabase)

Open https://raw.githubusercontent.com/jellicekw-cloud/jaes-runway/main/supabase/functions/runway-inbox/index.ts,
copy all of it, then **Edge Functions → runway-inbox → Code** → replace everything → **Deploy**.
Check **Verify JWT with legacy secret** is still **off**.

## 4. Turn them on (your phone)

1. Open Runway on your phone (from the Home screen icon if you added one).
2. Tap the **🔔 bell** at the top → **Turn on notifications** → **Allow**.
3. Tap **Send a test**. A notification should pop up within a few seconds.

## What you'll get

| Alert | When |
|---|---|
| ☀️ Morning summary | 7:00 am (you can change it): bills due today, packages arriving, birthdays this week, payday, trips, Inbox |
| ✉ Inbox | Right away when a forwarded email needs review |
| 💳 Bills | After 6 pm the evening before something is due and not marked paid |
| 💵 Side work | After 5 pm on the 15th and 30th if you haven't confirmed it landed |

Quiet hours (10 pm to 7 am) hold everything until they end. Each switch is in the 🔔 panel.

## If something's off

- **"Notifications are blocked"**: Chrome → ⋮ → Settings → Site settings → Notifications → allow Runway.
- **Test works but nothing at 7**: check step 2 ran. In SQL Editor: `select * from cron.job_run_details order by start_time desc limit 5;` should show runs every 5 minutes.
- **Nothing at all**: make sure the reader was re-pasted (step 3).
