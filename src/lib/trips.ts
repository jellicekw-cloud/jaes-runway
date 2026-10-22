import { supabase } from './supabase'
import { addDays, daysBetween } from './dates'

// Trips: a container of flights, hotel, car, drives and plans, plus who's going and what to pack.
// Item dates and times are LOCAL to where they happen, so they read like the boarding pass.

export type TripStatus = 'idea' | 'planning' | 'booked' | 'done'
export type ItemKind = 'flight' | 'hotel' | 'car' | 'drive' | 'food' | 'event' | 'other'
export type PassType = 'standby' | 'award' | 'ticket'
export type FlightStatus = 'listed' | 'cleared' | 'confirmed' | 'missed'

export const STATUS_LABEL: Record<TripStatus, string> = { idea: 'Idea', planning: 'Planning', booked: 'Booked', done: 'Done' }
export const PASS_LABEL: Record<PassType, string> = { standby: 'Non-rev standby', award: 'Award certificate', ticket: 'Bought ticket' }
export const FLIGHT_STATUS_LABEL: Record<FlightStatus, string> = { listed: 'Listed', cleared: 'Cleared · on board', confirmed: 'Confirmed', missed: 'Didn\'t clear' }
export const KIND_LABEL: Record<ItemKind, string> = { flight: 'Flight', hotel: 'Hotel', car: 'Rental car', drive: 'Drive', food: 'Dinner / food', event: 'Tour / event', other: 'Other' }

export interface Person { id: string; name: string; color: string; passport_expires: string | null; is_self: boolean; sort: number }
export interface Backup { time: string | null; flight: string }

export interface TripItem {
  id: string
  trip_id: string
  kind: ItemKind
  item_date: string
  item_time: string | null
  end_date: string | null
  end_time: string | null
  title: string
  details: string | null
  confirmation: string | null
  cost: number | null
  cost_due_on: string | null
  airline: string | null
  flight_number: string | null
  origin: string | null
  destination: string | null
  pass_type: PassType | null
  flight_status: FlightStatus | null
  alternates: Backup[]
  people: string[]              // who's on this flight
}

export interface PackingItem { id: string; trip_id: string; text: string; packed: boolean; sort: number }

export interface Trip {
  id: string
  name: string
  destination: string | null
  start_date: string | null
  end_date: string | null
  status: TripStatus
  is_international: boolean
  budget: number | null
  notes: string | null
  people: string[]
  items: TripItem[]
  packing: PackingItem[]
  cover: TripCover
}

/** The trip's cover: one of your photos, a place photo from Unsplash, or nothing yet. */
export interface TripCover {
  kind: 'photo' | 'stock' | null
  photo_id: string | null
  url: string | null
  thumb_url: string | null
  credit_name: string | null
  credit_link: string | null
}

export interface TripPhoto {
  id: string; trip_id: string; path: string; thumb_path: string; taken_on: string | null; caption: string | null
  width: number | null; height: number | null; created_at: string
}

export interface TripsData { people: Person[]; trips: Trip[]; photos: TripPhoto[] }
export const EMPTY_TRIPS: TripsData = { people: [], trips: [], photos: [] }

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function sortItems(a: TripItem, b: TripItem) {
  if (a.item_date !== b.item_date) return a.item_date < b.item_date ? -1 : 1
  return (a.item_time ?? '00:00') < (b.item_time ?? '00:00') ? -1 : (a.item_time ?? '') > (b.item_time ?? '') ? 1 : 0
}

