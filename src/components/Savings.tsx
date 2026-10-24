import { useEffect, useState } from 'react'
import { addDays, dateOf, DAYS, money, shortDate } from '../lib/dates'
import {
  addTransfer, autoTransferOn, deleteTransfer, estimateBalance, parseMoney, setAccountBalance, setAutoTransfer, type MoneyData,
} from '../lib/money'
import type { Account } from '../lib/types'
import { Burst } from './Confetti'

type Run = (change: () => Promise<unknown>) => Promise<void>

const seen = (k: string) => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const markSeen = (k: string) => { try { localStorage.setItem(k, '1') } catch { /* fine */ } }

/** Next day the automatic transfer lands (today counts). */
export function nextAuto(a: Account, today: string): string | null {
  for (let i = 0; i <= (a.auto_every_days ?? 14); i++) { const k = addDays(today, i); if (autoTransferOn(a, k)) return k }
  return null
}

/** Money tab: DECU savings and the SoFi Vault. Never counted in "Can I afford it?". */
export function SavingsSection({ m, today, hide, run }: { m: MoneyData; today: string; hide: boolean; run: Run }) {
  const list = m.accounts.filter((a) => a.kind === 'savings' || a.kind === 'vault')
  if (!list.length) return null
  return (
    <section aria-label="Savings" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-2xl font-bold">Savings</h2>
        <span className="text-sm text-muted">Not counted in "Can I afford it?"</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map((a) => <SavingsCard key={a.id} a={a} m={m} today={today} hide={hide} run={run} />)}
      </div>
    </section>
  )
}

