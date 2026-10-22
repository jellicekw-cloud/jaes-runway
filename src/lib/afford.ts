import { addDays, shortDate } from './dates'
import {
  billsAccountId, estimateBalance, expectedOn, isPayday, nextPayday, obligationsOn, savingsOn, installmentAmount,
  type MoneyData, type TripCost,
} from './money'
import type { Account, Card } from './types'

// "Can I afford it?" Walks each account forward day by day, the same way your money really moves,
// and finds the lowest point it would hit before payday with the purchase taken out.

export const CUSHION = 250            // left over before it counts as a clear yes
export const CARD_LINE = 30           // % used you don't want a card to go over
export const SIDE_WORK_DEFAULT = 100  // when no "Usually" amount is set on the Money tab

export type Verdict = 'yes' | 'tight' | 'no' | 'unknown'

export interface Low { amount: number; date: string; because: string[] }

export interface AccountAnswer {
  kind: 'account'
  account: Account
  verdict: Verdict
  low: Low | null
  fitsOn: string | null        // first day it would be a clear yes, when it isn't now
  payday: string | null        // the payday the check runs up to
  basedOn: string | null       // when the balance was last entered
  missingMinimums: number      // cards due in the window with no minimum entered (counted as $0)
}

export interface AfterpayAnswer {
  kind: 'afterpay'
  account: Account | null
  verdict: Verdict
  low: Low | null
  payments: { date: string; amount: number }[]
  fitsOn: string | null
}

export interface CardAnswer {
  kind: 'card'
  card: Card
  available: number | null
  usedAfter: number | null      // % used after the purchase
  overLine: boolean
}

interface Debit { date: string; amount: number }

/** Balance day by day for one checking account, from today through `until` (inclusive). */
function walk(m: MoneyData, a: Account, today: string, until: string, debits: Debit[], trips: TripCost[]) {
  const start = estimateBalance(m, a, today).estimate
  if (start === null) return null
  const split = m.splits.find((s) => s.account_id === a.id)?.amount ?? 0
  const billsAcct = billsAccountId(m)
  const ch = m.challenge
  const days: { date: string; balance: number; notes: string[] }[] = []
  let bal = start
  for (let k = today; k <= until; k = addDays(k, 1)) {
    const notes: string[] = []
    const later = k > today   // today's paycheck and auto-pay are already in the estimate
    if (later && split && isPayday(m, k)) { bal += split; notes.push(`+ payday`) }
    for (const o of obligationsOn(m, k, today)) {
      if (o.status === 'paid' || o.fromAccountId !== a.id) continue
      if (o.kind === 'sub' && !later) continue
      bal -= o.amount ?? 0
      if (o.amount) notes.push(`${o.short} ${fmt(o.amount)}`)
    }
    const save = savingsOn(m, k)
    if (later && ch && save && !save.deposit) {
      if (ch.from_account_id === a.id) { bal -= save.amount; notes.push(`savings ${fmt(save.amount)}`) }
      if (ch.to_account_id === a.id) bal += save.amount
    }
    for (const e of expectedOn(m, k)) {
      if (e.got || e.source.account_id !== a.id || k < today) continue
      const amt = e.source.expected_amount ?? SIDE_WORK_DEFAULT
      bal += amt; notes.push(`+ ${e.source.name.toLowerCase()} ${fmt(amt)}`)
    }
    if (a.id === billsAcct) for (const t of trips) if (t.date === k && t.amount > 0) { bal -= t.amount; notes.push(`${t.label} ${fmt(t.amount)}`) }
    for (const d of debits) if (d.date === k) { bal -= d.amount; notes.push(`this purchase ${fmt(d.amount)}`) }
    days.push({ date: k, balance: Math.round(bal * 100) / 100, notes })
  }
  return days
}

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The day before the next payday that comes after `date`. */
function windowEnd(m: MoneyData, date: string): { end: string; payday: string | null } {
  const np = nextPayday(m, addDays(date, 1))
  return np ? { end: addDays(np.date, -1), payday: np.date } : { end: addDays(date, 14), payday: null }
}

function lowest(days: { date: string; balance: number; notes: string[] }[], from: string): Low | null {
  let best: Low | null = null
  for (const d of days) {
    if (d.date < from) continue
    if (!best || d.balance < best.amount) best = { amount: d.balance, date: d.date, because: d.notes.filter((n) => !n.startsWith('+')) }
  }
  return best
}

