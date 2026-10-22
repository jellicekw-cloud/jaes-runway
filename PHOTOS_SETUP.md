# Setting up trip photos

About 10 minutes. Three parts: Supabase, an Unsplash key, and the email reader update.

## 1. Run the photos script (Supabase)

Supabase → **SQL Editor** → **New query** → paste all of `supabase/06_trip_photos.sql` → **Run**.
It should say *Success*. This makes a private photo folder (only you can see it) and adds covers to trips.

## 2. Get a free Unsplash key (for place photos)

1. Go to **unsplash.com/developers** and click **Register as a developer** (sign up with your Gmail).
2. Click **Your apps** → **New Application**. Check the boxes to accept the guidelines.
3. Name it **Jae's Runway**, description "Personal trip planner: cover photos for my trips". Create it.
4. On the app page, scroll to **Keys** and copy the **Access Key** (not the Secret key).

A new app starts in "Demo" mode: 50 searches an hour, which is plenty for one person.

## 3. Save the key (Supabase)

Supabase → **Edge Functions** → **Secrets** → add:

| Name | Value |
|---|---|
| `UNSPLASH_ACCESS_KEY` | the Access Key from step 2 |

## 4. Update the email reader (Supabase)

The place-photo search lives in the same reader. Open
https://raw.githubusercontent.com/jellicekw-cloud/jaes-runway/main/supabase/functions/runway-inbox/index.ts,
copy all of it, then **Edge Functions → runway-inbox → Code** → replace everything → **Deploy**.
Check **Verify JWT with legacy secret** is still **off**.

## Try it

Open a trip → **Add a cover photo** → pick one of the place photos. Then **+ Add photos** further down the trip.

## Good to know

- Photos are shrunk on your phone before upload (about 300 KB each). Supabase's free storage (1 GB) holds roughly 3,000.
- Photos land on the day they were taken (read from the photo). If one lands on the wrong day, open it and pick the right day.
- Unsplash covers show the photographer's name. That's their rule for free use.
- Deleting a trip deletes its photos too.
