import { supabase } from './supabase'
import { DAYS, addDays, dateOf, daysBetween, shortDate } from './dates'
import { addAfterpayOrder, billsAccountId, type MoneyData } from './money'
import { timeLabel } from './plans'
import { createTrip, saveItem, type ItemKind, type PassType } from './trips'

// The email Inbox and packages on the way.
// Emails arrive through the runway-inbox Edge Function (forwarded or pasted) and wait here for review.

export type OrderStatus = 'ordered' | 'shipped' | 'out_for_delivery' | 'delivered' | 'delayed' | 'cancelled'
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  ordered: 'Ordered', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', delayed: 'Delayed', cancelled: 'Cancelled',
}

export interface Order {
  id: string; store: string; order_number: string | null; items: string | null; total: number | null; ordered_on: string | null
  status: OrderStatus; carrier: string | null; tracking_number: string | null; expected_on: string | null; delayed_from: string | null
  delivered_on: string | null; delivered_time: string | null; afterpay_order_id: string | null
}

export interface OrderInfo {
  store: string | null; order_number: string | null; items: string | null; total: number | null; ordered_on: string | null
  status: OrderStatus | null; carrier: string | null; tracking_number: string | null; expected_on: string | null
  delivered_on: string | null; delivered_time: string | null; paid_with_afterpay: boolean
}
export interface AfterpayInfo { store: string | null; total: number | null; purchased_on: string | null; first_payment_on: string | null; order_number: string | null }
export interface AppointmentInfo { title: string | null; date: string | null; start_time: string | null; end_time: string | null; location: string | null; notes: string | null }
export interface TripItemInfo {
  trip_id: string | null; kind: ItemKind | null; title: string | null; date: string | null; time: string | null; end_date: string | null; end_time: string | null
  confirmation: string | null; airline: string | null; flight_number: string | null; origin: string | null; destination: string | null; details: string | null; cost: number | null
  pass_type?: PassType | null; new_trip_name?: string | null
}
export interface Suggestion {
  order?: OrderInfo | null; afterpay?: AfterpayInfo | null; appointment?: AppointmentInfo | null; trip_item?: TripItemInfo | null
  link_order_id?: string | null; code?: string | null; link?: string | null
}

export type EmailStatus = 'reading' | 'review' | 'unsure' | 'auto' | 'added' | 'skipped' | 'merged' | 'error'
export type CardKind = 'order' | 'afterpay' | 'appointment' | 'trip'

export interface InboxEmail {
  id: string; source: 'forward' | 'paste'; from_name: string | null; from_address: string | null; subject: string | null; sent_at: string | null
  body: string; status: EmailStatus; kind: string | null; summary: string | null; suggestion: Suggestion; order_id: string | null
  error: string | null; created_at: string; handled_at: string | null
}

export interface InboxData { emails: InboxEmail[]; orders: Order[] }
export const EMPTY_INBOX: InboxData = { emails: [], orders: [] }

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export async function loadInbox(today: string): Promise<InboxData> {
  const [emails, orders] = await Promise.all([
    supabase.from('inbox_emails')
      .select('id, source, from_name, from_address, subject, sent_at, body, status, kind, summary, suggestion, order_id, error, created_at, handled_at')
      .or(`status.in.(reading,review,unsure,error),handled_at.gte.${addDays(today, -7)}`)
      .order('created_at', { ascending: false }).limit(80),
    supabase.from('orders')
      .select('id, store, order_number, items, total, ordered_on, status, carrier, tracking_number, expected_on, delayed_from, delivered_on, delivered_time, afterpay_order_id')
      .or(`status.not.in.(delivered,cancelled),delivered_on.gte.${addDays(today, -1)}`)
      .order('expected_on', { ascending: true, nullsFirst: false }),
  ])
  if (emails.error) throw emails.error
  if (orders.error) throw orders.error
  return {
    emails: (emails.data ?? []).map((e) => ({ ...e, suggestion: e.suggestion ?? {} })) as InboxEmail[],
    orders: (orders.data ?? []).map((o) => ({ ...o, total: num(o.total), delivered_time: o.delivered_time ? String(o.delivered_time).slice(0, 5) : null })) as Order[],
  }
}

export const toReview = (d: InboxData) => d.emails.filter((e) => e.status === 'review').reverse()
export const notSure = (d: InboxData) => d.emails.filter((e) => e.status === 'unsure' || e.status === 'error').reverse()
export const stillReading = (d: InboxData) => d.emails.filter((e) => e.status === 'reading')
export const handled = (d: InboxData) => d.emails
  .filter((e) => ['auto', 'added', 'skipped', 'merged'].includes(e.status))
  .sort((a, b) => (b.handled_at ?? '').localeCompare(a.handled_at ?? ''))
  .slice(0, 15)