const verdictOf = (low: Low | null): Verdict => (!low ? 'unknown' : low.amount >= CUSHION ? 'yes' : low.amount >= 0 ? 'tight' : 'no')

function checkAccount(m: MoneyData, a: Account, today: string, debits: Debit[], trips: TripCost[]): { low: Low | null; payday: string | null } {
  const last = debits.reduce((x, d) => (d.date > x ? d.date : x), debits[0].date)
  const { end, payday } = windowEnd(m, last)
  const days = walk(m, a, today, end, debits, trips)
  return { low: days ? lowest(days, debits[0].date) : null, payday }
}

/** First day from `after` on (up to 6 weeks) when the purchase would be a clear yes. */
function firstGoodDay(m: MoneyData, a: Account, today: string, after: string, make: (date: string) => Debit[], trips: TripCost[]): string | null {
  for (let i = 1; i <= 42; i++) {
    const d = addDays(after, i)
    if (verdictOf(checkAccount(m, a, today, make(d), trips).low) === 'yes') return d
  }
  return null
}

export function afterpaySchedule(amount: number, date: string): { date: string; amount: number }[] {
  return [1, 2, 3, 4].map((n) => ({ date: addDays(date, (n - 1) * 14), amount: installmentAmount({ total: amount, installments: 4 }, n) }))
}

export function canIAfford(m: MoneyData, today: string, amount: number, date: string, trips: TripCost[]): { accounts: AccountAnswer[]; afterpay: AfterpayAnswer; cards: CardAnswer[] } {
  const when = date < today ? today : date
  const one = (d: string): Debit[] => [{ date: d, amount }]
  const accounts: AccountAnswer[] = m.accounts.filter((a) => a.kind === 'checking').map((a) => {
    const { low, payday } = checkAccount(m, a, today, one(when), trips)
    const verdict = verdictOf(low)
    const est = estimateBalance(m, a, today)
    const missing = (() => {
      let n = 0
      if (!payday) return 0
      for (let k = when; k < payday; k = addDays(k, 1)) n += obligationsOn(m, k, today).filter((o) => o.kind === 'card' && o.status !== 'paid' && o.amount === null && o.fromAccountId === a.id).length
      return n
    })()
    return {
      kind: 'account', account: a, verdict, low, payday, basedOn: est.asOf, missingMinimums: missing,
      fitsOn: verdict === 'yes' || verdict === 'unknown' ? null : firstGoodDay(m, a, today, when, one, trips),
    }
  })

  // Afterpay: 4 payments every 2 weeks, from the account Afterpay charges (NFCU)
  const apAcct = m.accounts.find((a) => a.id === billsAccountId(m)) ?? null
  const plan = afterpaySchedule(amount, when)
  const apLow = apAcct ? checkAccount(m, apAcct, today, plan, trips).low : null
  const apVerdict = verdictOf(apLow)
  const afterpay: AfterpayAnswer = {
    kind: 'afterpay', account: apAcct, verdict: apVerdict, low: apLow, payments: plan,
    fitsOn: apAcct && (apVerdict === 'tight' || apVerdict === 'no') ? firstGoodDay(m, apAcct, today, when, (d) => afterpaySchedule(amount, d), trips) : null,
  }

  const cards: CardAnswer[] = m.cards.map((c) => {
    const limit = c.credit_limit, bal = c.balance
    const available = limit !== null && bal !== null ? Math.round((limit - bal) * 100) / 100 : null
    const usedAfter = limit && bal !== null ? Math.round(((bal + amount) / limit) * 100) : null
    return { kind: 'card', card: c, available, usedAfter, overLine: usedAfter !== null && usedAfter > CARD_LINE }
  })

  return { accounts, afterpay, cards }
}

/** "Kohl's $35, BJ's $45" → a short reason line. */
export function becauseText(low: Low): string {
  const items = low.because.filter((x) => !x.startsWith('this purchase'))
  return items.length ? `after ${items.slice(0, 3).join(', ')}` : ''
}

export const dayText = (d: string, today: string) => (d === today ? 'today' : d === addDays(today, 1) ? 'tomorrow' : shortDate(d))
