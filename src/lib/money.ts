import { supabase } from './supabase'
import { addDays, dateOf, daysBetween, isMonthlyDueOn, isRepeatingOn, keyOf } from './dates'
import type {
  Account, AfterpayOrder, Bill, Card, Payment, PaycheckSplit, SavingsChallenge, SavingsDeposit, Settings, Subscription, Transaction,
} from './types'

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
  challenge: SavingsChallenge | null
  deposits: SavingsDeposit[]
  transactions: Transaction[]
  income: Income[]
  incomeSources: IncomeSource[]
}

export type IncomeKind = 'side_work' | 'zelle' | 'refund' | 'gift' | 'other'
export const INCOME_KIND_LABEL: Record<IncomeKind, string> = { side_work: 'Side work', zelle: 'Zelle', refund: 'Refund', gift: 'Gift', other: 'Other' }
export interface Income {
  id: string; received_on: string; amount: number; kind: IncomeKind; from_name: string | null; account_id: string | null
  income_source_id: string | null; expected_on: string | null; note: string | null; created_at: string
}
export interface IncomeSource { id: string; name: string; account_id: string | null; days: number[]; expected_amount: number | null; is_active: boolean }

export const EMPTY_MONEY: MoneyData = {
  settings: null, accounts: [], splits: [], cards: [], bills: [], subs: [], orders: [], payments: [],
  challenge: null, deposits: [], transactions: [], income: [], incomeSources: [],
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const round2 = (n: number) => Math.round(n * 100) / 100

/** How far back the spending log and balance estimates look. */
const HISTORY_DAYS = 120

export async function loadMoney(today: string): Promise<MoneyData> {
  const since = addDays(today, -HISTORY_DAYS)
  const [settings, accounts, splits, cards, bills, subs, orders, payments, challenges, deposits, transactions] = await Promise.all([
    supabase.from('settings').select('*').maybeSingle(),
    supabase.from('accounts').select('id, name, institution, kind, balance, balance_as_of, role_note, sort').eq('is_active', true).order('sort'),
    supabase.from('paycheck_splits').select('id, account_id, amount'),
    supabase.from('cards').select('*').eq('is_active', true).order('due_day'),
    supabase.from('bills').select('*').eq('is_active', true).order('due_day'),
    supabase.from('subscriptions').select('*').eq('is_active', true).order('charge_day'),
    supabase.from('afterpay_orders').select('*').order('order_date', { ascending: false }),
    supabase.from('payments').select('id, card_id, bill_id, afterpay_order_id, installment_no, due_date, amount, paid_on, account_id, created_at').order('due_date', { ascending: false }),
    supabase.from('savings_challenges').select('*').eq('is_active', true).order('created_at').limit(1),
    supabase.from('savings_deposits').select('id, challenge_id, deposit_no, amount, saved_on, created_at').order('deposit_no'),
    supabase.from('transactions').select('*').gte('occurred_on', since).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
  ])
  const failed = [settings, accounts, splits, cards, bills, subs, orders, payments, challenges, deposits, transactions].find((r) => r.error)
  if (failed?.error) throw failed.error
  // Money in: tables come from 05_money_in.sql; until that's run, there's simply no money in yet
  const [inc, srcs] = await Promise.all([
    supabase.from('income').select('id, received_on, amount, kind, from_name, account_id, income_source_id, expected_on, note, created_at')
      .gte('received_on', since).order('received_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('income_sources').select('id, name, account_id, days, expected_amount, is_active').eq('is_active', true).order('created_at'),
  ])
  const ch = ((challenges.data ?? []) as SavingsChallenge[])[0]
  return {
    settings: settings.data as Settings | null,
    accounts: ((accounts.data ?? []) as Account[]).map((a) => ({ ...a, balance: num(a.balance) })),
    splits: ((splits.data ?? []) as PaycheckSplit[]).map((s) => ({ ...s, amount: Number(s.amount) })),
    cards: ((cards.data ?? []) as Card[]).map((c) => ({ ...c, balance: num(c.balance), credit_limit: num(c.credit_limit), minimum_payment: num(c.minimum_payment), apr: num(c.apr) })),
    bills: ((bills.data ?? []) as Bill[]).map((b) => ({ ...b, amount: num(b.amount) })),
    subs: ((subs.data ?? []) as Subscription[]).map((s) => ({ ...s, amount: Number(s.amount) })),
    orders: ((orders.data ?? []) as AfterpayOrder[]).map((o) => ({ ...o, total: Number(o.total) })),
    payments: ((payments.data ?? []) as Payment[]).map((p) => ({ ...p, amount: Number(p.amount) })),
    challenge: ch ? { ...ch, first_amount: Number(ch.first_amount), step_amount: Number(ch.step_amount) } : null,
    deposits: ((deposits.data ?? []) as SavingsDeposit[]).map((x) => ({ ...x, amount: Number(x.amount) })),
    transactions: ((transactions.data ?? []) as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount) })),
    income: inc.error ? [] : ((inc.data ?? []) as Income[]).map((x) => ({ ...x, amount: Number(x.amount) })),
    incomeSources: srcs.error ? [] : ((srcs.data ?? []) as IncomeSource[]).map((x) => ({ ...x, expected_amount: num(x.expected_amount), days: (x.days ?? []).map(Number) })),
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
  from: string                  // which account/card it comes out of
  fromAccountId: string | null  // checking account it's paid from, when known
}

