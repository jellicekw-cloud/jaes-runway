import { supabase } from './supabase'
import { DAYS, addDays, dateOf, daysBetween, shortDate } from './dates'
import { addAffirmLoan, addAfterpayOrder, addIncome, billsAccountId, defaultIncomeAccount, installmentAmount, logPurchase, type IncomeKind, type MoneyData, type PayWith } from './money'
import { timeLabel } from './plans'
import { createTrip, saveItem, type ItemKind, type PassType } from './trips'
import { SENT_CATEGORY } from './types'

// The email Inbox and packages on the way.
// Emails arrive through the runway-inbox Edge Function (forwarded or pasted) and wait here for review.

export type OrderStatus = 'ordered' | 'shipped' | 'out_for_delivery' | 'delivered' | 'delayed' | 'cancelled'
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  ordered: 'Ordered', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', delayed: 'Delayed', cancelled: 'Cancelled',
}

export interface Order {
  id: string; store: string; order_number: string | null; items: string | null; total: number | null; ordered_on: string | null
  status: OrderStatus; carrier: string | null; tracking_number: string | null; expected_on: string | null; delayed_from: string | null
  delivered_on: string | null; delivered_time: string | null; afterpay_order_id: string | null; pay_with?: string | null
}

export type ReturnStage = 'started' | 'dropped_off' | 'refunded'
export const RETURN_STAGE_LABEL: Record<ReturnStage, string> = { started: 'Return started', dropped_off: 'Dropped off', refunded: 'Refund came' }

/** A return you're tracking (10_returns.sql). */
export interface ReturnRec {
  id: string; order_id: string | null; store: string; order_number: string | null; items: string | null; amount: number | null; status: ReturnStage
  started_on: string; drop_off_by: string | null; dropped_off_on: string | null; refunded_on: string | null; refund_to: string | null
}

/** What the reader found in a return email (or what you typed). */
export interface ReturnInfo {
  stage: ReturnStage | null; store: string | null; order_number: string | null; items: string | null; amount: number | null
  date: string | null; drop_off_by: string | null; refund_method: string | null
  return_id?: string | null; order_id?: string | null; refund_to?: string | null
}

