import { supabase } from './supabase'
import type { TripItem } from './trips'

// Standby days: live status of the flight you're listed on, and the next Delta flights on the same route.
// The email reader (Supabase function) asks the flight-data service; see FLIGHTS_SETUP.md.

export interface FlightInfo {
  flight: string; number: string; date: string; sched: string; revised: string | null; departs_utc: string
  terminal: string | null; gate: string | null; status: string; delay_min: number; cancelled: boolean; gone: boolean
}
export interface FlightsAnswer { listed: FlightInfo | null; next: FlightInfo[]; next_day: string | null; cancelled_today: number; checked_at: string }

export class FlightsError extends Error { setup = false }

export async function getFlights(item: TripItem): Promise<FlightsAnswer> {
  const { data, error } = await supabase.functions.invoke('runway-inbox', {
    body: { action: 'flights', origin: item.origin, destination: item.destination, date: item.item_date, flight: item.flight_number ?? '' },
  })
  if (error) {
    let msg = error.message, setup = false
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) { msg = j.error; setup = Boolean(j.setup) }
    } catch { /* keep the generic message */ }
    if (/failed to send|fetch/i.test(msg)) msg = 'Couldn\'t reach the email reader.'
    const e = new FlightsError(msg); e.setup = setup
    throw e
  }
  return data as FlightsAnswer
}

/** Show the live lookup for this flight? Only standby flights, on their day, still waiting to clear, with both airports known. */
export function wantsLiveFlights(item: TripItem, today: string): boolean {
  return item.kind === 'flight' && item.pass_type === 'standby' && (item.flight_status === 'listed' || item.flight_status === 'missed')
    && item.item_date === today && /^[A-Z]{3}$/i.test(item.origin ?? '') && /^[A-Z]{3}$/i.test(item.destination ?? '')
}

/** A Google search for the route (shows Delta's flights and status) — the no-setup backup. */
export const routeSearchUrl = (item: TripItem) =>
  `https://www.google.com/search?q=${encodeURIComponent(`Delta flights ${item.origin} to ${item.destination} today`)}`
