import { DAYS, MONTHS, addDays, dateOf, daysBetween, isMonthlyDueOn, keyOf } from './dates'
import { paychecksBetween, type MoneyData } from './money'
import type { Card } from './types'

// Paydown progress, statement timing and the monthly recap.

const round2 = (n: number) => Math.round(n * 100) / 100

/** A card's balance on a day: the last snapshot on or before it (null before history starts). */
function balanceOn(m: MoneyData, cardId: string, date: string): number | null {
  let v: number | null = null
  for (const s of m.cardHistory) if (s.card_id === cardId && s.recorded_on <= date) v = s.balance
  return v
}

/** Total card balance per day since history began (one point per day that changed, plus today). */
export function debtSeries(m: MoneyData, today: string): { date: string; total: number }[] {
  const dates = [...new Set(m.cardHistory.map((s) => s.recorded_on))].sort()
  if (!dates.length) return []
  if (dates[dates.length - 1] < today) dates.push(today)
  return dates.map((d) => ({ date: d, total: round2(m.cards.reduce((t, c) => t + (balanceOn(m, c.id, d) ?? 0), 0)) }))
}

/** Rough interest avoided by extra payments so far: each payment × its card's APR for the months since. */
export function interestAvoided(m: MoneyData, today: string): number {
  return round2(m.extraPayments.reduce((t, x) => {
    const apr = (m.cards.find((c) => c.id === x.card_id)?.apr ?? 0) / 100
    const months = Math.max(1, daysBetween(x.paid_on, today) / 30.4)
    return t + x.amount * (apr / 12) * months
  }, 0))
}

export interface Milestone { key: string; card: Card; kind: 'paid_off' | 'under_30'; on: string }

/** New milestones in the last week: a card hit $0, or dropped to 30% used or under. */
export function recentMilestones(m: MoneyData, today: string): Milestone[] {
  const out: Milestone[] = []
  const since = addDays(today, -7)
  for (const c of m.cards) {
    const snaps = m.cardHistory.filter((s) => s.card_id === c.id)
    for (let i = 1; i < snaps.length; i++) {
      const before = snaps[i - 1].balance, now = snaps[i].balance, on = snaps[i].recorded_on
      if (on < since) continue
      if (before > 0 && now <= 0) out.push({ key: `paid_off:${c.id}`, card: c, kind: 'paid_off', on })
      else if (c.credit_limit && before / c.credit_limit > 0.3 && now / c.credit_limit <= 0.3 && now > 0) out.push({ key: `under_30:${c.id}:${on.slice(0, 7)}`, card: c, kind: 'under_30', on })
    }
  }
  return out
}

export interface StatementSoon { card: Card; closes: string; days: number; usedNow: number | null; payForUnder30: number | null }

/** Cards whose statement closes in the next 3 days (and still have a balance). */
export function statementsSoon(m: MoneyData, today: string, within = 3): StatementSoon[] {
  const out: StatementSoon[] = []
  for (const c of m.cards) {
    if (!c.statement_day || !c.balance || c.balance <= 0) continue
    for (let i = 0; i <= within; i++) {
      const k = addDays(today, i)
      if (!isMonthlyDueOn(c.statement_day, k)) continue
      const used = c.credit_limit ? Math.round((c.balance / c.credit_limit) * 100) : null
      const need = c.credit_limit && used !== null && used > 30 ? Math.ceil(c.balance - 0.29 * c.credit_limit) : null
      out.push({ card: c, closes: k, days: i, usedNow: used, payForUnder30: need })
      break
    }
  }
  return out.sort((a, b) => a.days - b.days)
}

export const closesText = (s: StatementSoon) => (s.days === 0 ? 'today' : s.days === 1 ? 'tomorrow' : DAYS[dateOf(s.closes).getDay()])

// ---------------------------------------------------------------------------
// Monthly recap
// ---------------------------------------------------------------------------

export interface Recap {
  month: string               // 'YYYY-MM'
  label: string               // 'October'
  extraPaid: number
  minimumsPaid: number
  debtStart: number | null
  debtEnd: number | null
  interestAvoided: number
  paychecks: number
  otherIn: number
  spent: number
  categories: { name: string; amount: number; before: number }[]
}

export const lastMonthKey = (today: string) => { const d = dateOf(today); return keyOf(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7) }

export function recap(m: MoneyData, month: string): Recap {
  const [y, mo] = month.split('-').map(Number)
  const first = `${month}-01`
  const last = keyOf(new Date(y, mo, 0))
  const prevFirst = keyOf(new Date(y, mo - 2, 1)), prevLast = keyOf(new Date(y, mo - 1, 0))
  const inMonth = (d: string) => d >= first && d <= last
  const extra = m.extraPayments.filter((x) => inMonth(x.paid_on))
  const debtAt = (d: string) => {
    if (!m.cardHistory.some((s) => s.recorded_on <= d)) return null
    return round2(m.cards.reduce((t, c) => t + (balanceOn(m, c.id, d) ?? 0), 0))
  }
  const byCat = (from: string, to: string) => {
    const map = new Map<string, number>()
    for (const t of m.transactions) if (t.occurred_on >= from && t.occurred_on <= to) map.set(t.category || 'Other', (map.get(t.category || 'Other') ?? 0) + t.amount)
    return map
  }
  const now = byCat(first, last), before = byCat(prevFirst, prevLast)
  const categories = [...now.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, amount]) => ({ name, amount: round2(amount), before: round2(before.get(name) ?? 0) }))
  return {
    month, label: MONTHS[mo - 1],
    extraPaid: round2(extra.reduce((t, x) => t + x.amount, 0)),
    minimumsPaid: round2(m.payments.filter((p) => p.card_id && p.paid_on && inMonth(p.paid_on)).reduce((t, p) => t + p.amount, 0)),
    debtStart: debtAt(addDays(first, -1)) ?? debtAt(first),
    debtEnd: debtAt(last),
    interestAvoided: round2(extra.reduce((t, x) => t + x.amount * ((m.cards.find((c) => c.id === x.card_id)?.apr ?? 0) / 100 / 12), 0)),
    paychecks: paychecksBetween(m, first, last),
    otherIn: round2(m.income.filter((x) => inMonth(x.received_on)).reduce((t, x) => t + x.amount, 0)),
    spent: round2(m.transactions.filter((t) => inMonth(t.occurred_on)).reduce((s, t) => s + t.amount, 0)),
    categories,
  }
}

/** The recap card shows on Home for the first 3 days of the month. */
export const recapWeek = (today: string) => Number(today.slice(8, 10)) <= 3