export async function loadTrips(): Promise<TripsData> {
  const [people, trips] = await Promise.all([
    supabase.from('people').select('id, name, color, passport_expires, is_self, sort').order('sort').order('created_at'),
    supabase.from('trips')
      .select('*, trip_travelers(person_id), trip_items(*, trip_item_travelers(person_id)), packing_items(id, trip_id, text, packed, sort)')
      .order('start_date', { ascending: true, nullsFirst: false }),
  ])
  if (people.error) throw people.error
  if (trips.error) throw trips.error
  // Photos come from 06_trip_photos.sql; until that's run there are simply none
  const photos = await supabase.from('trip_photos').select('id, trip_id, path, thumb_path, taken_on, caption, width, height, created_at')
    .order('taken_on', { ascending: true, nullsFirst: false }).order('created_at')
  type Raw = Omit<Trip, 'people' | 'items' | 'packing' | 'budget' | 'cover'> & {
    cover_kind?: 'photo' | 'stock' | null; cover_photo_id?: string | null; cover_url?: string | null; cover_thumb_url?: string | null
    cover_credit_name?: string | null; cover_credit_link?: string | null
    budget: unknown
    trip_travelers: { person_id: string }[]
    trip_items: (Omit<TripItem, 'people' | 'cost' | 'alternates'> & { cost: unknown; alternates: unknown; trip_item_travelers: { person_id: string }[] })[]
    packing_items: PackingItem[]
  }
  return {
    people: (people.data ?? []) as Person[],
    trips: ((trips.data ?? []) as unknown as Raw[]).map((t) => ({
      id: t.id, name: t.name, destination: t.destination, start_date: t.start_date, end_date: t.end_date, status: t.status,
      is_international: t.is_international, budget: num(t.budget), notes: t.notes,
      people: (t.trip_travelers ?? []).map((x) => x.person_id),
      items: (t.trip_items ?? []).map((i) => ({
        ...i,
        cost: num(i.cost),
        alternates: Array.isArray(i.alternates) ? (i.alternates as Backup[]) : [],
        people: (i.trip_item_travelers ?? []).map((x) => x.person_id),
      })).sort(sortItems),
      packing: (t.packing_items ?? []).slice().sort((a, b) => a.sort - b.sort || a.text.localeCompare(b.text)),
      cover: {
        kind: t.cover_kind ?? null, photo_id: t.cover_photo_id ?? null, url: t.cover_url ?? null, thumb_url: t.cover_thumb_url ?? null,
        credit_name: t.cover_credit_name ?? null, credit_link: t.cover_credit_link ?? null,
      },
    })),
    photos: photos.error ? [] : (photos.data ?? []) as TripPhoto[],
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Trips whose dates include this day. */
export function tripsOn(d: TripsData, date: string): Trip[] {
  return d.trips.filter((t) => t.start_date && t.end_date && t.start_date <= date && date <= t.end_date && t.status !== 'idea')
}

export interface DayItem { trip: Trip; item: TripItem; part: 'start' | 'end'; time: string | null; label: string }

/** What happens on a day: departures, check-ins, and the second half of hotel stays and car rentals. */
export function itemsOn(d: TripsData, date: string): DayItem[] {
  const out: DayItem[] = []
  for (const t of d.trips) {
    for (const i of t.items) {
      if (i.item_date === date) out.push({ trip: t, item: i, part: 'start', time: i.item_time, label: startLabel(i) })
      if (i.end_date && i.end_date !== i.item_date && i.end_date === date && (i.kind === 'hotel' || i.kind === 'car')) {
        out.push({ trip: t, item: i, part: 'end', time: i.end_time, label: endLabel(i) })
      }
    }
  }
  return out.sort((a, b) => ((a.time ?? '00:00') < (b.time ?? '00:00') ? -1 : 1))
}

function startLabel(i: TripItem): string {
  if (i.kind === 'flight') return [i.origin && i.destination ? `${i.origin} → ${i.destination}` : i.title, i.flight_number].filter(Boolean).join(' · ')
  if (i.kind === 'hotel') return `Check in · ${i.title}`
  if (i.kind === 'car') return `Pick up · ${i.title}`
  return i.title
}

function endLabel(i: TripItem): string {
  return i.kind === 'hotel' ? `Check out · ${i.title}` : `Return · ${i.title}`
}

/** The next trip that hasn't ended (by start date), skipping ideas with no dates. */
export function nextTrip(d: TripsData, today: string): Trip | undefined {
  return d.trips
    .filter((t) => t.start_date && t.end_date && t.end_date >= today && t.status !== 'idea' && t.status !== 'done')
    .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))[0]
}

/** The trip you're on today, if any. */
export function activeTrip(d: TripsData, today: string): Trip | undefined {
  return tripsOn(d, today).find((t) => t.status !== 'done')
}

export function tripDayNumber(t: Trip, date: string): { day: number; of: number } | null {
  if (!t.start_date || !t.end_date) return null
  return { day: daysBetween(t.start_date, date) + 1, of: daysBetween(t.start_date, t.end_date) + 1 }
}

export function tripCost(t: Trip): number {
  return t.items.reduce((s, i) => s + (i.cost ?? 0), 0)
}

/** Many countries want 6+ months left on a passport after you return. */
export function passportProblem(p: Person, t: Trip): 'missing' | 'expired' | 'too-soon' | null {
  if (!t.is_international) return null
  if (!p.passport_expires) return 'missing'
  const back = t.end_date ?? t.start_date
  if (!back) return null
  if (p.passport_expires < back) return 'expired'
  if (daysBetween(back, p.passport_expires) < 183) return 'too-soon'
  return null
}

export function personName(d: TripsData, id: string): string {
  return d.people.find((p) => p.id === id)?.name ?? 'Someone'
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

async function ok<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p
  if (r.error) throw r.error
  return r
}

