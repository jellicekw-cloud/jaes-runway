import { supabase } from './supabase'
import { DAYS, MONTHS, dateOf, daysBetween, shortDate } from './dates'
import { addTodo } from './plans'

// Birthdays, anniversaries and other dates that come back every year.

export type DateKind = 'birthday' | 'anniversary' | 'memorial' | 'other'
export const KIND_ICON: Record<DateKind, string> = { birthday: '🎂', anniversary: '💍', memorial: '🕊️', other: '⭐' }
export const KIND_WORD: Record<DateKind, string> = { birthday: 'Birthday', anniversary: 'Anniversary', memorial: 'Remembering', other: 'Other' }

export interface GiftIdea { title: string; price: number; why: string; search: string }

export interface SpecialDate {
  id: string; kind: DateKind; name: string; month: number; day: number; year: number | null; likes: string | null
  gift_ideas: GiftIdea[]; gift_ideas_at: string | null
}

/** How far ahead the heads-up starts. */
export const HEADS_UP_DAYS = 7

export async function loadSpecialDates(): Promise<SpecialDate[]> {
  const { data, error } = await supabase.from('special_dates')
    .select('id, kind, name, month, day, year, likes, gift_ideas, gift_ideas_at').order('month').order('day')
  if (error) throw error
  return (data ?? []).map((d) => ({ ...d, gift_ideas: Array.isArray(d.gift_ideas) ? d.gift_ideas : [] })) as SpecialDate[]
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const pad = (n: number) => String(n).padStart(2, '0')

/** This date in a given year. Feb 29 falls on Feb 28 in other years. */
export function inYear(d: Pick<SpecialDate, 'month' | 'day'>, year: number): string {
  const day = d.month === 2 && d.day === 29 && !isLeap(year) ? 28 : d.day
  return `${year}-${pad(d.month)}-${pad(day)}`
}

/** The next time it comes around (today counts). */
export function nextOccurrence(d: Pick<SpecialDate, 'month' | 'day'>, today: string): string {
  const y = Number(today.slice(0, 4))
  const k = inYear(d, y)
  return k >= today ? k : inYear(d, y + 1)
}

/** Age they turn / years it's been, on the occurrence in `date`'s year. Null when no year is saved. */
export function yearsOn(d: Pick<SpecialDate, 'year'>, date: string): number | null {
  if (!d.year) return null
  const n = Number(date.slice(0, 4)) - d.year
  return n > 0 ? n : null
}

/** "Bubb turns 12", "Thor & me · 10 years", "Grandma" */
export function headline(d: SpecialDate, date: string): string {
  const n = yearsOn(d, date)
  if (d.kind === 'birthday') return n ? `${d.name} turns ${n}` : `${d.name}'s birthday`
  if (n) return `${d.name} · ${n} year${n === 1 ? '' : 's'}`
  return d.name
}

export function datesOn(list: SpecialDate[], date: string): SpecialDate[] {
  const y = Number(date.slice(0, 4))
  return list.filter((d) => inYear(d, y) === date)
}

export interface Upcoming { d: SpecialDate; date: string; days: number }

/** Everything, soonest first. */
export function upcoming(list: SpecialDate[], today: string): Upcoming[] {
  return list.map((d) => {
    const date = nextOccurrence(d, today)
    return { d, date, days: daysBetween(today, date) }
  }).sort((a, b) => a.days - b.days || a.d.name.localeCompare(b.d.name))
}

/** Within the next week (today included). */
export const comingUp = (list: SpecialDate[], today: string) => upcoming(list, today).filter((u) => u.days <= HEADS_UP_DAYS)

/** "today", "tomorrow", "Sat", "in 9 days · Nov 14" */
export function whenText(u: Upcoming): string {
  if (u.days === 0) return 'today'
  if (u.days === 1) return 'tomorrow'
  if (u.days <= 6) return DAYS[dateOf(u.date).getDay()]
  return `${shortDate(u.date)} · in ${u.days} days`
}

export const monthDayLabel = (d: Pick<SpecialDate, 'month' | 'day'>) => `${MONTHS[d.month - 1]} ${d.day}`

export const giftsMakeSense = (d: SpecialDate) => d.kind !== 'memorial'

export async function saveSpecialDate(fields: Omit<SpecialDate, 'id' | 'gift_ideas' | 'gift_ideas_at'>, id?: string): Promise<void> {
  const row = { ...fields, name: fields.name.trim(), likes: fields.likes?.trim() || null }
  const { error } = id ? await supabase.from('special_dates').update(row).eq('id', id) : await supabase.from('special_dates').insert(row)
  if (error) throw error
}

export async function deleteSpecialDate(id: string): Promise<void> {
  const { error } = await supabase.from('special_dates').delete().eq('id', id)
  if (error) throw error
}

/** Asks Claude (through the runway-inbox function) for a few ideas, $40 and under. */
export async function fetchGiftIdeas(id: string): Promise<GiftIdea[]> {
  const { data, error } = await supabase.functions.invoke('runway-inbox', { body: { action: 'gift_ideas', id } })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) msg = j.error === 'Unknown action' ? 'Update the email reader in Supabase to get gift ideas (see the setup notes).' : j.error
    } catch { /* keep generic */ }
    throw new Error(msg)
  }
  return (data?.ideas ?? []) as GiftIdea[]
}

/** "Get it": a to-do a couple of days before, so there's time to buy it. */
export async function giftToTodo(u: Upcoming, idea: GiftIdea, today: string): Promise<void> {
  const before = u.days >= 3 ? daysBetween(today, u.date) - 2 : 0
  const due = new Date(dateOf(today)); due.setDate(due.getDate() + before)
  const key = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`
  await addTodo({ text: `Gift for ${u.d.name}: ${idea.title} (~$${Math.round(idea.price)})`, due_date: key, repeat: 'none' })
}

export const shopLink = (idea: GiftIdea) => `https://www.amazon.com/s?k=${encodeURIComponent(idea.search || idea.title)}`
