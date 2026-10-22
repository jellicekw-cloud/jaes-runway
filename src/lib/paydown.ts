import { supabase } from './supabase'
import { addDays, daysBetween } from './dates'
import { billsAccountId, isPayday, type MoneyData, type TripCost } from './money'
import { CUSHION, walk, windowEnd } from './afford'
import type { Card } from './types'

// Paying down cards: on payday, find what's safely extra in NFCU (after everything due before the next payday,
// keeping the $250 cushion), suggest a share of it (40% by default), and send it to the highest-APR card first.

export const DEFAULT_SHARE = 40
const PAYDAY_WINDOW_DAYS = 2   // the suggestion stays up for payday and the 2 days after

const round2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The most recent payday on or before today. */
export function lastPayday(m: MoneyData, today: string): string | null {
  for (let i = 0; i <= 31; i++) { const k = addDays(today, -i); if (isPayday(m, k)) return k }
  return null
}

export function inPaydayWindow(m: MoneyData, today: string): string | null {
  const p = lastPayday(m, today)
  return p && daysBetween(p, today) <= PAYDAY_WINDOW_DAYS ? p : null
}

/** Cards with a balance, highest APR first (cards with no APR entered go last, biggest balance first). */
export function payoffOrder(cards: Card[]): Card[] {
  return cards.filter((c) => (c.balance ?? 0) > 0).sort((a, b) => {
    if (a.apr === null && b.apr === null) return (b.balance ?? 0) - (a.balance ?? 0)
    if (a.apr === null) return 1
    if (b.apr === null) return -1
    return b.apr - a.apr || (b.balance ?? 0) - (a.balance ?? 0)
  })
}

export interface Suggestion {
  payday: string
  accountId: string
  accountName: string
  lowest: number                 // lowest NFCU balance before the next payday, with nothing extra paid
  lowestOn: string
  safeExtra: number              // above the cushion
  share: number                  // %
  total: number                  // what Runway suggests sending
  split: { card: Card; amount: number }[]
  alreadyPaid: number            // extra already sent since this payday
  nextPayday: string | null
}

/** Payday suggestion, or null when it isn't payday week, there's nothing safely extra, or no card has a balance. */
export function paydownSuggestion(m: MoneyData, today: string, trips: TripCost[]): Suggestion | null {
  const payday = inPaydayWindow(m, today)
  if (!payday) return null
  const acct = m.accounts.find((a) => a.id === billsAccountId(m))
  if (!acct) return null
  const order = payoffOrder(m.cards)
  if (!order.length) return null
  const { end, payday: next } = windowEnd(m, today)
  const days = walk(m, acct, today, end, [], trips)
  if (!days) return null
  const low = days.reduce((x, d) => (d.balance < x.balance ? d : x), days[0])
  const safeExtra = round2(Math.max(0, low.balance - CUSHION))
  const share = m.settings?.paydown_share ?? DEFAULT_SHARE
  const alreadyPaid = round2(m.extraPayments.filter((x) => x.paid_on >= payday).reduce((t, x) => t + x.amount, 0))
  let left = Math.floor((safeExtra * share) / 100 / 5) * 5   // round down to $5
  const total0 = left
  const split: { card: Card; amount: number }[] = []
  for (const c of order) {
    if (left <= 0) break
    const amt = Math.min(left, round2(c.balance ?? 0))
    if (amt > 0) { split.push({ card: c, amount: amt }); left = round2(left - amt) }
  }
  const total = round2(total0 - left)
  return {
    payday, accountId: acct.id, accountName: acct.institution ?? acct.name, lowest: low.balance, lowestOn: low.date,
    safeExtra, share, total, split, alreadyPaid, nextPayday: next,
  }
}

/** Records the extra payment(s): lowers each card's balance; the checking estimate counts it too. */
export async function payExtra(m: MoneyData, accountId: string, parts: { card: Card; amount: number }[], today: string): Promise<void> {
  for (const p of parts) {
    if (p.amount <= 0) continue
    const { error } = await supabase.from('card_extra_payments').insert({ card_id: p.card.id, amount: p.amount, paid_on: today, account_id: accountId })
    if (error) throw error
    const card = m.cards.find((c) => c.id === p.card.id)
    if (card && card.balance !== null) {
      const { error: e2 } = await supabase.from('cards').update({ balance: Math.max(0, round2(card.balance - p.amount)) }).eq('id', card.id)
      if (e2) throw e2
    }
  }
}

export async function undoExtra(m: MoneyData, id: string): Promise<void> {
  const x = m.extraPayments.find((e) => e.id === id)
  if (!x) return
  const { error } = await supabase.from('card_extra_payments').delete().eq('id', id)
  if (error) throw error
  const card = m.cards.find((c) => c.id === x.card_id)
  if (card && card.balance !== null) {
    const { error: e2 } = await supabase.from('cards').update({ balance: round2(card.balance + x.amount) }).eq('id', card.id)
    if (e2) throw e2
  }
}

export async function setShare(share: number): Promise<void> {
  const { data: u } = await supabase.auth.getSession()
  const { error } = await supabase.from('settings').update({ paydown_share: share }).eq('user_id', u.session?.user.id ?? '')
  if (error) throw error
}

// ---------------------------------------------------------------------------
// The plan: when you'd be done, with minimums only vs. minimums + extra each payday
// ---------------------------------------------------------------------------

export interface PlanResult { months: number | null; interest: number; done: string | null }

/**
 * Month by month: interest is added, each card gets its minimum, and the extra goes to the highest-APR card.
 * A paid-off card's minimum rolls into the extra (that's what speeds it up). null months = never pays off.
 */
export function simulate(cards: Card[], extraPerMonth: number, today: string, rollover = true): PlanResult {
  const cs = payoffOrder(cards).map((c) => ({ bal: c.balance ?? 0, apr: (c.apr ?? 0) / 100, min: c.minimum_payment ?? 0 }))
  if (!cs.length) return { months: 0, interest: 0, done: today }
  let interest = 0
  for (let month = 1; month <= 600; month++) {
    let pool = extraPerMonth
    for (const c of cs) {
      if (c.bal <= 0) { if (rollover) pool += c.min; continue }
      const i = c.bal * (c.apr / 12)
      interest += i
      c.bal += i
      const pay = Math.min(c.bal, c.min)
      c.bal -= pay
      if (rollover && pay < c.min) pool += c.min - pay
    }
    for (const c of cs) {
      if (pool <= 0) break
      if (c.bal <= 0) continue
      const pay = Math.min(c.bal, pool)
      c.bal -= pay; pool -= pay
    }
    if (cs.every((c) => c.bal <= 0.005)) {
      const d = new Date(today + 'T12:00:00'); d.setMonth(d.getMonth() + month)
      return { months: month, interest: round2(interest), done: d.toISOString().slice(0, 7) }
    }
  }
  return { months: null, interest: round2(interest), done: null }
}

export const monthlyInterest = (cards: Card[]) => round2(cards.reduce((t, c) => t + (c.balance ?? 0) * ((c.apr ?? 0) / 100 / 12), 0))

/** Paydays a month on a 2-week schedule (26 a year). */
export const PAYDAYS_PER_MONTH = 26 / 12

export const money = fmt