export async function createTrip(fields: { name: string; destination: string | null; start_date: string | null; end_date: string | null; is_international: boolean; people: string[] }): Promise<string> {
  const { people, ...row } = fields
  const status: TripStatus = row.start_date ? 'planning' : 'idea'
  const r = await ok(supabase.from('trips').insert({ ...row, status }).select('id').single())
  const id = (r.data as { id: string }).id
  if (people.length) await ok(supabase.from('trip_travelers').insert(people.map((person_id) => ({ trip_id: id, person_id }))))
  return id
}

export async function updateTrip(id: string, patch: Partial<Pick<Trip, 'name' | 'destination' | 'start_date' | 'end_date' | 'status' | 'is_international' | 'budget' | 'notes'>>): Promise<void> {
  await ok(supabase.from('trips').update(patch).eq('id', id))
}

export async function deleteTrip(id: string): Promise<void> {
  // Remove the trip's photo files too (the rows go with the trip)
  const pics = await supabase.from('trip_photos').select('path, thumb_path').eq('trip_id', id)
  const files = (pics.data ?? []).flatMap((p) => [p.path, p.thumb_path])
  if (files.length) await supabase.storage.from('trip-photos').remove(files)
  await ok(supabase.from('trips').delete().eq('id', id))
}

export async function setTraveler(tripId: string, personId: string, going: boolean): Promise<void> {
  if (going) await ok(supabase.from('trip_travelers').upsert({ trip_id: tripId, person_id: personId }, { onConflict: 'trip_id,person_id', ignoreDuplicates: true }))
  else await ok(supabase.from('trip_travelers').delete().eq('trip_id', tripId).eq('person_id', personId))
}

export async function addPerson(name: string, color: string, sort: number): Promise<string> {
  const r = await ok(supabase.from('people').insert({ name, color, sort }).select('id').single())
  return (r.data as { id: string }).id
}

export async function setPassport(personId: string, expires: string | null): Promise<void> {
  await ok(supabase.from('people').update({ passport_expires: expires }).eq('id', personId))
}

export type ItemFields = Omit<TripItem, 'id' | 'trip_id' | 'people'>

/** Adds or replaces an itinerary item and who's on it. */
export async function saveItem(tripId: string, fields: ItemFields, people: string[], id?: string): Promise<void> {
  const row = { ...fields, trip_id: tripId }
  let itemId = id
  if (id) await ok(supabase.from('trip_items').update(row).eq('id', id))
  else itemId = ((await ok(supabase.from('trip_items').insert(row).select('id').single())).data as { id: string }).id
  if (fields.kind !== 'flight') return
  await ok(supabase.from('trip_item_travelers').delete().eq('item_id', itemId!))
  if (people.length) await ok(supabase.from('trip_item_travelers').insert(people.map((person_id) => ({ item_id: itemId, person_id }))))
}

export async function deleteItem(id: string): Promise<void> {
  await ok(supabase.from('trip_items').delete().eq('id', id))
}

export async function setFlightStatus(id: string, status: FlightStatus): Promise<void> {
  await ok(supabase.from('trip_items').update({ flight_status: status }).eq('id', id))
}

/** Didn't clear: move to the next backup flight (still listed), or mark it missed when there are none left. */
export async function bumpToBackup(item: TripItem): Promise<Backup | null> {
  const [next, ...rest] = item.alternates
  if (!next) { await setFlightStatus(item.id, 'missed'); return null }
  await ok(supabase.from('trip_items').update({
    item_time: next.time, flight_number: next.flight || item.flight_number, alternates: rest, flight_status: 'listed',
  }).eq('id', item.id))
  return next
}

export const STARTER_PACKING = [
  'ID & employee badge',
  'Phone chargers',
  'Comfy airport outfit',
  'Backup outfit in carry-on (standby)',
  'Toiletries',
  'Medications',
]

export async function addPacking(tripId: string, texts: string[], startSort: number): Promise<void> {
  if (!texts.length) return
  await ok(supabase.from('packing_items').insert(texts.map((text, i) => ({ trip_id: tripId, text, sort: startSort + i }))))
}

export async function togglePacking(p: PackingItem): Promise<void> {
  await ok(supabase.from('packing_items').update({ packed: !p.packed }).eq('id', p.id))
}

export async function deletePacking(id: string): Promise<void> {
  await ok(supabase.from('packing_items').delete().eq('id', id))
}

/** Default dates for a new item: the trip's first day (or today). */
export function defaultItemDate(t: Trip, today: string): string {
  return t.start_date ?? today
}

export function nightsBetween(a: string, b: string): number {
  return Math.max(0, daysBetween(a, b))
}

export { addDays }
