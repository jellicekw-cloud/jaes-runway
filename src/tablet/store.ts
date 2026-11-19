import { EMPTY_EXTRAS, loadBudgetExtras, setBudgetAmount, setLineCategory, setMonthNote, type BudgetCat, type BudgetExtras } from '../lib/budget'
import {
  FULL_HISTORY_DAYS, challengeSteps, loadMoney, logPurchase, markPaid, obligationsOn, saveDeposit, setAccountBalance, undoDeposit, undoPayment,
  type MoneyData, type PayWith,
} from '../lib/money'
import { isServerDown } from '../lib/offline'

// The tablet's budget lives on the tablet. Every change applies here right away and waits in an
// "outbox" until it's sent to Runway (once, in order). "Pull from Runway" brings in the real numbers
// (actuals, paychecks, bills), then puts anything still waiting back on top, so nothing is lost or doubled.

const KEY = 'runway-tablet-v1'

export type Op =
  | { t: 'budget'; month: string; key: string; amount: number | null }
  | { t: 'cat'; key: string; cat: BudgetCat | null }
  | { t: 'note'; month: string; note: string }
  | { t: 'paid'; key: string; date: string; amount: number; localId: string }
  | { t: 'unpaid'; key: string; date: string }
  | { t: 'deposit'; challengeId: string; no: number; amount: number; date: string; localId: string }
  | { t: 'undeposit'; challengeId: string; no: number }
  | { t: 'spend'; localId: string; date: string; amount: number; description: string; category: string; with: PayWith }
  | { t: 'balance'; accountId: string; balance: number | null }

export interface Queued { id: string; at: string; op: Op; label: string; error?: string }

export interface TabletData {
  version: 1
  userId: string | null
  m: MoneyData | null
  x: BudgetExtras
  pulledAt: string | null
  outbox: Queued[]
}

export const EMPTY_TABLET: TabletData = { version: 1, userId: null, m: null, x: { ...EMPTY_EXTRAS, ready: true }, pulledAt: null, outbox: [] }

export function loadTablet(): TabletData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_TABLET
    const d = JSON.parse(raw) as TabletData
    return d?.version === 1 ? { ...EMPTY_TABLET, ...d, x: { ...d.x, ready: true } } : EMPTY_TABLET
  } catch { return EMPTY_TABLET }
}

export function saveTablet(d: TabletData): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true } catch { return false }
}

const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
const nowIso = () => new Date().toISOString()
const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Applying a change to the tablet's copy
// ---------------------------------------------------------------------------

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T }

