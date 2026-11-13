import { useState } from 'react'
import { daysBetween, money, shortDate } from '../lib/dates'
import {
  clearPayActual, hasPayActual, hasMoneyIn, isPayday, markPaid, obligationsOn, parseMoney, paycheckTotal, payInto, payTotalOn, savePayActual, saveDeposit, savingsOn, undoDeposit, undoPayment, type MoneyData, type Obligation,
} from '../lib/money'
import { DayMoneyIn } from './MoneyIn'

interface Props {
  date: string
  today: string
  money: MoneyData
  reloadMoney: () => Promise<void>
}

/** "Bills due" for the selected day, with Mark paid (what you actually paid) and Undo. */
export default function DayBills({ date, today, money: m, reloadMoney }: Props) {
  const items = obligationsOn(m, date, today)
  const bills = items.filter((o) => o.kind !== 'sub')
  const subs = items.filter((o) => o.kind === 'sub')
  const pay = isPayday(m, date)
  const save = savingsOn(m, date)

  const moneyIn = hasMoneyIn(m, date, today)
  if (!pay && !save && !moneyIn && items.length === 0) return null

  return (
    <div className="flex flex-col gap-2.5">
      {pay && <PaydayRow date={date} today={today} m={m} reloadMoney={reloadMoney} />}

      {moneyIn && <DayMoneyIn date={date} today={today} money={m} reloadMoney={reloadMoney} />}

      {save && <SavingsRow date={date} today={today} money={m} reloadMoney={reloadMoney} />}

      {bills.length > 0 && <span className="text-xs font-bold tracking-widest uppercase text-muted">Bills due</span>}
      {bills.map((o) => <BillRow key={o.key} o={o} today={today} money={m} reloadMoney={reloadMoney} />)}

      {subs.length > 0 && <span className="text-xs font-bold tracking-widest uppercase text-muted mt-1">Auto-pay</span>}
      {subs.map((o) => (
        <div key={o.key} className="flex items-center gap-2.5 rounded-xl border border-dashed border-line px-3 py-2 text-sm">
          <span aria-hidden="true" className="text-muted font-bold">↻</span>
          <span className="flex-1 min-w-0">
            <b className="block truncate">{o.name}</b>
            <span className="text-muted">Charges {o.from} automatically</span>
          </span>
          <span className="font-bold tnum">{money(o.amount)}</span>
        </div>
      ))}
    </div>
  )
}

