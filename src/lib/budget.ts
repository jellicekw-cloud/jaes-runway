import { supabase } from './supabase'
import { addDays, keyOf, lastDayOfMonth, MONTHS } from './dates'
import { cashFlow } from './flow'
import {
  billsAccountId, challengeSteps, hasPayActual, isPayday, obligationsOn, payInto, type MoneyData, type Obligation, type SavingsStep,
} from './money'
import { isFastFood } from './insights'
import { CATEGORIES, SENT_CATEGORY, type Account } from './types'

// The monthly Budget (your Clover Brook sheet): Budget vs Actual for 9 categories.
// Actual = money that left NFCU or SoFi, counted exactly like In vs out (so the two always agree):
// bills, card payments, Afterpay/Affirm, auto-pay, purchases from the banks, cash you took out, and savings.
// Card purchases show up when you pay the card (in Credit Cards), not twice.

export const BUDGET_CATS = [
  'House', 'Food', 'Utilities', 'Transportation', 'Life Insurance', 'Credit Cards', 'Streaming Services', 'Miscellaneous Expenses', 'Savings Contributions',
] as const
export type BudgetCat = (typeof BUDGET_CATS)[number]

export const CAT_COLOR: Record<BudgetCat, string> = {
  House: '#22405F', Food: '#DB2777', Utilities: '#0EA5E9', Transportation: '#F59E0B', 'Life Insurance': '#94A3B8',
  'Credit Cards': '#E8562A', 'Streaming Services': '#A3A635', 'Miscellaneous Expenses': '#7C3AED', 'Savings Contributions': '#15803D',
}
export const CAT_SHORT: Record<BudgetCat, string> = {
  House: 'House', Food: 'Food', Utilities: 'Utilities', Transportation: 'Transportation', 'Life Insurance': 'Life Insurance',
  'Credit Cards': 'Credit Cards', 'Streaming Services': 'Streaming', 'Miscellaneous Expenses': 'Miscellaneous', 'Savings Contributions': 'Savings',
}

/** Bank colors from your sheet: purple = NFCU, orange = SoFi. */
export function bankColor(label: string): { bg: string; fg: string; solid: string } {
  const l = label.toLowerCase()
  if (l.includes('nfcu') || l.includes('navy')) return { bg: '#EDE9FE', fg: '#5B21B6', solid: '#6D28D9' }
  if (l.includes('sofi')) return { bg: '#FFEDD5', fg: '#9A3412', solid: '#E8762A' }
  if (l.includes('decu') || l.includes('delta')) return { bg: '#CCFBF1', fg: '#115E59', solid: '#0F766E' }
  return { bg: '#E2E8F0', fg: '#334155', solid: '#64748B' }
}

// ---------------------------------------------------------------------------
// Your saved budget amounts, moved lines and month notes (20_budget.sql)
// ---------------------------------------------------------------------------

export interface BudgetExtras {
  amounts: { month: string; line_key: string; amount: number }[]
  lineCats: { line_key: string; category: BudgetCat }[]
  notes: { month: string; note: string }[]
  ready: boolean   // false until 20_budget.sql has been run
}
export const EMPTY_EXTRAS: BudgetExtras = { amounts: [], lineCats: [], notes: [], ready: false }

export async function loadBudgetExtras(): Promise<BudgetExtras> {
  const [a, c, n] = await Promise.all([
    supabase.from('budget_amounts').select('month, line_key, amount'),
    supabase.from('budget_line_cats').select('line_key, category'),
    supabase.from('budget_notes').select('month, note'),
  ])
  if (a.error || c.error || n.error) return EMPTY_EXTRAS
  return {
    amounts: (a.data ?? []).map((x) => ({ month: String(x.month).slice(0, 7), line_key: x.line_key as string, amount: Number(x.amount) })),
    lineCats: (c.data ?? []) as BudgetExtras['lineCats'],
    notes: (n.data ?? []).map((x) => ({ month: String(x.month).slice(0, 7), note: x.note as string })),
    ready: true,
  }
}

const monthStart = (month: string) => `${month}-01`

