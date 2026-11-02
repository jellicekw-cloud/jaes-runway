import { supabase } from './supabase'
import { addDays, daysBetween } from './dates'
import { addTransfer, estimateBalance, isPayday, nextPayday, type MoneyData } from './money'
import type { Account } from './types'

// The cash Wallet: cash you take out (a move from a bank, not spending), and recounts.
// A recount that finds less cash than expected logs the difference as "Cash spent" (category Cash),
// so cash shows in your spending and the monthly recap. Never part of "Can I afford it?".

export const CASH_CATEGORY = 'Cash'
const r2 = (n: number) => Math.round(n * 100) / 100

export const walletOf = (m: MoneyData): Account | undefined => m.accounts.find((a) => a.kind === 'cash')

/** The last payday on or before today (the start of this cash period). */
export function periodStart(m: MoneyData, today: string): string | null {
  const every = m.settings?.pay_every_days ?? 14
  for (let i = 0; i < every; i++) { const k = addDays(today, -i); if (isPayday(m, k)) return k }
  return null
}

export interface WalletStatus {
  wallet: Account; cash: number | null; counted: boolean
  budget: number; spent: number; left: number
  weekBudget: number; weekSpent: number; week: 1 | 2
  start: string | null; payday: string | null
}

export function walletStatus(m: MoneyData, today: string): WalletStatus | null {
  const wallet = walletOf(m)
  if (!wallet) return null
  const est = estimateBalance(m, wallet, today)
  const budget = Number(m.settings?.cash_per_payday ?? 40)
  const every = m.settings?.pay_every_days ?? 14
  const start = periodStart(m, today)
  const spentSince = (from: string) => r2(m.transactions.filter((t) => t.category === CASH_CATEGORY && t.occurred_on >= from && t.occurred_on <= today).reduce((s, t) => s + t.amount, 0))
  const spent = start ? spentSince(start) : 0
  const week: 1 | 2 = start && daysBetween(start, today) >= 7 ? 2 : 1
  const weekStart = start ? addDays(start, week === 2 ? 7 : 0) : today
  const weeks = Math.max(1, Math.round(every / 7))
  return {
    wallet, cash: est.estimate, counted: wallet.balance !== null,
    budget, spent, left: r2(Math.max(0, budget - spent)),
    weekBudget: r2(budget / weeks), weekSpent: spentSince(weekStart), week,
    start, payday: nextPayday(m, addDays(today, 1))?.date ?? null,
  }
}

/** Took cash out of a bank: moves it into the Wallet (not spending). */
export async function withdrawCash(m: MoneyData, fromAccountId: string, amount: number, today: string): Promise<void> {
  const w = walletOf(m)
  if (!w) throw new Error('Run 16_wallet.sql in Supabase first.')
  await addTransfer({ from_account_id: fromAccountId, to_account_id: w.id, amount, moved_on: today, note: 'Cash' })
}

/**
 * Recount: what's really in your wallet. Less than Runway expected → the difference is logged as cash spent.
 * Returns what was spent (0 if nothing, or if this is the first count).
 */
export async function recountCash(m: MoneyData, counted: number, today: string): Promise<number> {
  const w = walletOf(m)
  if (!w) throw new Error('Run 16_wallet.sql in Supabase first.')
  const expected = w.balance === null ? null : estimateBalance(m, w, today).estimate
  const spent = expected === null ? 0 : r2(expected - counted)
  if (spent > 0) {
    const { error } = await supabase.from('transactions').insert({
      occurred_on: today, amount: spent, description: 'Cash spent', category: CASH_CATEGORY, source: 'manual', account_id: null, card_id: null,
    })
    if (error) throw error
  }
  const { error } = await supabase.from('accounts').update({ balance: r2(counted), balance_as_of: new Date().toISOString() }).eq('id', w.id)
  if (error) throw error
  return Math.max(0, spent)
}

export async function setCashBudget(perPayday: number): Promise<void> {
  const { error } = await supabase.from('settings').update({ cash_per_payday: r2(perPayday) }).not('user_id', 'is', null)
  if (error) throw error
}