function BillRow({ o, today, money: m, reloadMoney }: { o: Obligation; today: string; money: MoneyData; reloadMoney: () => Promise<void> }) {
  const [amount, setAmount] = useState(o.amount !== null ? o.amount.toFixed(2) : '')
  const [fromId, setFromId] = useState(o.fromAccountId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputId = `pay-${o.key.replace(/[^a-z0-9]/gi, '-')}`

  async function pay() {
    const value = parseMoney(amount)
    if (value === null || value <= 0) { setError('Enter the amount you paid.'); return }
    setBusy(true); setError('')
    try { await markPaid(m, o, value, fromId || null); await reloadMoney() } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t save') }
    setBusy(false)
  }

  async function undo() {
    setBusy(true); setError('')
    try { await undoPayment(m, o); await reloadMoney() } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t undo') }
    setBusy(false)
  }

  const d = daysBetween(today, o.date)
  const statusText =
    o.status === 'paid' ? 'Paid' : o.status === 'overdue' ? 'Overdue'
      : d === 0 ? 'Due today' : o.status === 'soon' ? (d === 1 ? 'Due tomorrow' : `Due in ${d} days`) : 'Upcoming'
  const tone = o.status === 'overdue' ? 'border-bad bg-bad/10' : o.status === 'soon' ? 'border-warn bg-warn-soft' : 'border-line bg-surface-2'
  const statusTone = o.status === 'paid' ? 'text-pay-ink' : o.status === 'overdue' ? 'text-bad' : o.status === 'soon' ? 'text-warn' : 'text-muted'
  const card = o.kind === 'card' ? m.cards.find((c) => c.id === o.sourceId) : undefined
  const sub =
    o.kind === 'afterpay' ? `Payment ${o.installmentNo} of ${o.installments} · ${o.from}`
      : o.kind === 'card' ? (card?.minimum_payment != null ? `Minimum ${money(card.minimum_payment)}` : 'No minimum entered') + (card?.balance != null ? ` · Balance ${money(card.balance)}` : '')
        : o.amount != null ? `${money(o.amount)} · ${o.from}` : o.from

  return (
    <div className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${tone}`}>
      <div className="flex items-center gap-2.5">
        <span className="size-3 rounded-full shrink-0" style={{ background: o.color }} />
        <span className="flex-1 min-w-0">
          <b className="block truncate">{o.name}</b>
          <span className="block text-sm text-muted">{sub}</span>
        </span>
        <span className={`text-xs font-extrabold tracking-wider uppercase ${statusTone}`}>{statusText}</span>
      </div>
      {o.status === 'paid' && o.payment ? (
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-pay-ink">
          Paid {money(o.payment.amount)} on {shortDate(o.payment.paid_on)}
          <button type="button" onClick={() => void undo()} disabled={busy}
            className="h-9 px-3 rounded-lg border border-line bg-surface text-fg font-bold cursor-pointer disabled:opacity-60">Undo</button>
        </div>
      ) : (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void pay() }}>
          <label htmlFor={inputId} className="inline-flex items-center h-10 px-2.5 rounded-lg border border-line bg-surface focus-within:border-accent-hi">
            <span className="text-muted">$</span>
            <span className="sr-only">Amount paid for {o.name}</span>
            <input id={inputId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Paid"
              className="w-24 border-0 bg-transparent text-fg tnum focus:outline-none" />
          </label>
          {o.kind !== 'afterpay' && (
            <label className="inline-flex items-center gap-1.5 text-sm text-muted" htmlFor={`${inputId}-from`}>
              from
              <select id={`${inputId}-from`} value={fromId} onChange={(e) => setFromId(e.target.value)}
                className="h-10 rounded-lg border border-line bg-surface px-2 text-fg focus:outline-2 focus:outline-accent-hi">
                {m.accounts.filter((a) => a.kind === 'checking').map((a) => <option key={a.id} value={a.id}>{a.institution ?? a.name}</option>)}
                <option value="">Somewhere else</option>
              </select>
            </label>
          )}
          <button type="submit" disabled={busy}
            className="h-10 px-4 rounded-lg border-0 bg-accent text-accent-ink font-bold cursor-pointer disabled:opacity-60">
            {busy ? 'Saving…' : 'Mark paid'}
          </button>
        </form>
      )}
      {error && <span role="alert" className="text-sm font-bold text-bad">{error}</span>}
    </div>
  )
}

function SavingsRow({ date, today, money: m, reloadMoney }: { date: string; today: string; money: MoneyData; reloadMoney: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const step = savingsOn(m, date)
  if (!step || !m.challenge) return null
  const done = Boolean(step.deposit)

  async function toggle() {
    if (!step) return
    setBusy(true); setError('')
    try { await (done ? undoDeposit(step) : saveDeposit(m, step, today)); await reloadMoney() } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t save') }
    setBusy(false)
  }

  return (
    <div className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${done ? 'border-pay bg-pay-soft' : 'border-line bg-surface-2'}`}>
      <div className="flex items-center gap-2.5">
        <span className="size-3 rounded-full shrink-0 bg-pay" />
        <span className="flex-1 min-w-0">
          <b className="block">Savings challenge · {step.no} of {m.challenge.deposit_count}</b>
          <span className="block text-sm text-muted">{done ? `Saved ${money(step.amount)} to your SoFi Vault` : `Move ${money(step.amount)} from SoFi to your Vault`}</span>
        </span>
        <button type="button" onClick={() => void toggle()} disabled={busy}
          className={`h-10 px-4 rounded-lg font-bold cursor-pointer disabled:opacity-60 ${done ? 'border border-line bg-surface text-fg' : 'border-0 bg-pay text-white'}`}>
          {done ? 'Undo' : 'Saved it'}
        </button>
      </div>
      {error && <span role="alert" className="text-sm font-bold text-bad">{error}</span>}
    </div>
  )
}