/** Set (or clear, with null) what you budget for a line this month. */
export async function setBudgetAmount(month: string, lineKey: string, amount: number | null): Promise<void> {
  const q = amount === null
    ? supabase.from('budget_amounts').delete().eq('month', monthStart(month)).eq('line_key', lineKey)
    : supabase.from('budget_amounts').upsert({ month: monthStart(month), line_key: lineKey, amount }, { onConflict: 'user_id,month,line_key' })
  const { error } = await q
  if (error) throw error
}

/** Move a line to another category (null = back to where it usually goes). */
export async function setLineCategory(lineKey: string, category: BudgetCat | null): Promise<void> {
  const q = category === null
    ? supabase.from('budget_line_cats').delete().eq('line_key', lineKey)
    : supabase.from('budget_line_cats').upsert({ line_key: lineKey, category }, { onConflict: 'user_id,line_key' })
  const { error } = await q
  if (error) throw error
}

export async function setMonthNote(month: string, note: string): Promise<void> {
  const { error } = await supabase.from('budget_notes').upsert({ month: monthStart(month), note }, { onConflict: 'user_id,month' })
  if (error) throw error
}

export const prevMonth = (month: string) => shiftMonth(month, -1)
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/** Copy last month's typed budget amounts into this month (overwrites this month's typed ones). Returns how many. */
export async function copyLastMonth(x: BudgetExtras, month: string): Promise<number> {
  const last = x.amounts.filter((a) => a.month === prevMonth(month))
  if (!last.length) return 0
  const { error } = await supabase.from('budget_amounts')
    .upsert(last.map((a) => ({ month: monthStart(month), line_key: a.line_key, amount: a.amount })), { onConflict: 'user_id,month,line_key' })
  if (error) throw error
  return last.length
}

// ---------------------------------------------------------------------------
// Building a month
// ---------------------------------------------------------------------------

export interface BudgetLine {
  key: string
  name: string
  cat: BudgetCat
  movedCat: boolean          // you moved it
  budget: number
  usualBudget: number        // what's scheduled this month (bills, minimums, auto-pay ...); 0 for spending
  typedBudget: boolean       // you typed this month's budget
  actual: number             // left the bank so far this month
  unmarked: number           // part of actual that's due but not marked paid yet
  later: number              // still scheduled after today
  nextDue: string | null     // next unpaid due date this month
  from: string               // paid from (NFCU, SoFi, a card ...)
  auto: boolean              // comes out by itself
  open: Obligation[]         // due this month and not marked paid (for the ☐)
  paid: Obligation[]         // due this month and marked paid
  paidCount: number
  dueCount: number
  noAmount: boolean          // a bill with no amount set
  note?: string
}

export interface BudgetCatRow { cat: BudgetCat; budget: number; actual: number; lines: BudgetLine[] }

export interface IncomeRow { label: string; amount: number; tag?: 'REAL' | 'USUAL' | 'EXPECTED' }
export interface IncomePanel { account: Account; label: string; rows: IncomeRow[]; total: number }

