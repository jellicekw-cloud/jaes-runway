# Setting up Runway's Inbox

Emails you forward from Gmail go to a free CloudMailin address. CloudMailin hands each one to Runway's
email reader (a Supabase Edge Function). Claude reads it, and it shows up in Runway's Inbox for you to add.
Shipping, delay and delivery emails for orders you've already added update on their own.

About 20 minutes, in this order. Keep two things handy: your **Anthropic API key** and a **new long password**
for the reader (step 2).

---

## 1. Add the Inbox tables (Supabase)

Supabase → **SQL Editor** → **New query** → paste all of `supabase/03_inbox.sql` → **Run**.
It should say *Success. No rows returned.*

## 2. Make the reader's password

Use any password generator to make one **32+ characters, letters and numbers only** (no symbols. It goes in a web
address). Save it with your API key. This is the `INBOX_SECRET`.

## 3. Add the secrets (Supabase)

Supabase → **Edge Functions** → **Secrets** → add these three, one at a time:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com (starts `sk-ant-`) |
| `INBOX_SECRET` | the password from step 2 |
| `FORWARD_FROM` | your Gmail address. Add more with commas if other accounts will forward too |

These stay on Supabase's servers. They never go in GitHub or the app.

## 4. Create the email reader (Supabase)

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly **`runway-inbox`**.
3. Delete the sample code, paste **all** of `supabase/functions/runway-inbox/index.ts`, and click **Deploy**.
4. Open the function's **Details** (or **Settings**) and turn **OFF** "Enforce JWT verification" (also called *Verify JWT*). Save.
   CloudMailin can't sign in to Supabase, so the reader checks things itself: CloudMailin must know the
   `INBOX_SECRET`, emails must come from your `FORWARD_FROM` address, and the app must be signed in as you.
5. Copy the function's URL. It looks like `https://YOURPROJECT.supabase.co/functions/v1/runway-inbox`.

## 5. Get Runway's email address (CloudMailin)

1. Sign up free at cloudmailin.com.
2. Create an address. It gives you one like `a1b2c3d4@cloudmailin.net`. **Copy it.**
3. Set the **Target URL** to the function URL plus your password:
   `https://YOURPROJECT.supabase.co/functions/v1/runway-inbox?key=YOUR_INBOX_SECRET`
4. Set **POST format** to **JSON (Normalized)**. Save.

## 6. Connect Gmail

1. Gmail → ⚙ → **See all settings** → **Forwarding and POP/IMAP** → **Add a forwarding address** → paste the
   CloudMailin address → Next → Proceed.
2. Gmail emails a confirmation code to that address. **Open Runway → Inbox**: a "Gmail forwarding code" card
   shows the code. Type it into Gmail → **Verify**.
3. Leave Gmail's main forwarding switch on **"Disable forwarding"**. The filters below do the forwarding,
   so only the emails you pick go to Runway.
4. Make a filter: click the ☰ slider in Gmail's search bar → in **From** type
   `amazon.com OR ae.com OR bananarepublic.com OR afterpay.com`
   → **Create filter** → check **Forward it to** → pick the CloudMailin address → **Create filter**.
5. Repeat for travel and appointments, using part of the sender's address (for example `delta.com`,
   `hilton.com`, or your doctor's office email).

Filters only forward **new** emails. To bring in one you already have, open it, copy the whole thing, and use
**Inbox → Paste an email**.

## 7. Test it

Forward any recent order email to the CloudMailin address yourself. Within about 10 seconds it should show up in
Runway's Inbox (the Inbox pill on desktop, the Inbox card on phone Home).

## If something's off

- **Nothing shows up:** check CloudMailin's message log. A 401 means the `?key=` doesn't match `INBOX_SECRET`.
  "ignored" means it didn't come from your `FORWARD_FROM` address.
- **"Couldn't read this one: Claude API 401"**: the API key is wrong. **402 or 400 about credit**: add credit in the Console.
  Fix it, then tap **Try again** on the card.
- **Paste says it can't reach the email reader:** step 4 isn't deployed yet, or the name isn't exactly `runway-inbox`.
- Emails over 512 KB (usually ones with PDF attachments) bounce at CloudMailin. Use Paste for those.

## What it costs

CloudMailin: free up to 10,000 emails a month. Claude (Haiku): a fraction of a cent per email. Set a monthly
spend limit in the Anthropic Console so it can never surprise you.