function SavingsCard({ a, m, today, hide, run }: { a: Account; m: MoneyData; today: string; hide: boolean; run: Run }) {
  const est = estimateBalance(m, a, today)
  const bal = est.estimate
  const goal = a.goal_amount ?? null
  const reached = goal !== null && bal !== null && bal >= goal
  const goalKey = `runway-goal-${a.id}-${goal}`
  const [burst, setBurst] = useState(false)
  useEffect(() => { if (reached && !seen(goalKey)) { markSeen(goalKey); setBurst(true) } }, [reached, goalKey])

  const [moving, setMoving] = useState<'in' | 'out' | null>(null)
  const [editAuto, setEditAuto] = useState(false)
  const checking = m.accounts.filter((x) => x.kind === 'checking')
  const isVault = a.kind === 'vault'
  const sofi = checking.find((x) => x.institution === 'SoFi')?.id
  const defaultOther = (isVault ? (m.challenge?.from_account_id ?? sofi) : a.auto_from_account_id) ?? checking[0]?.id ?? ''
  const moves = m.transfers.filter((x) => x.to_account_id === a.id || x.from_account_id === a.id).slice(0, 3)
  const next = nextAuto(a, today)
  const from = m.accounts.find((x) => x.id === a.auto_from_account_id)
  const show = (n: number | null) => (hide ? '••••' : n === null ? 'Not entered' : money(n))
  const lastOut = moves[0] && moves[0].from_account_id === a.id

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 min-w-0" data-testid={`savings-${a.institution ?? a.name}`}>
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-lg">{a.name}</b>
        <span className="text-xs text-muted">{isVault ? 'Savings challenge + extra' : a.role_note}</span>
      </div>
      <div className="text-3xl font-bold tnum text-pay-ink">{show(bal)}</div>

      {goal !== null && bal !== null && (
        <div className="flex flex-col gap-1">
          <span className="h-3 rounded-full bg-pay-soft overflow-hidden">
            <span className="block h-full rounded-full bg-pay" style={{ width: `${Math.min(100, (bal / goal) * 100)}%`, minWidth: bal > 0 ? 6 : 0 }} />
          </span>
          <span className="text-sm text-muted">
            {reached ? <b className="text-pay-ink">🎉 You made it to {money(goal)}! Keep it there.</b> : <>{hide ? '' : `${money(bal)} of `}{money(goal)} · no pressure, it grows on its own</>}
          </span>
        </div>
      )}
      {burst && <Burst onDone={() => setBurst(false)} />}

      {!hide && bal !== null && est.changes.length > 0 && (
        <div className="text-sm text-muted flex flex-col gap-0.5">
          <span>You entered {money(est.entered)}{est.asOf ? ` on ${shortDate(est.asOf.slice(0, 10))}` : ''}</span>
          {est.changes.map((c) => (
            <span key={c.label} className="flex justify-between tnum"><span>{c.label} since</span><span>{c.amount > 0 ? '+' : '−'}{money(Math.abs(c.amount))}</span></span>
          ))}
        </div>
      )}

      {/* Automatic transfer (DECU) */}
      {!isVault && (
        editAuto || !a.auto_amount ? (
          <AutoForm a={a} today={today} run={run} onDone={() => setEditAuto(false)} fromName={from?.institution ?? from?.name ?? 'NFCU'} />
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
            <span aria-hidden="true">↻</span>
            <span className="flex-1 min-w-0">
              <b>{money(a.auto_amount)}</b> from {from?.institution ?? from?.name ?? 'checking'} every {a.auto_every_days === 14 ? '2 weeks' : `${a.auto_every_days} days`}
              {next && <span className="text-muted"> · next {next === today ? 'today' : `${DAYS[dateOf(next).getDay()].slice(0, 3)} ${shortDate(next)}`}</span>}
            </span>
            <button type="button" onClick={() => setEditAuto(true)} className="bg-transparent border-0 text-accent font-bold cursor-pointer">Change</button>
          </div>
        )
      )}

      <BalanceInput a={a} run={run} />

      {moving ? (
        <MoveForm a={a} dir={moving} checking={checking} defaultOther={defaultOther} today={today} run={run} onDone={() => setMoving(null)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMoving('in')} className="h-10 px-4 rounded-xl border-0 bg-pay text-white font-bold cursor-pointer">+ Added more</button>
          <button type="button" onClick={() => setMoving('out')} className="h-10 px-4 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer">Took some out</button>
        </div>
      )}

      {moves.length > 0 && (
        <ul className="m-0 p-0 list-none text-sm flex flex-col">
          {moves.map((x) => {
            const out = x.from_account_id === a.id
            const other = m.accounts.find((y) => y.id === (out ? x.to_account_id : x.from_account_id))
            return (
              <li key={x.id} className="flex items-center gap-2 py-1.5 border-t border-line">
                <span className="text-muted w-14 shrink-0">{shortDate(x.moved_on)}</span>
                <span className="flex-1 min-w-0 truncate">{out ? 'Took out' : 'Added'} {money(x.amount)}{other ? ` ${out ? 'to' : 'from'} ${other.institution ?? other.name}` : ''}{x.note ? ` · ${x.note}` : ''}</span>
                <button type="button" onClick={() => void run(() => deleteTransfer(x.id))} className="bg-transparent border-0 text-accent font-bold cursor-pointer">Undo</button>
              </li>
            )
          })}
        </ul>
      )}
      {lastOut && !isVault && <p className="m-0 text-xs text-muted">That's what it's there for. The auto transfer keeps building it back. 💚</p>}
    </div>
  )
}

function BalanceInput({ a, run }: { a: Account; run: Run }) {
  const [v, setV] = useState('')
  const id = `sav-bal-${a.id}`
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-xs font-bold tracking-wider uppercase text-muted">Update from your bank app</span>
      <span className="flex items-center h-11 rounded-xl px-3 border border-line bg-surface-2 focus-within:border-accent-hi">
        <span className="text-muted">$</span>
        <input id={id} inputMode="decimal" value={v} placeholder="0.00" onChange={(e) => setV(e.target.value)}
          onBlur={() => { const n = parseMoney(v); if (n !== null) { setV(''); void run(() => setAccountBalance(a.id, n)) } }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-full min-w-0 border-0 bg-transparent tnum text-fg focus:outline-none" />
      </span>
    </label>
  )
}