export interface BudgetMonth {
  month: string
  from: string
  to: string
  through: string            // counted through (today, or the month's end)
  started: boolean
  cats: BudgetCatRow[]
  budgetTotal: number
  actualTotal: number
  incomeTotal: number        // came in so far
  difference: number
  incomeEnd: number          // by the end of the month, with what's scheduled
  outEnd: number
  panels: IncomePanel[]
  fastFood: number
  unmarked: number
  noAmount: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

const has = (re: RegExp, s: string) => re.test(s.toLowerCase())

function billCat(name: string): BudgetCat {
  if (has(/\bkia\b|car note|\bcar\b|auto|\broot\b|toll|vehicle|tesla|charging/, name)) return 'Transportation'
  if (has(/\blife\b|aarp/, name)) return 'Life Insurance'
  if (has(/power|electric|\bwater\b|sewer|\bgas\b|trash|utilit|\bemc\b|sanitation/, name)) return 'Utilities'
  if (has(/mortgage|\bhoa\b|ring|alarm|at&t|\batt\b|fiber|internet|rent|pest|lawn|hvac|home/, name)) return 'House'
  if (has(/netflix|hulu|disney|peacock|max\b|paramount|spotify|youtube|streaming/, name)) return 'Streaming Services'
  return 'Miscellaneous Expenses'
}

export function defaultCat(m: MoneyData, key: string): BudgetCat {
  const [kind, id] = key.split(':')
  if (kind === 'card') return 'Credit Cards'
  if (kind === 'save') return 'Savings Contributions'
  if (kind === 'bill') return billCat(m.bills.find((b) => b.id === id)?.name ?? '')
  if (kind === 'sub') {
    const s = m.subs.find((x) => x.id === id)
    if (!s) return 'Miscellaneous Expenses'
    if (s.category === 'Streaming') return 'Streaming Services'
    if (s.category === 'Insurance') return has(/\blife\b|aarp/, s.name) ? 'Life Insurance' : billCat(s.name)
    if (s.category === 'Home') return 'House'
    const byName = billCat(s.name)
    return byName
  }
  if (key === 'spend:Food' || key === 'spend:fastfood') return 'Food'
  if (key === 'spend:Charging' || key === 'spend:Rides') return 'Transportation'
  return 'Miscellaneous Expenses'
}

function spendName(cat: string): string {
  if (cat === 'Food') return 'Groceries & other food'
  if (cat === 'fastfood') return 'Fast food & delivery'
  if (cat === SENT_CATEGORY) return 'Zelle & Cash App sent'
  if (cat === 'Charging') return 'EV charging'
  return `${cat} (debit)`
}

const lineOrder = (k: string) => (k.startsWith('bill:') ? 0 : k.startsWith('sub:') ? 1 : k.startsWith('card:') ? 2 : k.startsWith('plan:') ? 3 : k.startsWith('spend:') ? 4 : k === 'cash' ? 5 : 6)

export function budgetMonth(m: MoneyData, x: BudgetExtras, month: string, today: string): BudgetMonth {
  const from = monthStart(month)
  const to = `${month}-${String(lastDayOfMonth(from)).padStart(2, '0')}`
  const started = from <= today
  const through = !started ? addDays(from, -1) : today < to ? today : to
  const inRange = (d: string) => started && d >= from && d <= through

  const checking = m.accounts.filter((a) => a.kind === 'checking')
  const checkingIds = new Set(checking.map((a) => a.id))
  const savingsIds = new Set(m.accounts.filter((a) => a.kind === 'savings' || a.kind === 'vault').map((a) => a.id))
  const cashIds = new Set(m.accounts.filter((a) => a.kind === 'cash').map((a) => a.id))
  const label = (id: string | null | undefined) => {
    const a = m.accounts.find((y) => y.id === id)
    return a ? a.institution ?? a.name : ''
  }
  const planOnCard = (id: string | null) => Boolean(id && m.orders.find((o) => o.id === id)?.card_id)
  const lines = new Map<string, BudgetLine>()
  const line = (key: string, name: string, from = ''): BudgetLine => {
    let l = lines.get(key)
    if (!l) {
      const moved = x.lineCats.find((c) => c.line_key === key)?.category
      l = {
        key, name, cat: moved ?? defaultCat(m, key), movedCat: Boolean(moved), budget: 0, usualBudget: 0, typedBudget: false,
        actual: 0, unmarked: 0, later: 0, nextDue: null, from, auto: false, open: [], paid: [], paidCount: 0, dueCount: 0, noAmount: false,
      }
      lines.set(key, l)
    }
    if (!l.from && from) l.from = from
    return l
  }
  const keyFor = (o: Obligation): string | null => {
    if (o.key.startsWith('save:')) return `save:auto:${o.sourceId}`
    if (o.key.startsWith('bill:')) return `bill:${o.sourceId}`
    if (o.kind === 'sub') return `sub:${o.sourceId}`
    if (o.kind === 'card') return `card:${o.sourceId}`
    if (o.kind === 'afterpay') return `plan:${m.orders.find((y) => y.id === o.sourceId)?.provider ?? 'afterpay'}`
    return null
  }
  const nameFor = (o: Obligation, key: string) => key.startsWith('plan:') ? (key === 'plan:affirm' ? 'Affirm' : 'Afterpay / SoFi Pay in 4') : o.name

  // --- Panels: what came in, per bank ---
  const panels: IncomePanel[] = checking.map((a) => ({ account: a, label: a.institution ?? a.name, rows: [], total: 0 }))
  const panelOf = (id: string | null) => panels.find((p) => p.account.id === (id ?? billsAccountId(m))) ?? panels[0]
  let payNo = 0
  for (let k = from; k <= to; k = addDays(k, 1)) {
    if (!isPayday(m, k)) continue
    payNo++
    const real = hasPayActual(m, k)
    for (const p of panels) {
      const amt = payInto(m, k, p.account.id)
      if (!amt && real) continue
      if (!amt && !m.splits.some((s) => s.account_id === p.account.id)) continue
      p.rows.push({ label: `Paycheck ${payNo} · ${shortDay(k)}`, amount: amt, tag: k > through ? 'EXPECTED' : real ? 'REAL' : 'USUAL' })
      if (k <= through && started) p.total += amt
    }
  }
  const sums = new Map<string, number>()
  const addIn = (id: string | null, what: string, amt: number) => {
    const p = panelOf(id)
    if (!p) return
    const k = `${p.account.id}|${what}`
    sums.set(k, (sums.get(k) ?? 0) + amt)
    p.total += amt
  }
  for (const i of m.income) {
    if (!inRange(i.received_on)) continue
    addIn(i.account_id, i.kind === 'side_work' ? 'Side work' : i.kind === 'refund' ? 'Refunds' : 'Zelle & other', i.amount)
  }

  // --- So far: exactly what In vs out counts ---
  let fastFood = 0
  for (const t of m.transactions) {
    if (!inRange(t.occurred_on) || !t.account_id || !checkingIds.has(t.account_id) || t.source !== 'manual') continue
    if (t.amount < 0) { addIn(t.account_id, 'Refunds', -t.amount); continue }
    const fast = t.category === 'Food' && isFastFood(t.description)
    if (fast) fastFood += t.amount
    const c = fast ? 'fastfood' : t.category
    line(`spend:${c}`, spendName(c), label(t.account_id)).actual += t.amount
  }
  for (const p of panels) {
    for (const what of ['Side work', 'Zelle & other', 'Refunds']) {
      const v = sums.get(`${p.account.id}|${what}`)
      if (v) p.rows.push({ label: what, amount: r2(v) })
    }
    p.total = r2(p.total)
  }
  for (const p of m.payments) {
    if (!inRange(p.paid_on)) continue
    if (p.account_id && !checkingIds.has(p.account_id)) continue
    if (p.card_id) line(`card:${p.card_id}`, m.cards.find((c) => c.id === p.card_id)?.name ?? 'Card', 'NFCU').actual += p.amount
    else if (p.bill_id) line(`bill:${p.bill_id}`, m.bills.find((b) => b.id === p.bill_id)?.name ?? 'Bill', label(p.account_id)).actual += p.amount
    else if (p.afterpay_order_id && !planOnCard(p.afterpay_order_id)) {
      const prov = m.orders.find((o) => o.id === p.afterpay_order_id)?.provider ?? 'afterpay'
      line(`plan:${prov}`, prov === 'affirm' ? 'Affirm' : 'Afterpay / SoFi Pay in 4', label(p.account_id)).actual += p.amount
    }
  }
  for (const e of m.extraPayments) {
    if (!inRange(e.paid_on)) continue
    const l = line(`card:${e.card_id}`, m.cards.find((c) => c.id === e.card_id)?.name ?? 'Card', label(e.account_id) || 'NFCU')
    l.actual += e.amount
    l.note = 'Includes extra paydown'
  }
  for (const t of m.transfers) {
    if (!inRange(t.moved_on)) continue
    const fromBank = t.from_account_id && checkingIds.has(t.from_account_id)
    if (fromBank && t.to_account_id && cashIds.has(t.to_account_id)) line('cash', 'Cash allowance (Wallet)', label(t.from_account_id)).actual += t.amount
    else if (fromBank && t.to_account_id && savingsIds.has(t.to_account_id)) line(`save:to:${t.to_account_id}`, `Added to ${label(t.to_account_id)}`, label(t.from_account_id)).actual += t.amount
    else if (t.from_account_id && savingsIds.has(t.from_account_id) && t.to_account_id && checkingIds.has(t.to_account_id)) {
      line(`save:to:${t.from_account_id}`, `Added to ${label(t.from_account_id)}`, label(t.to_account_id)).actual -= t.amount
    }
  }
  const ch = m.challenge
  const chFrom = ch ? label(ch.from_account_id) || 'SoFi' : ''
  for (const d of m.deposits) if (inRange(d.saved_on)) line('save:challenge', '52-week plan (SoFi Vault)', chFrom).actual += d.amount

  // Due this month: counts so far like In vs out (auto-pay by itself; others on the due day until marked paid),
  // and what's scheduled is the usual budget
  let unmarked = 0
  const noAmount = new Set<string>()
  for (let k = from; k <= to; k = addDays(k, 1)) {
    for (const o of obligationsOn(m, k, today)) {
      if (o.kind === 'afterpay' && planOnCard(o.sourceId)) continue
      if (o.kind === 'sub' && (!o.fromAccountId || !checkingIds.has(o.fromAccountId))) continue
      const key = keyFor(o)
      if (!key) continue
      const l = line(key, nameFor(o, key), label(o.fromAccountId))
      l.usualBudget += o.amount ?? 0
      const soFar = started && k <= through
      if (o.kind === 'sub') {
        l.auto = true
        if (!o.amount) continue
        if (soFar) l.actual += o.amount
        else l.later += o.amount
        if (!soFar && !l.nextDue) l.nextDue = k
        continue
      }
      l.dueCount++
      if (o.status === 'paid' || o.payment) { l.paidCount++; l.paid.push(o); continue }
      l.open.push(o)
      if (!l.nextDue) l.nextDue = k
      if (!o.amount) { if (o.kind === 'bill') { noAmount.add(o.name); l.noAmount = true } continue }
      if (soFar) { l.actual += o.amount; l.unmarked += o.amount; unmarked += o.amount }
      else l.later += o.amount
    }
  }
  // Scheduled savings and cash
  if (ch) {
    const steps: SavingsStep[] = challengeSteps(m).filter((s) => s.date >= from && s.date <= to)
    if (steps.length) {
      const l = line('save:challenge', '52-week plan (SoFi Vault)', chFrom)
      for (const s of steps) {
        l.usualBudget += s.amount
        l.dueCount++
        if (s.deposit) l.paidCount++
        else { if (!l.nextDue) l.nextDue = s.date; if (s.date > through) l.later += s.amount }
      }
    }
  }
  const wallet = m.accounts.find((a) => a.kind === 'cash')
  if (wallet) {
    let paydays = 0
    for (let k = from; k <= to; k = addDays(k, 1)) if (isPayday(m, k)) paydays++
    const per = m.settings?.cash_per_payday ?? 40
    if (paydays && per) line('cash', 'Cash allowance (Wallet)', label(billsAccountId(m))).usualBudget += per * paydays
  }

  // Budget: what you typed for this month, else the usual
  for (const l of lines.values()) {
    const typed = x.amounts.find((a) => a.month === month && a.line_key === l.key)
    l.usualBudget = r2(l.usualBudget)
    l.budget = typed ? typed.amount : l.usualBudget
    l.typedBudget = Boolean(typed)
    l.actual = r2(l.actual); l.later = r2(l.later); l.unmarked = r2(l.unmarked)
  }
  // Lines you budgeted with nothing scheduled or spent yet still show
  for (const a of x.amounts.filter((y) => y.month === month)) {
    if (lines.has(a.line_key)) continue
    const l = line(a.line_key, lineNameFromKey(m, a.line_key))
    l.budget = a.amount
    l.typedBudget = true
  }

  const cats: BudgetCatRow[] = BUDGET_CATS.map((cat) => {
    const ls = [...lines.values()].filter((l) => l.cat === cat)
      .sort((a, b) => lineOrder(a.key) - lineOrder(b.key) || b.budget - a.budget || a.name.localeCompare(b.name))
    return { cat, lines: ls, budget: r2(ls.reduce((t, l) => t + l.budget, 0)), actual: r2(ls.reduce((t, l) => t + l.actual, 0)) }
  })
  const budgetTotal = r2(cats.reduce((t, c) => t + c.budget, 0))
  const actualTotal = r2(cats.reduce((t, c) => t + c.actual, 0))
  const f = cashFlow(m, from, to, today, month)
  const incomeTotal = started ? f.inSoFar : 0
  return {
    month, from, to, through, started, cats, budgetTotal, actualTotal, incomeTotal,
    difference: r2(incomeTotal - actualTotal),
    incomeEnd: f.inEnd, outEnd: r2(f.outEnd + f.savedEnd),
    panels, fastFood: r2(fastFood), unmarked: r2(unmarked), noAmount: [...noAmount],
  }
}

export function lineNameFromKey(m: MoneyData, key: string): string {
  const [kind, id, more] = key.split(':')
  if (kind === 'bill') return m.bills.find((b) => b.id === id)?.name ?? 'Bill'
  if (kind === 'sub') return m.subs.find((s) => s.id === id)?.name ?? 'Subscription'
  if (kind === 'card') return m.cards.find((c) => c.id === id)?.name ?? 'Card'
  if (kind === 'plan') return id === 'affirm' ? 'Affirm' : 'Afterpay / SoFi Pay in 4'
  if (kind === 'spend') return spendName(id)
  if (key === 'cash') return 'Cash allowance (Wallet)'
  if (key === 'save:challenge') return '52-week plan (SoFi Vault)'
  if (kind === 'save' && id === 'to') { const a = m.accounts.find((y) => y.id === more); return `Added to ${a?.institution ?? a?.name ?? 'savings'}` }
  if (kind === 'save' && id === 'auto') { const a = m.accounts.find((y) => y.id === more); return `${a?.institution ?? a?.name ?? 'Savings'} savings` }
  return key
}

/** Spending lines you can budget before anything is logged: every purchase category, plus fast food. */
export function spendKeys(): string[] {
  return ['spend:Food', 'spend:fastfood', ...CATEGORIES.filter((c) => c !== 'Food').map((c) => `spend:${c}`)]
}
/** Where a line goes: where you moved it, else its usual category. */
export const lineCat = (m: MoneyData, x: BudgetExtras, key: string): BudgetCat => x.lineCats.find((c) => c.line_key === key)?.category ?? defaultCat(m, key)

function shortDay(k: string): string {
  return `${MONTHS[Number(k.slice(5, 7)) - 1].slice(0, 3)} ${Number(k.slice(8, 10))}`
}

// ---------------------------------------------------------------------------
// The year
// ---------------------------------------------------------------------------

export interface YearMonth { month: string; label: string; tracked: boolean; b: BudgetMonth | null }

/** Runway's first month (the first payday it knows about). */
export function trackingStart(m: MoneyData): string {
  const start = m.settings?.pay_start ?? keyOf(new Date())
  return start.slice(0, 7)
}

export function budgetYear(m: MoneyData, x: BudgetExtras, year: number, today: string): YearMonth[] {
  const first = trackingStart(m)
  const now = today.slice(0, 7)
  return MONTHS.map((name, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`
    const tracked = month >= first && month <= now
    return { month, label: name.slice(0, 3), tracked, b: tracked ? budgetMonth(m, x, month, today) : null }
  })
}

// ---------------------------------------------------------------------------
// The 52-week plan (the savings challenge) for the Savings panel
// ---------------------------------------------------------------------------

export function planStatus(m: MoneyData, today: string) {
  const steps = challengeSteps(m)
  if (!steps.length) return null
  const saved = r2(steps.reduce((t, s) => t + (s.deposit ? s.amount : 0), 0))
  const doneCount = steps.filter((s) => s.deposit).length
  const next = steps.find((s) => !s.deposit) ?? null
  const shouldHave = r2(steps.filter((s) => s.date <= today).reduce((t, s) => t + s.amount, 0))
  return { steps, saved, doneCount, total: steps.length, next, due: Boolean(next && next.date <= today), behind: r2(Math.max(0, shouldHave - saved)), goal: r2(steps.reduce((t, s) => t + s.amount, 0)) }
}
