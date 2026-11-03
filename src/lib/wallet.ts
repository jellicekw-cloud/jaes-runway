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
  // Emergencies (stash used) count as spending, but not against your $40 cash budget
  const spentSince = (from: string) => r2(m.transactions.filter((t) => t.category === CASH_CATEGORY && !t.description.startsWith('Emergency stash') && t.occurred_on >= from && t.occurred_on <= today).reduce((s, t) => s + t.amount, 0))
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

// ---------------------------------------------------------------------------
// Emergency stash: over $100 in the Wallet → put 40% of it away (keeping at least $40 to spend),
// into the stash until it holds $250, then into DECU savings instead.
// ---------------------------------------------------------------------------

export const STASH_TRIGGER = 100
export const STASH_SHARE = 0.4
export const STASH_KEEP = 40

export const stashOf = (m: MoneyData): Account | undefined => m.accounts.find((a) => a.kind === 'stash')

export function stashBalance(m: MoneyData, today: string): number {
  const s = stashOf(m)
  return s ? estimateBalance(m, s, today).estimate ?? 0 : 0
}

export interface StashIdea { amount: number; to: Account; toStash: boolean; cash: number }

export function stashSuggestion(m: MoneyData, today: string): StashIdea | null {
  const st = walletStatus(m, today)
  const stash = stashOf(m)
  if (!st || !stash || !st.counted || st.cash === null || st.cash <= STASH_TRIGGER) return null
  let amount = Math.floor(Math.min(st.cash * STASH_SHARE, st.cash - STASH_KEEP))
  const goal = stash.goal_amount ?? 250
  const have = stashBalance(m, today)
  if (have < goal) return amount >= 1 ? { amount: Math.min(amount, Math.floor(goal - have)), to: stash, toStash: true, cash: st.cash } : null
  const decu = m.accounts.find((a) => a.kind === 'savings')
  if (!decu) return null
  amount = Math.max(0, amount)
  return amount >= 1 ? { amount, to: decu, toStash: false, cash: st.cash } : null
}

/** Moves cash from the Wallet into the stash (or DECU). */
export async function stashCash(m: MoneyData, idea: StashIdea, today: string): Promise<void> {
  const w = walletOf(m)
  if (!w) return
  await addTransfer({ from_account_id: w.id, to_account_id: idea.to.id, amount: idea.amount, moved_on: today, note: idea.toStash ? 'Emergency stash' : 'From cash' })
}

/** Used some of the stash for an emergency: the stash goes down and it counts as cash spent. */
export async function useStash(m: MoneyData, amount: number, note: string, today: string): Promise<void> {
  const s = stashOf(m)
  if (!s) return
  await addTransfer({ from_account_id: s.id, to_account_id: null, amount, moved_on: today, note: note || 'Emergency' })
  const { error } = await supabase.from('transactions').insert({
    occurred_on: today, amount: r2(amount), description: `Emergency stash${note ? ` · ${note}` : ''}`, category: CASH_CATEGORY, source: 'manual', account_id: null, card_id: null,
  })
  if (error) throw error
}