function AutoForm({ a, today, run, onDone, fromName }: { a: Account; today: string; run: Run; onDone: () => void; fromName: string }) {
  const [amt, setAmt] = useState(a.auto_amount ? String(a.auto_amount) : '')
  const [day, setDay] = useState(a.auto_next_on ?? '')
  const [err, setErr] = useState('')
  function save() {
    const n = parseMoney(amt)
    if (!n || n <= 0) { setErr('Enter the amount that moves each time.'); return }
    if (!day) { setErr('Pick the next (or last) transfer day.'); return }
    void run(() => setAutoTransfer(a.id, { auto_amount: n, auto_next_on: day })).then(onDone)
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3" role="group" aria-label="Automatic transfer">
      <b className="text-sm">Automatic transfer from {fromName}, every 2 weeks</b>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-bold tracking-wider uppercase text-muted">Amount
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="25.00" aria-label="Auto transfer amount"
            className="h-10 rounded-xl border border-line bg-surface px-3 text-fg text-base normal-case tracking-normal font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold tracking-wider uppercase text-muted">A transfer day
          <input type="date" value={day} max={addDays(today, 60)} onChange={(e) => setDay(e.target.value)} aria-label="A transfer day"
            className="h-10 rounded-xl border border-line bg-surface px-3 text-fg text-base normal-case tracking-normal font-normal" />
        </label>
      </div>
      <span className="text-xs text-muted">Any day it moved or will move. Runway repeats it every 2 weeks and takes it out of {fromName} on those days.</span>
      {err && <span role="alert" className="text-sm font-bold text-bad">{err}</span>}
      <div className="flex gap-2">
        <button type="button" onClick={save} className="h-10 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">Save</button>
        {a.auto_amount ? <button type="button" onClick={onDone} className="h-10 px-4 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer">Cancel</button> : null}
      </div>
    </div>
  )
}

function MoveForm({ a, dir, checking, defaultOther, today, run, onDone }: {
  a: Account; dir: 'in' | 'out'; checking: Account[]; defaultOther: string; today: string; run: Run; onDone: () => void
}) {
  const [amt, setAmt] = useState('')
  const [other, setOther] = useState(defaultOther)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  function save() {
    const n = parseMoney(amt)
    if (!n || n <= 0) { setErr('Enter the amount.'); return }
    const f = dir === 'in'
      ? { from_account_id: other || null, to_account_id: a.id, amount: n, moved_on: today, note }
      : { from_account_id: a.id, to_account_id: other || null, amount: n, moved_on: today, note }
    void run(() => addTransfer(f)).then(onDone)
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3" role="group" aria-label={dir === 'in' ? 'Add to savings' : 'Take out of savings'}>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-bold tracking-wider uppercase text-muted">Amount
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.00" aria-label="Move amount"
            className="h-10 rounded-xl border border-line bg-surface px-3 text-fg text-base normal-case tracking-normal font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold tracking-wider uppercase text-muted">{dir === 'in' ? 'From' : 'Into'}
          <select value={other} onChange={(e) => setOther(e.target.value)} aria-label={dir === 'in' ? 'Moved from' : 'Moved into'}
            className="h-10 rounded-xl border border-line bg-surface px-2 text-fg text-base normal-case tracking-normal font-normal">
            {checking.map((x) => <option key={x.id} value={x.id}>{x.institution ?? x.name}</option>)}
            <option value="">{dir === 'in' ? 'Cash / somewhere else' : 'Spent it directly'}</option>
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-[11px] font-bold tracking-wider uppercase text-muted">Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={dir === 'out' ? 'e.g. car repair' : 'e.g. birthday money'} aria-label="Move note"
            className="h-10 rounded-xl border border-line bg-surface px-3 text-fg text-base normal-case tracking-normal font-normal" />
        </label>
      </div>
      {err && <span role="alert" className="text-sm font-bold text-bad">{err}</span>}
      <div className="flex gap-2">
        <button type="button" onClick={save} className="h-10 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">{dir === 'in' ? 'Add it' : 'Take it out'}</button>
        <button type="button" onClick={onDone} className="h-10 px-4 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer">Cancel</button>
      </div>
    </div>
  )
}