export const AFTERPAY_COLOR = '#0EA5E9'

/** Splits an Afterpay total into equal installments; any leftover cents go on the last one. */
export function installmentAmount(order: Pick<AfterpayOrder, 'total' | 'installments'>, n: number): number {
  const base = Math.floor((order.total * 100) / order.installments) / 100
  if (n < order.installments) return base
  return round2(order.total - base * (order.installments - 1))
}

export function installmentDate(order: Pick<AfterpayOrder, 'order_date' | 'interval_days'>, n: number): string {
  return addDays(order.order_date, (n - 1) * order.interval_days)
}

export function accountLabel(d: MoneyData, accountId: string | null, cardId: string | null): string {
  if (accountId) {
    const a = d.accounts.find((x) => x.id === accountId)
    return a?.institution ?? a?.name ?? 'Account'
  }
  if (cardId) return d.cards.find((c) => c.id === cardId)?.name ?? 'Card'
  return 'Not set'
}

/** The checking account bills come out of by default (NFCU). */
export function billsAccountId(d: MoneyData): string | null {
  const checking = d.accounts.filter((a) => a.kind === 'checking')
  return (checking.find((a) => a.institution === 'NFCU') ?? checking[checking.length - 1])?.id ?? null
}

function statusFor(date: string, today: string, paid: boolean): ObligationStatus {
  if (paid) return 'paid'
  if (date < today) return 'overdue'
  if (daysBetween(today, date) <= 3) return 'soon'
  return 'upcoming'
}

export function subChargesOn(s: Subscription, date: string): boolean {
  const dt = dateOf(date)
  return s.cycle === 'monthly' ? isMonthlyDueOn(s.charge_day, date)
    : s.cycle === 'yearly' ? s.charge_month === dt.getMonth() + 1 && isMonthlyDueOn(s.charge_day, date)
      : dt.getDay() === s.charge_day % 7
}