export function applyLocal(d: TabletData, op: Op, today: string): TabletData {
  const n = clone(d)
  const m = n.m
  const x = n.x
  switch (op.t) {
    case 'budget':
      x.amounts = x.amounts.filter((a) => !(a.month === op.month && a.line_key === op.key))
      if (op.amount !== null) x.amounts.push({ month: op.month, line_key: op.key, amount: op.amount })
      break
    case 'cat':
      x.lineCats = x.lineCats.filter((c) => c.line_key !== op.key)
      if (op.cat) x.lineCats.push({ line_key: op.key, category: op.cat })
      break
    case 'note':
      x.notes = x.notes.filter((c) => c.month !== op.month)
      x.notes.push({ month: op.month, note: op.note })
      break
    case 'paid': {
      if (!m) break
      const o = obligationsOn(m, op.date, today).find((y) => y.key === op.key)
      if (!o || o.payment) break
      m.payments.push({
        id: op.localId, card_id: o.kind === 'card' ? o.sourceId : null, bill_id: o.kind === 'bill' ? o.sourceId : null,
        afterpay_order_id: o.kind === 'afterpay' ? o.sourceId : null, installment_no: o.kind === 'afterpay' ? (o.installmentNo ?? null) : null,
        due_date: op.date, amount: op.amount, paid_on: today, account_id: o.fromAccountId, created_at: nowIso(),
      })
      const card = o.kind === 'card' ? m.cards.find((c) => c.id === o.sourceId) : undefined
      if (card && card.balance !== null) card.balance = Math.max(0, r2(card.balance - op.amount))
      break
    }
    case 'unpaid': {
      if (!m) break
      const o = obligationsOn(m, op.date, today).find((y) => y.key === op.key)
      if (!o?.payment) break
      m.payments = m.payments.filter((p) => p.id !== o.payment!.id)
      const card = o.kind === 'card' ? m.cards.find((c) => c.id === o.sourceId) : undefined
      if (card && card.balance !== null) card.balance = r2(card.balance + o.payment.amount)
      break
    }
    case 'deposit':
      if (!m || m.deposits.some((y) => y.challenge_id === op.challengeId && y.deposit_no === op.no)) break
      m.deposits.push({ id: op.localId, challenge_id: op.challengeId, deposit_no: op.no, amount: op.amount, saved_on: op.date, created_at: nowIso() })
      break
    case 'undeposit':
      if (m) m.deposits = m.deposits.filter((y) => !(y.challenge_id === op.challengeId && y.deposit_no === op.no))
      break
    case 'spend': {
      if (!m) break
      m.transactions.unshift({
        id: op.localId, occurred_on: op.date, amount: op.amount, description: op.description, category: op.category,
        account_id: op.with.kind === 'account' ? op.with.id : null, card_id: op.with.kind === 'card' ? op.with.id : null,
        source: 'manual', subscription_id: null, afterpay_order_id: null, created_at: nowIso(),
      })
      if (op.with.kind === 'card') {
        const id = op.with.id
        const card = m.cards.find((c) => c.id === id)
        if (card && card.balance !== null) card.balance = r2(card.balance + op.amount)
      }
      break
    }
    case 'balance': {
      const a = m?.accounts.find((y) => y.id === op.accountId)
      if (a) { a.balance = op.balance; a.balance_as_of = nowIso() }
      break
    }
  }
  return n
}

/** Add a change: apply it here, and queue it for Runway. Undoing something that hasn't been sent yet just cancels it. */
export function enqueue(d: TabletData, op: Op, label: string, today: string): TabletData {
  let outbox = d.outbox
  const same = (q: Queued) => {
    const a = q.op
    if (op.t === 'unpaid') return a.t === 'paid' && a.key === op.key && a.date === op.date
    if (op.t === 'undeposit') return a.t === 'deposit' && a.challengeId === op.challengeId && a.no === op.no
    return false
  }
  const cancel = outbox.find((q) => !q.error && same(q))
  if (cancel) {
    // never sent: drop it and rebuild from what's left (so the change disappears cleanly)
    outbox = outbox.filter((q) => q !== cancel)
    const local = applyLocal({ ...d, outbox }, op, today)
    return { ...local, outbox }
  }
  // A newer budget amount / category / note replaces one still waiting for the same thing
  const replaces = (q: Queued) => {
    const a = q.op
    if (op.t === 'budget') return a.t === 'budget' && a.month === op.month && a.key === op.key
    if (op.t === 'cat') return a.t === 'cat' && a.key === op.key
    if (op.t === 'note') return a.t === 'note' && a.month === op.month
    if (op.t === 'balance') return a.t === 'balance' && a.accountId === op.accountId
    return false
  }
  outbox = [...outbox.filter((q) => !replaces(q)), { id: uid(), at: nowIso(), op, label }]
  return { ...applyLocal(d, op, today), outbox }
}

export const newLocalId = () => `local-${uid()}`

// ---------------------------------------------------------------------------
// Sending to Runway, and pulling from it
// ---------------------------------------------------------------------------