export interface OrderInfo {
  store: string | null; order_number: string | null; items: string | null; total: number | null; ordered_on: string | null
  status: OrderStatus | null; carrier: string | null; tracking_number: string | null; expected_on: string | null
  delivered_on: string | null; delivered_time: string | null; paid_with_afterpay: boolean; paid_with_affirm?: boolean; card_last4?: string | null
  pay_with?: string | null   // set when you review it: 'a:<account id>', 'c:<card id>' or 'none' (don't log as spending)
}
export interface AffirmInfo { store: string | null; payment_amount: number | null; payments: number | null; first_payment_on: string | null; total: number | null; purchased_on: string | null }
export interface AfterpayInfo { store: string | null; total: number | null; purchased_on: string | null; first_payment_on: string | null; order_number: string | null }
export interface AppointmentInfo { title: string | null; date: string | null; start_time: string | null; end_time: string | null; location: string | null; notes: string | null }
export interface TripItemInfo {
  trip_id: string | null; kind: ItemKind | null; title: string | null; date: string | null; time: string | null; end_date: string | null; end_time: string | null
  confirmation: string | null; airline: string | null; flight_number: string | null; origin: string | null; destination: string | null; details: string | null; cost: number | null
  pass_type?: PassType | null; new_trip_name?: string | null
}
export interface MoneyInInfo {
  amount: number | null; from: string | null; received_on: string | null; via: string | null; is_paycheck: boolean; account_hint: string | null
  account_id?: string | null; income_kind?: IncomeKind | null   // set when you review it
}
export interface MoneyOutInfo {
  amount: number | null; to: string | null; sent_on: string | null; via: string | null; note: string | null; account_hint: string | null
  status?: 'sent' | 'requested' | 'failed'
  account_id?: string | null   // set when you review it
}
export const VIA_LABEL: Record<string, string> = { zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo' }
export interface Suggestion {
  order?: OrderInfo | null; afterpay?: AfterpayInfo | null; appointment?: AppointmentInfo | null; trip_item?: TripItemInfo | null; money_in?: MoneyInInfo | null
  ret?: ReturnInfo | null; money_out?: MoneyOutInfo | null; affirm?: AffirmInfo | null; link_order_id?: string | null; code?: string | null; link?: string | null
}

export type EmailStatus = 'reading' | 'review' | 'unsure' | 'auto' | 'added' | 'skipped' | 'merged' | 'error'
export type CardKind = 'order' | 'afterpay' | 'affirm' | 'appointment' | 'trip' | 'money_in' | 'money_out' | 'return'

export interface InboxEmail {
  id: string; source: 'forward' | 'paste'; from_name: string | null; from_address: string | null; subject: string | null; sent_at: string | null
  body: string; status: EmailStatus; kind: string | null; summary: string | null; suggestion: Suggestion; order_id: string | null
  error: string | null; created_at: string; handled_at: string | null
}

export interface InboxData { emails: InboxEmail[]; orders: Order[]; returns: ReturnRec[] }
export const EMPTY_INBOX: InboxData = { emails: [], orders: [], returns: [] }

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export async function loadInbox(today: string): Promise<InboxData> {
  const [emails, orders, returns] = await Promise.all([
    supabase.from('inbox_emails')
      .select('id, source, from_name, from_address, subject, sent_at, body, status, kind, summary, suggestion, order_id, error, created_at, handled_at')
      .or(`status.in.(reading,review,unsure,error),handled_at.gte.${addDays(today, -7)}`)
      .order('created_at', { ascending: false }).limit(80),
    supabase.from('orders')
      .select('*')   // includes pay_with once 10_returns.sql is run
      .or(`status.not.in.(delivered,cancelled),delivered_on.gte.${addDays(today, -1)}`)
      .order('expected_on', { ascending: true, nullsFirst: false }),
    supabase.from('returns')
      .select('id, order_id, store, order_number, items, amount, status, started_on, drop_off_by, dropped_off_on, refunded_on, refund_to')
      .or(`status.neq.refunded,refunded_on.gte.${addDays(today, -7)}`)
      .order('started_on', { ascending: true }),
  ])
  if (emails.error) throw emails.error
  if (orders.error) throw orders.error
  return {
    emails: (emails.data ?? []).map((e) => ({ ...e, suggestion: e.suggestion ?? {} })) as InboxEmail[],
    orders: (orders.data ?? []).map((o) => ({ ...o, total: num(o.total), delivered_time: o.delivered_time ? String(o.delivered_time).slice(0, 5) : null })) as Order[],
    // Before 10_returns.sql is run the table isn't there: no returns yet
    returns: returns.error ? [] : (returns.data ?? []).map((x) => ({ ...x, amount: num(x.amount) })) as ReturnRec[],
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
  if (kind === 'money_in') {
    if (!s.money_in?.amount || s.money_in.amount <= 0) return 'Add the amount.'
    if (!s.money_in.account_id) return 'Pick which account it went into.'
  }
  if (kind === 'affirm') {
    const x = s.affirm
    if (!x?.store?.trim()) return 'Add what it\'s for.'
    if (!x.payment_amount || x.payment_amount <= 0) return 'Add the monthly payment.'
    if (!x.payments || x.payments < 1) return 'Add how many payments.'
    if (!x.first_payment_on) return 'Add the first payment date.'
  }
  if (kind === 'money_out') {
    if (!s.money_out?.amount || s.money_out.amount <= 0) return 'Add the amount.'
    if (!s.money_out.account_id) return 'Pick which account it came out of.'
  }
  if (kind === 'return') {
    const x = s.ret
    if (!x?.store?.trim()) return 'Add the store name.'
    if (x.stage === 'refunded') {
      if (!x.amount || x.amount <= 0) return 'Add the refund amount.'
      if (!x.refund_to) return 'Pick where the refund went.'
    }
  }
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
    const row: Record<string, unknown> = {
      store: o.store!.trim(), order_number: o.order_number || null, items: o.items || null, total: o.total, ordered_on: o.ordered_on ?? today,
      status, carrier: o.carrier, tracking_number: o.tracking_number, expected_on: o.expected_on,
      delivered_on: status === 'delivered' ? (o.delivered_on ?? today) : null, delivered_time: status === 'delivered' ? o.delivered_time : null,
      pay_with: !o.paid_with_afterpay && payWithOf(o.pay_with) ? o.pay_with : null,   // so a refund knows where to go
    }
    let ins = await supabase.from('orders').insert(row).select('id').single()
    if (ins.error && /pay_with/.test(ins.error.message)) {   // 10_returns.sql not run yet
      delete row.pay_with
      ins = await supabase.from('orders').insert(row).select('id').single()
    }
    if (ins.error) {
      if (ins.error.code === '23505') throw new Error('That order number is already in Runway. Skip this one.')
      throw ins.error
    }
    const orderId = (ins.data as { id: string }).id
    let line = `${o.store} added to On the way`
    const pw = payWithOf(o.pay_with)
    if (!o.paid_with_afterpay && pw && o.total) {
      await logPurchase(m, { amount: o.total, description: o.items ? `${o.store!.trim()} · ${o.items}` : o.store!.trim(), category: 'Shopping', date: o.ordered_on ?? today, with: pw })
      line += ` · ${o.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} logged`
    }
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

  if (kind === 'affirm') {
    const x = s.affirm!
    await addAffirmLoan({
      name: x.store!.trim(), payment: x.payment_amount!, payments: x.payments!, first_payment: x.first_payment_on!, total: x.total,
      purchased_on: x.purchased_on ?? today, account_id: billsAccountId(m), card_id: null, logSpending: true,
    })
    await finish(e, s, kind)
    return `Affirm · ${x.payments} × $${x.payment_amount!.toFixed(2)} added to Bills`
  }

  if (kind === 'money_out') {
    const x = s.money_out!
    await logPurchase(m, { amount: x.amount!, description: moneyOutText(x), category: SENT_CATEGORY, date: x.sent_on ?? today, with: { kind: 'account', id: x.account_id! } })
    await finish(e, s, kind)
    return `Money out · $${x.amount!.toFixed(2)} logged`
  }

  if (kind === 'return') {
    const x = s.ret!
    if (x.stage === 'refunded') {
      await applyRefund(m, x, today)
      await finish(e, s, kind)
      return `Refund · ${money(x.amount!)} back to ${refundToLabel(m, x.refund_to) ?? 'you'}`
    }
    const id = await saveReturn(x, today)
    await finish(e, { ...s, ret: { ...x, return_id: id } }, kind)
    return `${x.store!.trim()} return added · tracking the refund`
  }

  if (kind === 'money_in') {
    const x = s.money_in!
    await addIncome(m, {
      amount: x.amount!, kind: x.income_kind ?? 'other', from_name: x.from, account_id: x.account_id!, received_on: x.received_on ?? today,
    })
    await finish(e, s, kind)
    return `Money in · $${x.amount!.toFixed(2)} logged`
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

/** Best guesses for a money-in email: what kind it is and which account it landed in. */
export function moneyInDefaults(x: MoneyInInfo, m: MoneyData): MoneyInInfo {
  const kind: IncomeKind = x.income_kind ?? (x.via === 'zelle' ? 'zelle' : x.via === 'refund' ? 'refund' : 'other')
  const hint = (x.account_hint ?? '').toLowerCase()
  const byHint = hint ? m.accounts.find((a) => a.kind === 'checking' && (a.institution ?? a.name).toLowerCase().split(/\s+/).some((w) => w.length > 2 && hint.includes(w))
    || (hint.includes('navy') && (a.institution ?? '').toLowerCase() === 'nfcu')) : undefined
  return { ...x, income_kind: kind, account_id: x.account_id ?? byHint?.id ?? defaultIncomeAccount(m, kind) }
}

/** 'a:<id>' / 'c:<id>' → how it was paid; 'none' or empty → don't log it. */
export function payWithOf(v: string | null | undefined): PayWith | null {
  if (!v || v === 'none') return null
  const [k, id] = [v.slice(0, 1), v.slice(2)]
  return k === 'a' ? { kind: 'account', id } : k === 'c' ? { kind: 'card', id } : null
}

/** Default for an order card: the same account + Add uses for purchases (NFCU). */
export const defaultPayWith = (m: MoneyData): string | null => {
  const id = billsAccountId(m)
  return id ? `a:${id}` : null
}

export function payWithLabel(m: MoneyData, v: string | null | undefined): string | null {
  const pw = payWithOf(v)
  if (!pw) return null
  if (pw.kind === 'account') return m.accounts.find((a) => a.id === pw.id)?.institution ?? 'checking'
  if (pw.kind === 'card') return m.cards.find((c) => c.id === pw.id)?.name ?? 'card'
  return null
}

// ---------------------------------------------------------------------------
// Returns and refunds
// ---------------------------------------------------------------------------

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const r2 = (n: number) => Math.round(n * 100) / 100

/** Open returns first (oldest first), then refunds from the last week. */
export const openReturns = (d: InboxData) => d.returns.filter((x) => x.status !== 'refunded')
export const recentRefunds = (d: InboxData) => d.returns.filter((x) => x.status === 'refunded')

/** Days you've been waiting on the refund (from drop-off, or from the start if never marked dropped off). */
export const waitingDays = (x: ReturnRec, today: string) => daysBetween(x.dropped_off_on ?? x.started_on, today)
export const REFUND_LATE_DAYS = 14

export type ReturnTone = 'done' | 'late' | 'soon' | 'go'
export function returnTone(x: ReturnRec, today: string): ReturnTone {
  if (x.status === 'refunded') return 'done'
  if (x.status === 'dropped_off' && waitingDays(x, today) >= REFUND_LATE_DAYS) return 'late'
  if (x.status === 'started' && x.drop_off_by && daysBetween(today, x.drop_off_by) <= 2) return 'soon'
  return 'go'
}

export function returnLine(x: ReturnRec, today: string, label?: string | null): string {
  const amt = x.amount ? money(x.amount) : 'refund'
  if (x.status === 'refunded') return `Refunded ${x.amount ? money(x.amount) : ''}${label ? ` to ${label}` : ''}${x.refunded_on ? ` · ${shortDate(x.refunded_on)}` : ''}`.replace('  ', ' ')
  if (x.status === 'dropped_off') {
    const n = waitingDays(x, today)
    return n >= REFUND_LATE_DAYS ? `${n} days and no ${amt} yet. Contact ${x.store}?` : `Dropped off${x.dropped_off_on ? ` ${when(x.dropped_off_on, today)}` : ''} · waiting on ${amt}`
  }
  if (x.drop_off_by) {
    const n = daysBetween(today, x.drop_off_by)
    if (n < 0) return `Drop-off deadline was ${shortDate(x.drop_off_by)}`
    return `Drop off by ${when(x.drop_off_by, today)} · ${amt} back`
  }
  return `Return started · ${amt} back`
}

/** Choices for "Refund went back to". */
export function refundOptions(m: MoneyData): { value: string; label: string }[] {
  return [
    ...m.cards.map((c) => ({ value: `c:${c.id}`, label: c.name })),
    ...m.accounts.filter((a) => a.kind === 'checking').map((a) => ({ value: `a:${a.id}`, label: a.institution ?? a.name })),
    ...m.orders.map((o) => ({ value: `p:${o.id}`, label: `Afterpay · ${o.name}` })),
    { value: 'none', label: 'Gift card / store credit (don\'t count)' },
  ]
}

export function refundToLabel(m: MoneyData, v: string | null | undefined): string | null {
  if (!v) return null
  if (v === 'none') return 'gift card / store credit'
  const id = v.slice(2)
  if (v.startsWith('c:')) return m.cards.find((c) => c.id === id)?.name ?? 'card'
  if (v.startsWith('a:')) { const a = m.accounts.find((x) => x.id === id); return a?.institution ?? a?.name ?? 'account' }
  if (v.startsWith('p:')) return `Afterpay · ${m.orders.find((o) => o.id === id)?.name ?? 'plan'}`
  return null
}

/** The order's payment, if Runway knows it. */
export function refundToFromOrder(o: Order | undefined): string | null {
  if (!o) return null
  if (o.afterpay_order_id) return `p:${o.afterpay_order_id}`
  return payWithOf(o.pay_with) ? o.pay_with! : null
}

/** Start tracking a return (or move one along). Returns its id. */
export async function saveReturn(x: ReturnInfo, today: string): Promise<string> {
  const stage: ReturnStage = x.stage === 'dropped_off' ? 'dropped_off' : 'started'
  if (x.return_id) {
    const patch: Record<string, unknown> = { store: x.store!.trim(), items: x.items || null, amount: x.amount, drop_off_by: x.drop_off_by || null, order_number: x.order_number || null }
    if (stage === 'dropped_off') { patch.status = 'dropped_off'; patch.dropped_off_on = x.date ?? today }
    if (x.refund_to !== undefined) patch.refund_to = x.refund_to
    const { error } = await supabase.from('returns').update(patch).eq('id', x.return_id)
    if (error) throw error
    return x.return_id
  }
  const { data, error } = await supabase.from('returns').insert({
    order_id: x.order_id ?? null, store: x.store!.trim(), order_number: x.order_number || null, items: x.items || null, amount: x.amount,
    status: stage, started_on: stage === 'started' ? (x.date ?? today) : today, drop_off_by: x.drop_off_by || null,
    dropped_off_on: stage === 'dropped_off' ? (x.date ?? today) : null, refund_to: x.refund_to ?? null,
  }).select('id').single()
  if (error) {
    if (/returns/.test(error.message)) throw new Error('Returns aren\'t set up yet. Run 10_returns.sql in Supabase first.')
    throw error
  }
  return (data as { id: string }).id
}

export async function markDroppedOff(x: ReturnRec, today: string): Promise<void> {
  const { error } = await supabase.from('returns').update({ status: 'dropped_off', dropped_off_on: today }).eq('id', x.id)
  if (error) throw error
}

export async function removeReturn(id: string): Promise<void> {
  const { error } = await supabase.from('returns').delete().eq('id', id)
  if (error) throw error
}

async function refundTxn(f: { amount: number; description: string; date: string; account_id?: string | null; card_id?: string | null }) {
  const { error } = await supabase.from('transactions').insert({
    occurred_on: f.date, amount: -r2(f.amount), description: f.description, category: 'Shopping', source: 'manual',
    account_id: f.account_id ?? null, card_id: f.card_id ?? null,
  })
  if (error) throw error
}

async function refundToCard(m: MoneyData, cardId: string, amount: number, description: string, date: string) {
  await refundTxn({ amount, description, date, card_id: cardId })
  const card = m.cards.find((c) => c.id === cardId)
  if (card && card.balance !== null) {
    const { error } = await supabase.from('cards').update({ balance: Math.max(0, r2(card.balance - amount)) }).eq('id', cardId)
    if (error) throw error
  }
}

/**
 * The refund landed. It goes back where you paid:
 *  - a card: the card balance goes down (and spending goes down)
 *  - SoFi / NFCU: the account goes up (and spending goes down)
 *  - Afterpay: comes off the last unpaid payments first; anything beyond that goes back to the plan's card or account
 *  - gift card / store credit: just marked done
 */
export async function applyRefund(m: MoneyData, x: ReturnInfo, today: string): Promise<void> {
  const amount = r2(x.amount!)
  const date = x.date ?? today
  const description = `Refund · ${x.store!.trim()}${x.items ? ` · ${x.items}` : ''}`
  const to = x.refund_to ?? 'none'
  const id = to.slice(2)
  if (to.startsWith('c:')) await refundToCard(m, id, amount, description, date)
  else if (to.startsWith('a:')) await refundTxn({ amount, description, date, account_id: id })
  else if (to.startsWith('p:')) {
    const plan = m.orders.find((o) => o.id === id)
    if (!plan) throw new Error('That Afterpay plan isn\'t in Bills anymore. Pick where the refund went.')
    let unpaid = 0
    for (let n = 1; n <= plan.installments; n++) if (!m.payments.some((p) => p.afterpay_order_id === plan.id && p.installment_no === n)) unpaid += installmentAmount(plan, n)
    const offPlan = Math.min(amount, r2(unpaid))
    const back = r2(amount - offPlan)
    if (offPlan > 0) {
      const { error } = await supabase.from('afterpay_orders').update({ refunded: r2((plan.refunded ?? 0) + offPlan) }).eq('id', plan.id)
      if (error) throw error
      await refundTxn({ amount: offPlan, description, date })
    }
    if (back > 0) {
      if (plan.card_id) await refundToCard(m, plan.card_id, back, description, date)
      else await refundTxn({ amount: back, description, date, account_id: plan.account_id })
    }
  }
  const row = { status: 'refunded', refunded_on: date, amount, refund_to: to, items: x.items || null }
  if (x.return_id) {
    const { error } = await supabase.from('returns').update(row).eq('id', x.return_id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('returns').insert({
      ...row, order_id: x.order_id ?? null, store: x.store!.trim(), order_number: x.order_number || null, started_on: date,
    })
    if (error) throw error
  }
}

// ---------------------------------------------------------------------------
// Money out (Zelle / Cash App you send)
// ---------------------------------------------------------------------------

/** "Chicken · gas money (Zelle)" — what shows in your spending log. */
export function moneyOutText(x: MoneyOutInfo): string {
  const via = x.via ? VIA_LABEL[x.via] : null
  return `${x.to?.trim() || 'Sent'}${x.note?.trim() ? ` · ${x.note.trim()}` : ''}${via ? ` (${via})` : ''}`
}

/** Which account it came out of: the one the email names, else NFCU (Zelle and Cash App both pay from it). */
export function moneyOutDefaults(x: MoneyOutInfo, m: MoneyData): MoneyOutInfo {
  if (x.account_id) return x
  const hint = (x.account_hint ?? '').toLowerCase()
  const byHint = hint ? m.accounts.find((a) => a.kind === 'checking' && ((a.institution ?? a.name).toLowerCase().split(/\s+/).some((w) => w.length > 2 && hint.includes(w))
    || (hint.includes('navy') && (a.institution ?? '').toLowerCase() === 'nfcu'))) : undefined
  return { ...x, account_id: byHint?.id ?? billsAccountId(m) }
}
