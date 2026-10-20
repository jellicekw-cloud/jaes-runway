import { supabase } from './supabase'
import { addDays, dateOf, keyOf, lastDayOfMonth } from './dates'

// To-dos and calendar events

export type Repeat = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export const REPEAT_LABEL: Record<Repeat, string> = { none: 'Never', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' }

export interface Todo { id: string; text: string; due_date: string | null; done_at: string | null; repeat: Repeat; repeated_from: string | null; created_at: string }
export interface CalEvent { id: string; title: string; event_date: string; start_time: string | null; end_time: string | null; location: string | null; notes: string | null }

export interface Plans { todos: Todo[]; events: CalEvent[] }
export const EMPTY_PLANS: Plans = { todos: [], events: [] }

export async function loadPlans(today: string): Promise<Plans> {
  const since = addDays(today, -120)
  const [todos, events] = await Promise.all([
    // open to-dos, plus ones finished recently (so a checked box doesn't vanish instantly)
    supabase.from('todos').select('id, text, due_date, done_at, repeat, repeated_from, created_at')
      .or(`done_at.is.null,done_at.gte.${addDays(today, -14)}`).order('due_date', { ascending: true, nullsFirst: false }).order('created_at'),
    supabase.from('events').select('id, title, event_date, start_time, end_time, location, notes').gte('event_date', since).order('event_date').order('start_time', { nullsFirst: true }),
  ])
  if (todos.error) throw todos.error
  if (events.error) throw events.error
  return { todos: (todos.data ?? []) as Todo[], events: (events.data ?? []) as CalEvent[] }
}

/** Dated to-dos for a day. Today also collects anything late that isn't done, so nothing slips by. */
export function todosOn(p: Plans, date: string, today: string): Todo[] {
  return p.todos.filter((t) => {
    if (!t.due_date) return false
    if (t.due_date === date) return true
    return date === today && !t.done_at && t.due_date < today
  })
}

export function anytimeTodos(p: Plans, today: string): Todo[] {
  return p.todos.filter((t) => !t.due_date && (!t.done_at || t.done_at.slice(0, 10) >= today))
}

export function eventsOn(p: Plans, date: string): CalEvent[] {
  return p.events.filter((e) => e.event_date === date)
}

export function nextDue(due: string, repeat: Repeat): string {
  const d = dateOf(due)
  if (repeat === 'weekly') return addDays(due, 7)
  const months = repeat === 'monthly' ? 1 : repeat === 'quarterly' ? 3 : repeat === 'yearly' ? 12 : 0
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const day = Math.min(d.getDate(), lastDayOfMonth(keyOf(target)))
  return keyOf(new Date(target.getFullYear(), target.getMonth(), day))
}

/** Checks or unchecks a to-do. Checking a repeating one schedules the next; unchecking removes that next one again. */
export async function toggleTodo(p: Plans, t: Todo): Promise<void> {
  const done = !t.done_at
  const { error } = await supabase.from('todos').update({ done_at: done ? new Date().toISOString() : null }).eq('id', t.id)
  if (error) throw error
  if (t.repeat === 'none' || !t.due_date) return
  if (done) {
    const already = p.todos.some((x) => x.repeated_from === t.id)
    if (!already) {
      const { error: e2 } = await supabase.from('todos').insert({ text: t.text, due_date: nextDue(t.due_date, t.repeat), repeat: t.repeat, repeated_from: t.id })
      if (e2) throw e2
    }
  } else {
    const { error: e3 } = await supabase.from('todos').delete().eq('repeated_from', t.id).is('done_at', null)
    if (e3) throw e3
  }
}

export async function addTodo(fields: { text: string; due_date: string | null; repeat: Repeat }): Promise<void> {
  const { error } = await supabase.from('todos').insert({ ...fields, repeat: fields.due_date ? fields.repeat : 'none' })
  if (error) throw error
}

export async function deleteTodo(id: string): Promise<void> {
  const { error } = await supabase.from('todos').delete().eq('id', id)
  if (error) throw error
}

export async function addEvent(fields: { title: string; event_date: string; start_time: string | null; location: string | null }): Promise<void> {
  const { error } = await supabase.from('events').insert(fields)
  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

/** "15:30:00" → "3:30 PM" */
export function timeLabel(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
