import { supabase } from './supabase'
import { addDays, dateOf, daysBetween, isMonthlyDueOn, isRepeatingOn } from './dates'
import type { Account, AfterpayOrder, Bill, Card, Payment, PaycheckSplit, Settings, Subscription } from './types'

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface MoneyData {
  settings: Settings | null
  accounts: Account[]
  splits: PaycheckSplit[]
  cards: Card[]
  bills: Bill[]
  subs: Subscription[]
  orders: AfterpayOrder[]
  payments: Payment[]
}

export const EMPTY_MONEY: MoneyData = { settings: null, accounts: [], splits: [], cards: [], bills: [], subs: [], orders: [], payments: [] }

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export async function loadMoney(): Promise<MoneyData> {
  const [settings, accounts, splits, cards, bills, subs, orders, payments] = await Promise.all([
    supabase.from('settings').select('*').maybeSingle(),
    supabase.from('accounts').select('id, name, institution, kind, balance, role_note, sort').eq('is_active', true).order('sort'),
    supabase.from('paycheck_splits').select('id, account_id, amount'),
    supabase.from('cards').select('*').eq('is_active', true).order('due_day'),
    supabase.from('bills').select('*').eq('is_active', true).order('due_day'),
    supabase.from('subscriptions').select('*').eq('is_active', true).order('charge_day'),
    supabase.from('afterpay_orders').select('*').order('order_date', { ascending: false }),
    supabase.from('payments').select('id, card_id, bill_id, afterpay_order_id, installment_no, due_date, amount, paid_on').order('due_date', { ascending: false }),
  ])
  const failed = [settings, accounts, splits, cards, bills, subs, orders, payments].find((r) => r.error)
  if (failed?.error) throw failed.error
  return {
    settings: settings.data as Settings | null,
    accounts: ((accounts.data ?? []) as Account[]).map((a) => ({ ...a, balance: num(a.balance) })),
    splits: ((splits.data ?? []) as PaycheckSplit[]).map((s) => ({ ...s, amount: Number(s.amount) })),
    cards: ((cards.data ?? []) as Card[]).map((c) => ({ ...c, balance: num(c.balance), credit_limit: num(c.credit_limit), minimum_payment: num(c.minimum_payment), apr: num(c.apr) })),
    bills: ((bills.data ?? []) as Bill[]).map((b) => ({ ...b, amount: num(b.amount) })),
    subs: ((subs.data ?? []) as Subscription[]).map((s) => ({ ...s, amount: Number(s.amount) })),
    orders: ((orders.data ?? []) as AfterpayOrder[]).map((o) => ({ ...o, total: Number(o.total) })),
    payments: ((payments.data ?? []) as Payment[]).map((p) => ({ ...p, amount: Number(p.amount) })),
  }
}

// ---------------------------------------------------------------------------
// What is due on a given day
// ---------------------------------------------------------------------------

export type ObligationKind = 'card' | 'bill' | 'afterpay' | 'sub'
export type ObligationStatus = 'paid' | 'overdue' | 'soon' | 'upcoming' | 'auto'

export interface Obligation {
  key: string
  kind: ObligationKind
  sourceId: string
  date: string
  name: string
  short: string
  color: string
  amount: number | null
  installmentNo?: number
  installments?: number
  payment?: Payment
  status: ObligationStatus
  from: string            // which account/card it comes out of
}

const AFTERPAY_COLOR = '#0EA5E9'

/** Splits an Afterpay total into equal installments; any leftover cents go on the last one. */
export function installmentAmount(order: AfterpayOrder, n: number): number {
  const base = Math.floor((order.total * 100) / order.installments) / 100
  if (n < order.installments) return base
  return Math.round((order.total - base * (order.installments - 1)) * 100) / 100
}

export function installmentDate(order: AfterpayOrder, n: number): string {
  return addDays(order.order_date, (n - 1) * order.interval_days)
}

function sourceName(d: MoneyData, accountId: string | null, cardId: string | null): string {
  if (accountId) return d.accounts.find((a) => a.id === accountId)?.institution ?? d.accounts.find((a) => a.id === accountId)?.name ?? 'Account'
  if (cardId) return d.cards.find((c) => c.id === cardId)?.name ?? 'Card'
  return 'Not set'
}

function statusFor(date: string, today: string, paid: boolean): ObligationStatus {
  if (paid) return 'paid'
  if (date < today) return 'overdue'
  if (daysBetween(today, date) <= 3) return 'soon'
  return 'upcoming'
}