export function obligationsOn(d: MoneyData, date: string, today: string): Obligation[] {
  const out: Obligation[] = []
  const billsAcct = billsAccountId(d)

  for (const c of d.cards) {
    if (date < c.tracking_since || !isMonthlyDueOn(c.due_day, date)) continue
    const payment = d.payments.find((p) => p.card_id === c.id && p.due_date === date)
    out.push({
      key: `card:${c.id}:${date}`, kind: 'card', sourceId: c.id, date, name: c.name, short: c.name.replace(' Mastercard', ''),
      color: c.color, amount: c.minimum_payment, payment, status: statusFor(date, today, Boolean(payment)),
      from: 'Card payment', fromAccountId: billsAcct,
    })
  }

  for (const b of d.bills) {
    if (date < b.tracking_since || !isMonthlyDueOn(b.due_day, date)) continue
    const payment = d.payments.find((p) => p.bill_id === b.id && p.due_date === date)
    out.push({
      key: `bill:${b.id}:${date}`, kind: 'bill', sourceId: b.id, date, name: b.name, short: b.name,
      color: b.color, amount: b.amount, payment, status: statusFor(date, today, Boolean(payment)),
      from: accountLabel(d, b.account_id, null), fromAccountId: b.account_id ?? billsAcct,
    })
  }

  for (const o of d.orders) {
    for (let n = 1; n <= o.installments; n++) {
      if (installmentDate(o, n) !== date) continue
      const payment = d.payments.find((p) => p.afterpay_order_id === o.id && p.installment_no === n)
      out.push({
        key: `afterpay:${o.id}:${n}`, kind: 'afterpay', sourceId: o.id, date, name: `Afterpay · ${o.name}`, short: 'Afterpay',
        color: AFTERPAY_COLOR, amount: installmentAmount(o, n), installmentNo: n, installments: o.installments, payment,
        status: statusFor(date, today, Boolean(payment)), from: accountLabel(d, o.account_id, o.card_id), fromAccountId: o.account_id,
      })
    }
  }

  for (const s of d.subs) {
    if (date < s.started_on && date < today) continue
    if (!subChargesOn(s, date)) continue
    out.push({
      key: `sub:${s.id}:${date}`, kind: 'sub', sourceId: s.id, date, name: s.name, short: s.name,
      color: '#8E7CB0', amount: s.amount, status: 'auto', from: accountLabel(d, s.account_id, s.card_id), fromAccountId: s.account_id,
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
// Savings challenge
// ---------------------------------------------------------------------------

export interface SavingsStep {
  no: number
  date: string
  amount: number
  deposit?: SavingsDeposit
}

export function challengeSteps(d: MoneyData): SavingsStep[] {
  const ch = d.challenge
  if (!ch) return []
  return Array.from({ length: ch.deposit_count }, (_, i) => {
    const no = i + 1
    return {
      no,
      date: addDays(ch.start_date, i * ch.every_days),
      amount: round2(ch.first_amount + ch.step_amount * i),
      deposit: d.deposits.find((x) => x.challenge_id === ch.id && x.deposit_no === no),
    }
  })
}

export function challengeGoal(d: MoneyData): number {
  return round2(challengeSteps(d).reduce((t, s) => t + s.amount, 0))
}

export function savingsOn(d: MoneyData, date: string): SavingsStep | undefined {
  return challengeSteps(d).find((s) => s.date === date)
}

/** The deposit to show as "this payday": the first not yet saved. */
export function currentSavingsStep(d: MoneyData): SavingsStep | undefined {
  return challengeSteps(d).find((s) => !s.deposit)
}

export async function saveDeposit(d: MoneyData, step: SavingsStep, today: string): Promise<void> {
  if (!d.challenge) return
  const { error } = await supabase.from('savings_deposits').insert({ challenge_id: d.challenge.id, deposit_no: step.no, amount: step.amount, saved_on: today })
  if (error) throw error
}

export async function undoDeposit(step: SavingsStep): Promise<void> {
  if (!step.deposit) return
  const { error } = await supabase.from('savings_deposits').delete().eq('id', step.deposit.id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Balances: the number you typed in, plus what happened since
// ---------------------------------------------------------------------------

export interface BalanceEstimate {
  entered: number | null
  asOf: string | null
  estimate: number | null
  changes: { label: string; amount: number }[]
}

/**
 * Starts from the balance you last typed in, then adds paychecks and subtracts
 * auto-pay, purchases, bill payments and savings deposits that came after it.
 * Typing a new balance resets the starting point, so it can't drift for long.
 */
export function estimateBalance(d: MoneyData, a: Account, today: string): BalanceEstimate {
  const vault = a.kind === 'vault'
  if (a.balance === null && !vault) return { entered: null, asOf: null, estimate: null, changes: [] }

  const asOfTs = a.balance_as_of ? Date.parse(a.balance_as_of) : 0
  const asOfDate = a.balance_as_of ? keyOf(new Date(asOfTs)) : null
  const after = (ts: string) => Date.parse(ts) > asOfTs
  const changes: { label: string; amount: number }[] = []

  if (!vault && asOfDate) {
    // Paychecks and auto-pay on days after the update, through today
    const split = d.splits.find((s) => s.account_id === a.id)?.amount ?? 0
    let pay = 0, auto = 0
    for (let k = addDays(asOfDate, 1); k <= today; k = addDays(k, 1)) {
      if (split && isPayday(d, k)) pay += split
      for (const s of d.subs) if (s.account_id === a.id && s.started_on <= k && subChargesOn(s, k)) auto += s.amount
    }
    if (pay) changes.push({ label: 'Paychecks', amount: pay })
    if (auto) changes.push({ label: 'Auto-pay', amount: -auto })

    const bought = d.transactions.filter((t) => t.source === 'manual' && t.account_id === a.id && after(t.created_at)).reduce((t, x) => t + x.amount, 0)
    if (bought) changes.push({ label: 'Purchases', amount: -bought })

    const paid = d.payments.filter((p) => p.account_id === a.id && after(p.created_at)).reduce((t, p) => t + p.amount, 0)
    if (paid) changes.push({ label: 'Payments', amount: -paid })

    const cameIn = d.income.filter((x) => x.account_id === a.id && after(x.created_at)).reduce((t, x) => t + x.amount, 0)
    if (cameIn) changes.push({ label: 'Money in', amount: cameIn })
  }

  const ch = d.challenge
  if (ch) {
    const moved = d.deposits.filter((x) => x.challenge_id === ch.id && after(x.created_at)).reduce((t, x) => t + x.amount, 0)
    if (moved && ch.from_account_id === a.id) changes.push({ label: 'Savings challenge', amount: -moved })
    if (moved && ch.to_account_id === a.id) changes.push({ label: 'Savings challenge', amount: moved })
  }

  const base = a.balance ?? 0
  return { entered: a.balance, asOf: a.balance_as_of, estimate: round2(base + changes.reduce((t, c) => t + c.amount, 0)), changes }
}

export async function setAccountBalance(accountId: string, balance: number | null): Promise<void> {
  const { error } = await supabase.from('accounts').update({ balance, balance_as_of: balance === null ? null : new Date().toISOString() }).eq('id', accountId)
  if (error) throw error
}

export async function setPaySplit(splitId: string, amount: number): Promise<void> {
  const { error } = await supabase.from('paycheck_splits').update({ amount }).eq('id', splitId)
  if (error) throw error
}

export async function setHideBalances(hide: boolean): Promise<void> {
  const { error } = await supabase.from('settings').update({ hide_balances: hide }).not('user_id', 'is', null)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Spending log
// ---------------------------------------------------------------------------

/** Afterpay: firstPayment is when payment 1 is due. Same as the purchase date = paid at checkout; later = you skipped/deferred it. */
export type PayWith = { kind: 'account'; id: string } | { kind: 'card'; id: string } | { kind: 'afterpay'; firstPayment?: string }

/** Logs a purchase. A card purchase adds to that card's balance; Afterpay creates an order with 4 payments. */
export async function logPurchase(d: MoneyData, p: { amount: number; description: string; category: string; date: string; with: PayWith }): Promise<void> {
  if (p.with.kind === 'afterpay') {
    await addAfterpayOrder(d, {
      name: p.description, total: p.amount, purchased_on: p.date, first_payment: p.with.firstPayment ?? p.date, account_id: billsAccountId(d), card_id: null,
    }, p.category)
    return
  }
  const row = {
    occurred_on: p.date, amount: p.amount, description: p.description, category: p.category, source: 'manual',
    account_id: p.with.kind === 'account' ? p.with.id : null,
    card_id: p.with.kind === 'card' ? p.with.id : null,
  }
  const { error } = await supabase.from('transactions').insert(row)
  if (error) throw error
  if (p.with.kind === 'card') {
    const id = p.with.id
    const card = d.cards.find((c) => c.id === id)
    if (card && card.balance !== null) {
      const { error: e2 } = await supabase.from('cards').update({ balance: round2(card.balance + p.amount) }).eq('id', card.id)
      if (e2) throw e2
    }
  }
}

export async function deleteTransaction(d: MoneyData, t: Transaction): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', t.id)
  if (error) throw error
  if (t.source === 'manual' && t.card_id) {
    const card = d.cards.find((c) => c.id === t.card_id)
    if (card && card.balance !== null) {
      const { error: e2 } = await supabase.from('cards').update({ balance: Math.max(0, round2(card.balance - t.amount)) }).eq('id', card.id)
      if (e2) throw e2
    }
  }
}

/** Adds any missing auto-pay charges from the last 35 days to the spending log (each charge is logged once). */
export async function logSubscriptionCharges(d: MoneyData, today: string): Promise<number> {
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i <= 35; i++) {
    const k = addDays(today, -i)
    for (const s of d.subs) {
      if (k < s.started_on || !subChargesOn(s, k)) continue
      if (d.transactions.some((t) => t.subscription_id === s.id && t.occurred_on === k)) continue
      rows.push({
        occurred_on: k, amount: s.amount, description: s.name, category: s.category || 'Subscription', source: 'subscription',
        subscription_id: s.id, account_id: s.account_id, card_id: s.card_id,
      })
    }
  }
  let added = 0
  for (const r of rows) {
    const { error } = await supabase.from('transactions').insert(r)
    if (error && error.code !== '23505') throw error   // 23505 = already logged
    if (!error) added++
  }
  return added
}

// ---------------------------------------------------------------------------
// Bill payments
// ---------------------------------------------------------------------------

/** Records what you actually paid. A card with a balance on file goes down by that amount. */
export async function markPaid(d: MoneyData, o: Obligation, amount: number, fromAccountId: string | null = o.fromAccountId): Promise<void> {
  const row: Record<string, unknown> = { due_date: o.date, amount, account_id: fromAccountId }
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

/**
 * Adds an Afterpay order. The 4 payments are scheduled from first_payment, which is
 * stored as the order's schedule date (order_date). When the first payment is taken at
 * checkout (first_payment = purchased_on) it's recorded as paid; when it's skipped or
 * deferred, nothing is paid yet. The purchase goes in the spending log once, on the day
 * you bought it, for the full amount.
 */
export async function addAfterpayOrder(
  _d: MoneyData,
  fields: { name: string; total: number; purchased_on: string; first_payment: string; account_id: string | null; card_id: string | null },
  category = 'Shopping',
): Promise<string> {
  const { purchased_on, first_payment, ...rest } = fields
  const id = await insertRow('afterpay_orders', { ...rest, order_date: first_payment, installments: 4, interval_days: 14 })
  if (first_payment <= purchased_on) {
    const first = installmentAmount({ total: fields.total, installments: 4 }, 1)
    const { error } = await supabase.from('payments').insert({
      afterpay_order_id: id, installment_no: 1, due_date: first_payment, amount: first, paid_on: purchased_on, account_id: fields.account_id,
    })
    if (error) throw error
  }
  const { error: e2 } = await supabase.from('transactions').insert({
    occurred_on: purchased_on, amount: fields.total, description: `${fields.name} (Afterpay)`, category, source: 'afterpay', afterpay_order_id: id,
  })
  if (e2) throw e2
  return id
}

/** Moves an order's payment schedule: payment 1 on this date, the rest every 2 weeks after. */
export async function setAfterpayFirstPayment(orderId: string, firstPayment: string): Promise<void> {
  const { error } = await supabase.from('afterpay_orders').update({ order_date: firstPayment }).eq('id', orderId)
  if (error) throw error
}

/** Parses "$1,234.50" style input. Empty → null. */
export function parseMoney(v: string): number | null {
  const t = v.replace(/[$,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? round2(n) : null
}

// ---------------------------------------------------------------------------
// Money in (besides paychecks)
// ---------------------------------------------------------------------------

/** How many days after its date an expected deposit keeps asking "did it land?" */
export const EXPECTED_GRACE_DAYS = 5

export const incomeOn = (d: MoneyData, date: string) => d.income.filter((x) => x.received_on === date)

/** Anything money-in to show on this day (today also counts deposits still waiting from the last few days). */
export function hasMoneyIn(d: MoneyData, date: string, today: string): boolean {
  if (incomeOn(d, date).length) return true
  if (date === today) return waitingDeposits(d, today).length > 0
  return date > today && expectedOn(d, date).some((e) => !e.got)
}

export interface Expected { source: IncomeSource; date: string; got: Income | undefined }

/** Side work (or any expected deposit) due on this exact day, whether it landed or not. */
export function expectedOn(d: MoneyData, date: string): Expected[] {
  return d.incomeSources
    .filter((s) => s.days.some((day) => isMonthlyDueOn(day, date)))
    .map((s) => ({ source: s, date, got: d.income.find((x) => x.income_source_id === s.id && x.expected_on === date) }))
}

/** Expected deposits that haven't been confirmed yet, from the last few days through today (oldest first). */
export function waitingDeposits(d: MoneyData, today: string): Expected[] {
  const out: Expected[] = []
  for (let i = EXPECTED_GRACE_DAYS; i >= 0; i--) {
    for (const e of expectedOn(d, addDays(today, -i))) if (!e.got) out.push(e)
  }
  return out
}

/** The expected day a side-work deposit on `date` most likely belongs to: unconfirmed, up to 5 days before or 2 days after. */
export function matchExpected(d: MoneyData, sourceId: string, date: string): string | null {
  for (const off of [0, -1, 1, -2, 2, -3, -4, -5]) {
    const k = addDays(date, off)
    const e = expectedOn(d, k).find((x) => x.source.id === sourceId)
    if (e && !e.got) return k
  }
  return null
}

export async function addIncome(d: MoneyData, f: { amount: number; kind: IncomeKind; from_name: string | null; account_id: string | null; received_on: string; note?: string | null; expected_on?: string | null }): Promise<void> {
  let income_source_id: string | null = null
  let expected_on: string | null = null
  if (f.kind === 'side_work') {
    const src = d.incomeSources.find((s) => s.name.toLowerCase().includes('side')) ?? d.incomeSources[0]
    if (src) {
      income_source_id = src.id
      expected_on = f.expected_on ?? matchExpected(d, src.id, f.received_on)
    }
  }
  const { error } = await supabase.from('income').insert({
    received_on: f.received_on, amount: f.amount, kind: f.kind, from_name: f.from_name?.trim() || null, account_id: f.account_id,
    income_source_id, expected_on, note: f.note ?? null,
  })
  if (error) {
    if (error.code === '23505') throw new Error('That side-work deposit is already logged.')
    throw error
  }
}

export async function deleteIncome(id: string): Promise<void> {
  const { error } = await supabase.from('income').delete().eq('id', id)
  if (error) throw error
}

export async function setExpectedAmount(sourceId: string, amount: number | null): Promise<void> {
  const { error } = await supabase.from('income_sources').update({ expected_amount: amount }).eq('id', sourceId)
  if (error) throw error
}

/** Default account for money in: Zelle → NFCU (the bills account), side work → its own account (SoFi). */
export function defaultIncomeAccount(d: MoneyData, kind: IncomeKind): string | null {
  if (kind === 'side_work') return (d.incomeSources.find((s) => s.name.toLowerCase().includes('side')) ?? d.incomeSources[0])?.account_id ?? null
  return billsAccountId(d) ?? d.accounts.find((a) => a.kind === 'checking')?.id ?? null
}

/** Paychecks that have landed in a range (inclusive). */
export function paychecksBetween(d: MoneyData, from: string, to: string): number {
  let n = 0
  for (let k = from; k <= to; k = addDays(k, 1)) if (isPayday(d, k)) n++
  return round2(n * paycheckTotal(d))
}
