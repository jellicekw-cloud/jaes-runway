import { supabase } from './supabase'
import { addDays, daysBetween } from './dates'

// Cycle tracking: period days on the calendar and a rough estimate of the next one.
// Cycles that change a lot (like heading toward menopause) get a wider range, not a single date.
// Estimates only: not for birth control.

export interface Period { id: string; start_date: string; end_date: string | null }

/** If "Ended" never gets tapped, assume about this many days so the calendar doesn't fill up. */
const OPEN_DAYS = 7

export async function loadPeriods(): Promise<Period[] | null> {
  const { data, error } = await supabase.from('periods').select('id, start_date, end_date').order('start_date', { ascending: false }).limit(24)
  if (error) return null   // 18_cycle.sql not run yet
  return (data ?? []) as Period[]
}

/** Last day of a period (an open one runs through today, up to a week). */
export function periodEnd(p: Period, today: string): string {
  if (p.end_date) return p.end_date
  const cap = addDays(p.start_date, OPEN_DAYS - 1)
  return today < cap ? (today < p.start_date ? p.start_date : today) : cap
}

export const periodOn = (list: Period[], k: string, today: string) => list.find((p) => p.start_date <= k && k <= periodEnd(p, today))

export interface CycleStats {
  last: Period | null; day: number | null; open: boolean
  cycles: number; avg: number | null; min: number | null; max: number | null; changing: boolean
  from: string | null; to: string | null     // the estimated window for the next one
  late: number | null                        // days past the window, if any
}

export function cycleStats(list: Period[], today: string): CycleStats {
  const starts = [...list].map((p) => p.start_date).filter((s) => s <= today).sort()
  const last = list.find((p) => p.start_date === starts[starts.length - 1]) ?? null
  const lengths: number[] = []
  for (let i = Math.max(1, starts.length - 6); i < starts.length; i++) {
    const n = daysBetween(starts[i - 1], starts[i])
    if (n >= 15 && n <= 120) lengths.push(n)
  }
  const day = last ? daysBetween(last.start_date, today) + 1 : null
  const open = Boolean(last && !last.end_date && daysBetween(last.start_date, today) < OPEN_DAYS)
  if (!last || !lengths.length) {
    return { last, day, open, cycles: lengths.length, avg: null, min: null, max: null, changing: false, from: null, to: null, late: null }
  }
  const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
  let min = Math.min(...lengths), max = Math.max(...lengths)
  if (lengths.length === 1) { min = avg - 4; max = avg + 4 }
  if (max - min < 4) { min = avg - 2; max = avg + 2 }
  const from = addDays(last.start_date, min), to = addDays(last.start_date, max)
  const late = today > to ? daysBetween(to, today) : null
  return { last, day, open, cycles: lengths.length, avg, min, max, changing: Math.max(...lengths) - Math.min(...lengths) > 7, from, to, late }
}

/** In the estimated window (future days only)? */
export const expectedOn = (s: CycleStats, k: string, today: string) => Boolean(s.from && s.to && k > today && k >= s.from && k <= s.to)

export async function startPeriod(date: string): Promise<void> {
  const { error } = await supabase.from('periods').upsert({ start_date: date }, { onConflict: 'user_id,start_date' })
  if (error) throw error
}
export async function endPeriod(id: string, date: string): Promise<void> {
  const { error } = await supabase.from('periods').update({ end_date: date }).eq('id', id)
  if (error) throw error
}
export async function deletePeriod(id: string): Promise<void> {
  const { error } = await supabase.from('periods').delete().eq('id', id)
  if (error) throw error
}