export function obligationsOn(d: MoneyData, date: string, today: string): Obligation[] {
  const out: Obligation[] = []

  for (const c of d.cards) {
    if (date < c.tracking_since || !isMonthlyDueOn(c.due_day, date)) continue
    const payment = d.payments.find((p) => p.card_id === c.id && p.due_date === date)
    out.push({
      key: `card:${c.id}:${date}`, kind: 'card', sourceId: c.id, date, name: c.name, short: c.name.replace(' Mastercard', ''),
      color: c.color, amount: c.minimum_payment, payment, status: statusFor(date, today, Boolean(payment)), from: 'Card payment',
    })
  }

  for (const b of d.bills) {
    if (date < b.tracking_since || !isMonthlyDueOn(b.due_day, date)) continue
    const payment = d.payments.find((p) => p.bill_id === b.id && p.due_date === date)
    out.push({
      key: `bill:${b.id}:${date}`, kind: 'bill', sourceId: b.id, date, name: b.name, short: b.name,
      color: b.color, amount: b.amount, payment, status: statusFor(date, today, Boolean(payment)), from: sourceName(d, b.account_id, null),
    })
  }

  for (const o of d.orders) {
    for (let n = 1; n <= o.installments; n++) {
      if (installmentDate(o, n) !== date) continue
      const payment = d.payments.find((p) => p.afterpay_order_id === o.id && p.installment_no === n)
      out.push({
        key: `afterpay:${o.id}:${n}`, kind: 'afterpay', sourceId: o.id, date, name: `Afterpay · ${o.name}`, short: 'Afterpay',
        color: AFTERPAY_COLOR, amount: installmentAmount(o, n), installmentNo: n, installments: o.installments, payment,
        status: statusFor(date, today, Boolean(payment)), from: sourceName(d, o.account_id, o.card_id),
      })
    }
  }

  const dt = dateOf(date)
  for (const s of d.subs) {
    if (date < s.started_on && date < today) continue
    const due =
      s.cycle === 'monthly' ? isMonthlyDueOn(s.charge_day, date)
        : s.cycle === 'yearly' ? s.charge_month === dt.getMonth() + 1 && isMonthlyDueOn(s.charge_day, date)
          : dt.getDay() === s.charge_day % 7
    if (!due) continue
    out.push({
      key: `sub:${s.id}:${date}`, kind: 'sub', sourceId: s.id, date, name: s.name, short: s.name,
      color: '#8E7CB0', amount: s.amount, status: 'auto', from: sourceName(d, s.account_id, s.card_id),
    })
  }

  return out
}

export function isPayday(d: MoneyData, date: string): boolean {
  return isRepeatingOn(d.settings?.pay_start ?? null, d.settings?.pay_every_days ?? 14, date)
}

export function nextPayday(d: MoneyData, from: string): { date: string; days: number } | null {
  if (!d.settings?.pay_start) return null
  for (let i = 0; i <= 400; i++) {
    const k = addDays(from, i)
    if (isPayday(d, k)) return { date: k, days: i }
  }
  return null
}

export function paycheckTotal(d: MoneyData): number {
  return d.splits.reduce((t, s) => t + s.amount, 0)
}

/** Everything leaving your accounts from today until (not including) the next payday. */
export function dueBeforePayday(d: MoneyData, today: string) {
  const np = nextPayday(d, today)
  if (!np) return null
  const stop = np.days === 0 ? (nextPayday(d, addDays(today, 1))?.date ?? np.date) : np.date
  const items: Obligation[] = []
  for (let k = today; k < stop; k = addDays(k, 1)) {
    for (const o of obligationsOn(d, k, today)) if (o.status !== 'paid') items.push(o)
  }
  const bills = items.filter((o) => o.kind !== 'sub')
  const subs = items.filter((o) => o.kind === 'sub')
  return {
    payday: np.date,
    total: items.reduce((t, o) => t + (o.amount ?? 0), 0),
    billCount: bills.length,
    subCount: subs.length,
    missingAmounts: bills.filter((o) => o.amount === null).length,
  }
}

export function overdue(d: MoneyData, today: string, lookbackDays = 90): Obligation[] {
  const list: Obligation[] = []
  for (let i = 1; i <= lookbackDays; i++) {
    for (const o of obligationsOn(d, addDays(today, -i), today)) if (o.status === 'overdue') list.push(o)
  }
  return list
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100

/** Records what you actually paid. A card with a balance on file goes down by that amount. */
export async function markPaid(d: MoneyData, o: Obligation, amount: number): Promise<void> {
  const row: Record<string, unknown> = { due_date: o.date, amount }
  if (o.kind === 'card') row.card_id = o.sourceId
  else if (o.kind === 'bill') row.bill_id = o.sourceId
  else if (o.kind === 'afterpay') { row.afterpay_order_id = o.sourceId; row.installment_no = o.installmentNo }
  else return
  const { error } = await supabase.from('payments').insert(row)
  if (error) throw error
  if (o.kind === 'card') {
    const card = d.cards.find((c) => c.id === o.sourceId)
    if (card?.balance !== null && card?.balance !== undefined) {
      const { error: e2 } = await supabase.from('cards').update({ balance: Math.max(0, round2(card.balance - amount)) }).eq('id', card.id)
      if (e2) throw e2
    }
  }
}

export async function undoPayment(d: MoneyData, o: Obligation): Promise<void> {
  if (!o.payment) return
  const { error } = await supabase.from('payments').delete().eq('id', o.payment.id)
  if (error) throw error
  if (o.kind === 'card') {
    const card = d.cards.find((c) => c.id === o.sourceId)
    if (card?.balance !== null && card?.balance !== undefined) {
      const { error: e2 } = await supabase.from('cards').update({ balance: round2(card.balance + o.payment.amount) }).eq('id', card.id)
      if (e2) throw e2
    }
  }
}

type Table = 'cards' | 'bills' | 'subscriptions' | 'afterpay_orders'

export async function updateRow(table: Table, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from(table).update(patch).eq('id', id)
  if (error) throw error
}

export async function insertRow(table: Table, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from(table).insert(row).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deleteRow(table: Table, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

/** Adds an Afterpay order. The first payment is taken at checkout, so it's recorded as paid on the order date. */
export async function addAfterpayOrder(fields: { name: string; total: number; order_date: string; account_id: string | null; card_id: string | null }): Promise<void> {
  const id = await insertRow('afterpay_orders', { ...fields, installments: 4, interval_days: 14 })
  const first = installmentAmount({ id, ...fields, installments: 4, interval_days: 14 }, 1)
  const { error } = await supabase.from('payments').insert({ afterpay_order_id: id, installment_no: 1, due_date: fields.order_date, amount: first, paid_on: fields.order_date })
  if (error) throw error
}

/** Parses "$1,234.50" style input. Empty → null. */
export function parseMoney(v: string): number | null {
  const t = v.replace(/[$,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? round2(n) : null
}
