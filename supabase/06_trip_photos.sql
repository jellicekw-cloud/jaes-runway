-- =====================================================================
-- Jae's Runway · 06_trip_photos.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Trip photos (private) and trip cover photos (yours or from Unsplash).
-- Nothing here deletes data.
-- =====================================================================

-- STORAGE START
-- A private photo folder. Each file lives under your user id, and only you can read or change it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Own trip photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own trip photos: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own trip photos: change" on storage.objects for update to authenticated
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own trip photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- STORAGE END

-- One row per photo (the file itself is in storage; a small thumbnail sits next to it)
create table public.trip_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id      uuid not null references public.trips(id) on delete cascade,
  path         text not null,
  thumb_path   text not null,
  taken_on     date,                       -- the day it was taken (from the photo, or the day you added it)
  caption      text,
  width        integer,
  height       integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index trip_photos_trip_day on public.trip_photos (trip_id, taken_on, created_at);

alter table public.trip_photos enable row level security;
create policy "Owner can do everything" on public.trip_photos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger set_updated_at before update on public.trip_photos
  for each row execute function public.set_updated_at();

-- The trip's cover: one of your photos, or a place photo from Unsplash (with its credit)
alter table public.trips
  add column cover_kind          text check (cover_kind in ('photo', 'stock')),
  add column cover_photo_id      uuid references public.trip_photos(id) on delete set null,
  add column cover_url           text,
  add column cover_thumb_url     text,
  add column cover_credit_name   text,
  add column cover_credit_link   text;

-- Done.