async function send(op: Op, live: () => Promise<MoneyData>, today: string): Promise<void> {
  switch (op.t) {
    case 'budget': return setBudgetAmount(op.month, op.key, op.amount)
    case 'cat': return setLineCategory(op.key, op.cat)
    case 'note': return setMonthNote(op.month, op.note)
    case 'balance': return setAccountBalance(op.accountId, op.balance)
    case 'paid': {
      const L = await live()
      const o = obligationsOn(L, op.date, today).find((y) => y.key === op.key)
      if (!o) throw new Error('That bill or payment isn\'t in Runway anymore')
      if (o.payment || o.status === 'paid') return   // already marked (maybe on another device)
      return markPaid(L, o, op.amount)
    }
    case 'unpaid': {
      const L = await live()
      const o = obligationsOn(L, op.date, today).find((y) => y.key === op.key)
      if (!o?.payment) return
      return undoPayment(L, o)
    }
    case 'deposit': {
      const L = await live()
      const ch = L.challenges.find((c) => c.id === op.challengeId)
      const step = ch ? challengeSteps(L, ch).find((s) => s.no === op.no) : undefined
      if (!step) throw new Error('That savings plan isn\'t in Runway anymore')
      if (step.deposit) return
      return saveDeposit(L, step, op.date)
    }
    case 'undeposit': {
      const L = await live()
      const ch = L.challenges.find((c) => c.id === op.challengeId)
      const step = ch ? challengeSteps(L, ch).find((s) => s.no === op.no) : undefined
      if (step?.deposit) return undoDeposit(step)
      return
    }
    case 'spend': {
      const L = await live()
      return logPurchase(L, { amount: op.amount, description: op.description, category: op.category, date: op.date, with: op.with })
    }
  }
}

export interface SyncResult { data: TabletData; sent: number; down: boolean; error: string }

/** Send what's waiting (in order), then (if asked) pull fresh numbers and put anything still waiting back on top. */
export async function sync(d: TabletData, today: string, pull: boolean): Promise<SyncResult> {
  let liveM: MoneyData | null = null
  const live = async () => (liveM ??= await loadMoney(today))
  const outbox: Queued[] = []
  let sent = 0, down = false, error = ''
  for (const q of d.outbox) {
    if (down) { outbox.push(q); continue }
    try {
      await send(q.op, live, today)
      sent++
      if (['paid', 'unpaid', 'deposit', 'undeposit', 'spend'].includes(q.op.t)) liveM = null   // re-read before the next one
    } catch (e) {
      if (isServerDown(e)) { down = true; outbox.push(q); error = 'Runway can\'t be reached' }
      else outbox.push({ ...q, error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) })
    }
  }
  let data: TabletData = { ...d, outbox }
  if (pull && !down) {
    try {
      const m = await loadMoney(today, FULL_HISTORY_DAYS)
      const x = await loadBudgetExtras()
      let fresh: TabletData = { ...data, m, x: { ...(x.ready ? x : data.x), ready: true }, pulledAt: nowIso() }
      for (const q of outbox) fresh = applyLocal(fresh, q.op, today)   // still waiting: keep showing it
      data = { ...fresh, outbox }
    } catch (e) {
      down = isServerDown(e)
      error = down ? 'Runway can\'t be reached' : (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
  }
  return { data, sent, down, error }
}

// ---------------------------------------------------------------------------
// Back up / restore (a file you keep somewhere safe)
// ---------------------------------------------------------------------------

export function backupBlob(d: TabletData): Blob {
  return new Blob([JSON.stringify({ kind: 'runway-tablet-backup', savedAt: nowIso(), data: d })], { type: 'application/json' })
}

export async function readBackup(file: File): Promise<TabletData> {
  const j = JSON.parse(await file.text()) as { kind?: string; data?: TabletData }
  if (j?.kind !== 'runway-tablet-backup' || !j.data || j.data.version !== 1) throw new Error('That file isn\'t a Runway tablet backup.')
  return { ...EMPTY_TABLET, ...j.data, x: { ...j.data.x, ready: true } }
}
