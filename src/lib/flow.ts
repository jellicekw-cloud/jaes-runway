import { addDays, keyOf, lastDayOfMonth, MONTHS, shortDate } from './dates'
import { isPayday, obligationsOn, paychecksBetween, paycheckTotal, savingsOn, expectedOn, type MoneyData } from './money'
import { SIDE_WORK_DEFAULT } from './afford'

// In vs out for your bank accounts (NFCU, SoFi): what came in, what left, and what you saved.
// Card purchases aren't "out" until you pay the card; the card payment is.
// "By the end" adds what's still scheduled: paydays, expected side work, bills, auto-pay, savings.

export type OutGroup = 'Bills' | 'Cards' | 'Afterpay & Affirm' | 'Subscriptions' | 'Spending' | 'Cash'
export const OUT_GROUPS: OutGroup[] = ['Bills', 'Cards', 'Afterpay & Affirm', 'Subscriptions', 'Spending', 'Cash']
export type InGroup = 'Paychecks' | 'Side work' | 'Zelle & other' | 'Refunds'
export const IN_GROUPS: InGroup[] = ['Paychecks', 'Side work', 'Zelle & other', 'Refunds']

export interface Flow {
  label: string; from: string; to: string; through: string
  inSoFar: number; outSoFar: number; savedSoFar: number
  inEnd: number; outEnd: number; savedEnd: number
  ins: Record<InGroup, number>; outs: Record<OutGroup, number>
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function cashFlow(m: MoneyData, from: string, to: string, today: string, label: string): Flow {
  const through = today < to ? today : to
  const checking = new Set(m.accounts.filter((a) => a.kind === 'checking').map((a) => a.id))
  const savingsIds = new Set(m.accounts.filter((a) => a.kind === 'savings' || a.kind === 'vault').map((a) => a.id))
  const cashIds = new Set(m.accounts.filter((a) => a.kind === 'cash').map((a) => a.id))
  const inRange = (d: string, end = through) => d >= from && d <= end
  const ins = Object.fromEntries(IN_GROUPS.map((g) => [g, 0])) as Record<InGroup, number>
  const outs = Object.fromEntries(OUT_GROUPS.map((g) => [g, 0])) as Record<OutGroup, number>
  let saved = 0

  // --- so far ---
  ins.Paychecks = paychecksBetween(m, from, through)
  for (const x of m.income) {
    if (!inRange(x.received_on)) continue
    if (x.kind === 'side_work') ins['Side work'] += x.amount
    else if (x.kind === 'refund') ins.Refunds += x.amount
    else ins['Zelle & other'] += x.amount
  }
  for (const t of m.transactions) {
    if (!inRange(t.occurred_on) || !t.account_id || !checking.has(t.account_id) || t.source !== 'manual') continue
    if (t.amount < 0) ins.Refunds += -t.amount
    else outs.Spending += t.amount
  }
  const planOnCard = (id: string | null) => Boolean(id && m.orders.find((o) => o.id === id)?.card_id)
  for (const p of m.payments) {
    if (!inRange(p.paid_on)) continue
    if (p.account_id && !checking.has(p.account_id)) continue
    if (p.card_id) outs.Cards += p.amount
    else if (p.bill_id) outs.Bills += p.amount
    else if (p.afterpay_order_id && !planOnCard(p.afterpay_order_id)) outs['Afterpay & Affirm'] += p.amount
  }
  for (const x of m.extraPayments) if (inRange(x.paid_on)) outs.Cards += x.amount
  for (const x of m.transfers) {
    if (!inRange(x.moved_on)) continue
    const fromBank = x.from_account_id && checking.has(x.from_account_id)
    if (fromBank && x.to_account_id && cashIds.has(x.to_account_id)) outs.Cash += x.amount
    else if (fromBank && x.to_account_id && savingsIds.has(x.to_account_id)) saved += x.amount
    else if (x.from_account_id && savingsIds.has(x.from_account_id) && x.to_account_id && checking.has(x.to_account_id)) saved -= x.amount
  }
  for (const d of m.deposits) if (inRange(d.saved_on)) saved += d.amount
  // auto-pay that comes out of a bank by itself (subscriptions, payday bills, DECU transfer), through today
  for (let k = from; k <= through; k = addDays(k, 1)) {
    for (const o of obligationsOn(m, k, today)) {
      if (o.kind !== 'sub' || !o.amount || !o.fromAccountId || !checking.has(o.fromAccountId)) continue
      if (o.key.startsWith('save:')) saved += o.amount
      else if (o.key.startsWith('bill:')) outs.Bills += o.amount
      else outs.Subscriptions += o.amount
    }
  }
  const inSoFar = r2(IN_GROUPS.reduce((t, g) => t + ins[g], 0))
  const outSoFar = r2(OUT_GROUPS.reduce((t, g) => t + outs[g], 0))
  const savedSoFar = r2(saved)

  // --- still scheduled until the end ---
  let inLater = 0, outLater = 0, savedLater = 0
  for (let k = addDays(through, 1); k <= to; k = addDays(k, 1)) {
    if (isPayday(m, k)) inLater += paycheckTotal(m)
    for (const e of expectedOn(m, k)) if (!e.got) inLater += e.source.expected_amount ?? SIDE_WORK_DEFAULT
    for (const o of obligationsOn(m, k, today)) {
      if (!o.amount || o.status === 'paid') continue
      if (o.kind === 'sub') {
        if (!o.fromAccountId || !checking.has(o.fromAccountId)) continue
        if (o.key.startsWith('save:')) savedLater += o.amount; else outLater += o.amount
      } else if (o.kind === 'afterpay' && planOnCard(o.sourceId)) continue
      else outLater += o.amount
    }
    const step = savingsOn(m, k)
    if (step && !step.deposit) savedLater += step.amount
  }
  // unpaid bills from earlier in the period are still going to go out
  for (let k = from; k <= through; k = addDays(k, 1)) {
    for (const o of obligationsOn(m, k, today)) if (o.kind !== 'sub' && o.amount && o.status !== 'paid' && !(o.kind === 'afterpay' && planOnCard(o.sourceId))) outLater += o.amount
  }
  for (const g of IN_GROUPS) ins[g] = r2(ins[g])
  for (const g of OUT_GROUPS) outs[g] = r2(outs[g])
  return {
    label, from, to, through, inSoFar, outSoFar, savedSoFar,
    inEnd: r2(inSoFar + inLater), outEnd: r2(outSoFar + outLater), savedEnd: r2(savedSoFar + savedLater), ins, outs,
  }
}

export function monthFlow(m: MoneyData, today: string, offset = 0): Flow {
  const [y, mo] = today.split('-').map(Number)
  const first = keyOf(new Date(y, mo - 1 + offset, 1))
  const last = keyOf(new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, lastDayOfMonth(first)))
  return cashFlow(m, first, last, today, MONTHS[Number(first.slice(5, 7)) - 1])
}

/** Payday to the day before the next payday. */
export function paycheckFlow(m: MoneyData, today: string, offset = 0): Flow | null {
  const every = m.settings?.pay_every_days ?? 14
  let start: string | null = null
  for (let i = 0; i < every; i++) { const k = addDays(today, -i); if (isPayday(m, k)) { start = k; break } }
  if (!start) return null
  start = addDays(start, offset * every)
  const end = addDays(start, every - 1)
  return cashFlow(m, start, end, today, `${shortDate(start)} – ${shortDate(end)}`)
}