/** Payday: the usual split, or what really landed. On or after the day you can enter the real amounts. */
export function PaydayRow({ date, today, m, reloadMoney }: { date: string; today: string; m: MoneyData; reloadMoney: () => Promise<void> }) {
  const actual = hasPayActual(m, date)
  const accts = m.accounts.filter((a) => a.kind === 'checking' && (m.splits.some((s) => s.account_id === a.id) || m.payActuals.some((x) => x.pay_date === date && x.account_id === a.id)))
  const [editing, setEditing] = useState(false)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const name = (id: string) => m.accounts.find((a) => a.id === id)?.institution ?? 'account'
  function start() {
    setVals(Object.fromEntries(accts.map((a) => [a.id, payInto(m, date, a.id).toFixed(2)])))
    setEditing(true); setErr('')
  }
  async function save() {
    const amounts = accts.map((a) => ({ account_id: a.id, amount: parseMoney(vals[a.id] ?? '') ?? NaN }))
    if (amounts.some((x) => Number.isNaN(x.amount) || x.amount < 0)) { setErr('Enter an amount for each account (0 is fine).'); return }
    setBusy(true); setErr('')
    try { await savePayActual(date, amounts); await reloadMoney(); setEditing(false) } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn\'t save') }
    setBusy(false)
  }
  const diff = Math.round((payTotalOn(m, date) - paycheckTotal(m)) * 100) / 100
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-pay-soft text-pay-ink px-3.5 py-3" data-testid="payday">
      <div className="flex items-center gap-3 font-bold">
        <span className="size-7 rounded-full bg-pay text-white grid place-items-center shrink-0">$</span>
        <span className="flex-1 min-w-0">
          Payday · {money(payTotalOn(m, date))}{actual ? ' ✓' : ''}
          <span className="block text-sm font-semibold">
            {accts.map((a) => `${money(payInto(m, date, a.id))} ${name(a.id)}`).join(' · ')}
            {actual ? (diff ? ` · ${diff > 0 ? '+' : '−'}${money(Math.abs(diff))} vs usual` : ' · same as usual') : date <= today ? ' · usual amount' : ''}
          </span>
        </span>
        {date <= today && !editing && (
          <button type="button" onClick={start} className="h-9 px-3 rounded-lg border border-pay bg-surface text-pay-ink text-sm font-bold cursor-pointer shrink-0">{actual ? 'Change' : 'Enter real amount'}</button>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-2 rounded-lg bg-surface p-2.5 text-fg" role="group" aria-label="Real paycheck">
          <span className="text-sm font-bold">What landed in each account?</span>
          {accts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 font-bold">{name(a.id)}</span>
              <span className="flex items-center gap-1 h-10 flex-1 rounded-xl border border-line bg-surface-2 px-2.5">
                <span className="text-muted">$</span>
                <input inputMode="decimal" aria-label={`Paycheck into ${name(a.id)}`} value={vals[a.id] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [a.id]: e.target.value }))}
                  className="flex-1 min-w-0 border-0 bg-transparent tnum text-fg font-bold focus:outline-none" />
              </span>
            </label>
          ))}
          {err && <span role="alert" className="text-sm font-bold text-bad">{err}</span>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="h-9 px-3 rounded-lg border-0 bg-pay text-white text-sm font-bold cursor-pointer">{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(false)} className="h-9 px-3 rounded-lg border border-line bg-surface text-fg text-sm font-bold cursor-pointer">Cancel</button>
            {actual && <button type="button" disabled={busy} onClick={() => { setBusy(true); void clearPayActual(date).then(reloadMoney).finally(() => { setBusy(false); setEditing(false) }) }}
              className="h-9 px-3 rounded-lg border-0 bg-transparent text-muted text-sm font-bold underline cursor-pointer">Use usual amount</button>}
          </div>
        </div>
      )}
    </div>
  )
}