export const waitingCount = (d: InboxData) => toReview(d).length + notSure(d).length

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

const ACTIVE: OrderStatus[] = ['ordered', 'shipped', 'out_for_delivery', 'delayed']

/** Not delivered by its day: it moves to today, marked Late. */
export function isLate(o: Order, today: string): boolean {
  return ACTIVE.includes(o.status) && Boolean(o.expected_on) && o.expected_on! < today
}

/** Which calendar day a package shows on. */
export function packageDay(o: Order, today: string): string | null {
  if (o.status === 'cancelled') return null
  if (o.status === 'delivered') return o.delivered_on
  if (o.status === 'out_for_delivery') return today
  if (!o.expected_on) return null
  return o.expected_on < today ? today : o.expected_on
}

export function packagesOn(orders: Order[], date: string, today: string): Order[] {
  return orders.filter((o) => packageDay(o, today) === date || (date === today && o.status === 'delayed' && o.delayed_from === today))
}

/** Arriving today, delivered today, or delayed today (stays until the end of the day so you know why it didn't come). */
export const arrivingToday = (orders: Order[], today: string) => packagesOn(orders, today, today)

/** Everything not here yet, plus what came today. Soonest first; no date last. */
export function onTheWay(orders: Order[], today: string): Order[] {
  return orders
    .filter((o) => ACTIVE.includes(o.status) || (o.status === 'delivered' && o.delivered_on === today))
    .sort((a, b) => (packageDay(a, today) ?? '9999').localeCompare(packageDay(b, today) ?? '9999'))
}

/** "Thu", "today", "tomorrow", or "Nov 3" */
export function when(date: string, today: string): string {
  const n = daysBetween(today, date)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n > 1 && n < 7) return DAYS[dateOf(date).getDay()].slice(0, 3)
  return shortDate(date)
}

export function statusLine(o: Pick<Order, 'status' | 'carrier' | 'expected_on' | 'delivered_on' | 'delivered_time'> & Partial<Order>, today: string): string {
  if (o.status === 'delivered') {
    const at = o.delivered_time ? ` ${timeLabel(o.delivered_time)}` : ''
    return o.delivered_on && o.delivered_on !== today ? `Delivered ${shortDate(o.delivered_on)}` : `Delivered${at}`
  }
  if (o.status === 'cancelled') return 'Cancelled'
  if (o.expected_on && o.expected_on < today && o.status !== 'out_for_delivery') return `Late · was due ${shortDate(o.expected_on)}`
  if (o.status === 'delayed') return o.expected_on ? `Delayed, now ${when(o.expected_on, today)}` : 'Delayed, no new date yet'
  if (o.status === 'out_for_delivery') return 'Out for delivery'
  const by = o.expected_on ? ` · arriving ${when(o.expected_on, today)}` : ''
  if (o.status === 'shipped') return `Shipped${o.carrier ? `, ${o.carrier}` : ''}${by}`
  return `Ordered${by}`
}

export type PackageTone = 'done' | 'late' | 'delayed' | 'go'
export function packageTone(o: Order, today: string): PackageTone {
  if (o.status === 'delivered') return 'done'
  if (isLate(o, today)) return 'late'
  if (o.status === 'delayed') return 'delayed'
  return 'go'
}

export async function markDelivered(o: Order, today: string): Promise<void> {
  const { error } = await supabase.from('orders').update({ status: 'delivered', delivered_on: today, delayed_from: null }).eq('id', o.id)
  if (error) throw error
}

export async function removeOrder(id: string): Promise<void> {
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Reviewing emails
// ---------------------------------------------------------------------------

async function finish(e: InboxEmail, s: Suggestion, kind: string, orderId: string | null = null) {
  const { error } = await supabase.from('inbox_emails')
    .update({ status: 'added', kind, suggestion: s, order_id: orderId ?? e.order_id, handled_at: new Date().toISOString() }).eq('id', e.id)
  if (error) throw error
}

export function needsFixing(kind: CardKind, s: Suggestion, trips: { id: string }[]): string | null {
  if (kind === 'order') {
    if (!s.order?.store?.trim()) return 'Add the store name.'
    if (s.order.paid_with_afterpay) {
      const total = s.afterpay?.total ?? s.order.total
      if (!total || total <= 0) return 'Add the order total for the Afterpay plan.'
    }
  }
  if (kind === 'afterpay') {
    if (!s.afterpay?.store?.trim()) return 'Add the store name.'
    if (!s.afterpay.total || s.afterpay.total <= 0) return 'Add the total.'
  }
  if (kind === 'appointment' && (!s.appointment?.title?.trim() || !s.appointment.date)) return 'Add a name and a date.'
  if (kind === 'trip') {
    const t = s.trip_item
    if (!t?.title?.trim() || !t.date) return 'Add a name and a date.'
    if (!t.trip_id && !t.new_trip_name?.trim()) return 'Pick which trip this goes in.'
    if (t.trip_id && !trips.some((x) => x.id === t.trip_id)) return 'Pick which trip this goes in.'
  }
  return null
}

/** "Add": puts the email's details into Runway and files the email away. Returns a line for the toast. */
export async function addFromEmail(e: InboxEmail, kind: CardKind, s: Suggestion, m: MoneyData, today: string): Promise<string> {
  if (kind === 'order') {
    const o = s.order!
    const status: OrderStatus = o.status ?? 'ordered'
    const ins = await supabase.from('orders').insert({
      store: o.store!.trim(), order_number: o.order_number || null, items: o.items || null, total: o.total, ordered_on: o.ordered_on ?? today,
      status, carrier: o.carrier, tracking_number: o.tracking_number, expected_on: o.expected_on,
      delivered_on: status === 'delivered' ? (o.delivered_on ?? today) : null, delivered_time: status === 'delivered' ? o.delivered_time : null,
    }).select('id').single()
    if (ins.error) {
      if (ins.error.code === '23505') throw new Error('That order number is already in Runway. Skip this one.')
      throw ins.error
    }
    const orderId = (ins.data as { id: string }).id
    let line = `${o.store} added to On the way`
    if (o.paid_with_afterpay) {
      const a = s.afterpay
      const purchased = a?.purchased_on ?? o.ordered_on ?? today
      const apId = await addAfterpayOrder(m, {
        name: o.store!.trim(), total: (a?.total ?? o.total)!, purchased_on: purchased, first_payment: a?.first_payment_on ?? purchased,
        account_id: billsAccountId(m), card_id: null,
      })
      const { error } = await supabase.from('orders').update({ afterpay_order_id: apId }).eq('id', orderId)
      if (error) throw error
      line += ' · Afterpay plan added to Bills'
    }
    await finish(e, s, kind, orderId)
    return line
  }

  if (kind === 'afterpay') {
    const a = s.afterpay!
    const purchased = a.purchased_on ?? today
    const apId = await addAfterpayOrder(m, {
      name: a.store!.trim(), total: a.total!, purchased_on: purchased, first_payment: a.first_payment_on ?? purchased, account_id: billsAccountId(m), card_id: null,
    })
    if (s.link_order_id) {
      const { error } = await supabase.from('orders').update({ afterpay_order_id: apId }).eq('id', s.link_order_id)
      if (error) throw error
    }
    await finish(e, s, kind)
    return `Afterpay plan for ${a.store} added to Bills`
  }

  if (kind === 'appointment') {
    const a = s.appointment!
    const { error } = await supabase.from('events').insert({
      title: a.title!.trim(), event_date: a.date, start_time: a.start_time || null, end_time: a.end_time || null, location: a.location || null, notes: a.notes || null,
    })
    if (error) throw error
    await finish(e, s, kind)
    return `${a.title} added to ${shortDate(a.date!)}`
  }

  const t = s.trip_item!
  const tripId = t.trip_id ?? await createTrip({
    name: t.new_trip_name!.trim(), destination: t.destination, start_date: t.date, end_date: t.end_date ?? t.date, is_international: false, people: [],
  })
  const k: ItemKind = t.kind ?? 'other'
  const pass: PassType | null = k === 'flight' ? (t.pass_type ?? 'ticket') : null
  await saveItem(tripId, {
    kind: k, item_date: t.date!, item_time: t.time || null, end_date: t.end_date || null, end_time: t.end_time || null, title: t.title!.trim(),
    details: t.details || null, confirmation: t.confirmation ? t.confirmation.toUpperCase() : null, cost: t.cost, cost_due_on: null,
    airline: k === 'flight' ? t.airline : null, flight_number: k === 'flight' ? t.flight_number : null,
    origin: k === 'flight' ? t.origin : null, destination: k === 'flight' ? t.destination : null,
    pass_type: pass, flight_status: pass === 'standby' ? 'listed' : pass ? 'confirmed' : null, alternates: [],
  }, [])
  await finish(e, { ...s, trip_item: { ...t, trip_id: tripId } }, kind)
  return `${t.title} added to the trip`
}

export async function setEmailStatus(id: string, status: EmailStatus): Promise<void> {
  const { error } = await supabase.from('inbox_emails').update({ status, handled_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

async function callReader(body: Record<string, unknown>): Promise<{ status: string; summary: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('runway-inbox', { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) msg = j.error
    } catch { /* keep the generic message */ }
    if (/failed to send|fetch/i.test(msg)) msg = 'Couldn\'t reach the email reader. Is it set up in Supabase yet?'
    throw new Error(msg)
  }
  return data
}

export const pasteEmail = (text: string) => callReader({ action: 'paste', text })
export const rereadEmail = (id: string) => callReader({ action: 'reread', id })
