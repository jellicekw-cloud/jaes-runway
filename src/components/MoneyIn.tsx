import { useRef, useState, type FormEvent } from 'react'
import { money, shortDate } from '../lib/dates'
import {
  INCOME_KIND_LABEL, addIncome, defaultIncomeAccount, deleteIncome, expectedOn, incomeOn, paychecksBetween, parseMoney, setExpectedAmount,
  waitingDeposits, type Expected, type IncomeKind, type MoneyData,
} from '../lib/money'

type Reload = () => Promise<void>

const chip = (on: boolean) => `h-9 px-3 rounded-full border text-sm font-bold cursor-pointer ${on ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`
const label = 'text-xs font-bold tracking-widest uppercase text-muted'
const acctName = (m: MoneyData, id: string | null) => m.accounts.find((a) => a.id === id)?.institution ?? m.accounts.find((a) => a.id === id)?.name ?? ''

// ---------------------------------------------------------------------------
// + Add → Money in
// ---------------------------------------------------------------------------

export function MoneyInForm({ m, today, reloadMoney, onDone }: { m: MoneyData; today: string; reloadMoney: Reload; onDone: (msg: string) => void }) {
  const amountRef = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<IncomeKind>('zelle')
  const [from, setFrom] = useState('')
  const [account, setAccount] = useState<string | null>(defaultIncomeAccount(m, 'zelle'))
  const [pickedAccount, setPickedAccount] = useState(false)
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const checking = m.accounts.filter((a) => a.kind === 'checking')

  function chooseKind(k: IncomeKind) {
    setKind(k)
    if (!pickedAccount) setAccount(defaultIncomeAccount(m, k))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amt = parseMoney(amount)
    if (!amt || amt <= 0) { setError('Enter the amount.'); amountRef.current?.focus(); return }
    if (!account) { setError('Pick which account it went into.'); return }
    setBusy(true); setError('')
    try {
      await addIncome(m, { amount: amt, kind, from_name: from || null, account_id: account, received_on: date })
      await reloadMoney()
      onDone(`Money in · ${money(amt)} to ${acctName(m, account)}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Couldn\'t save'); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label htmlFor="mi-amount" className="flex items-center gap-1 border-b-2 border-pay pb-1 text-4xl font-bold text-pay-ink">
        <span>+$</span><span className="sr-only">Amount received</span>
        <input id="mi-amount" ref={amountRef} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
          className="flex-1 min-w-0 border-0 bg-transparent text-fg text-4xl font-bold tnum focus:outline-none" />
      </label>
      <div className="flex flex-col gap-1.5">
        <span id="mi-kind" className={label}>What is it</span>
        <div role="group" aria-labelledby="mi-kind" className="flex flex-wrap gap-1.5">
          {(Object.keys(INCOME_KIND_LABEL) as IncomeKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => chooseKind(k)} className={chip(kind === k)}>{INCOME_KIND_LABEL[k]}</button>
          ))}
        </div>
      </div>
      <label htmlFor="mi-from" className="flex flex-col gap-1.5">
        <span className={label}>From (optional)</span>
        <input id="mi-from" value={from} onChange={(e) => setFrom(e.target.value)} autoComplete="off" placeholder={kind === 'refund' ? 'e.g. Amazon' : 'e.g. Thor, Chicken'}
          className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
      </label>
      <div className="flex flex-col gap-1.5">
        <span id="mi-acct" className={label}>Went into</span>
        <div role="group" aria-labelledby="mi-acct" className="flex flex-wrap gap-1.5">
          {checking.map((a) => (
            <button key={a.id} type="button" aria-pressed={account === a.id} onClick={() => { setAccount(a.id); setPickedAccount(true) }} className={chip(account === a.id)}>
              {a.institution ?? a.name}
            </button>
          ))}
        </div>
      </div>
      <label htmlFor="mi-date" className="flex items-center justify-between gap-3">
        <span className={label}>Date</span>
        <input id="mi-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)}
          className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
      </label>
      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
      <button type="submit" disabled={busy} className="h-12 rounded-2xl border-0 bg-pay text-white text-lg font-bold cursor-pointer disabled:opacity-60">
        {busy ? 'Saving…' : 'Add money in'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// "Did side work land?" — confirm an expected deposit with what actually came in
// ---------------------------------------------------------------------------

export function ExpectedRow({ e, m, today, reloadMoney }: { e: Expected; m: MoneyData; today: string; reloadMoney: Reload }) {
  const [amount, setAmount] = useState(e.source.expected_amount ? e.source.expected_amount.toFixed(2) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const late = e.date < today
  const future = e.date > today

  async function landed() {
    const amt = parseMoney(amount)
    if (!amt || amt <= 0) { setError('Enter what came in.'); return }
    setBusy(true); setError('')
    try {
      await addIncome(m, { amount: amt, kind: 'side_work', from_name: e.source.name, account_id: e.source.account_id, received_on: late ? today : e.date, expected_on: e.date })
      await reloadMoney()
    } catch (err) { setError(err instanceof Error ? err.message : 'Couldn\'t save'); setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-dashed border-pay px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="size-7 rounded-full border-2 border-pay text-pay-ink grid place-items-center shrink-0 font-bold text-sm">+$</span>
        <span className="flex-1 min-w-0">
          <b className="block">{e.source.name}{e.source.expected_amount ? ` · about ${money(e.source.expected_amount)}` : ''}</b>
          <span className="text-sm text-muted">{future ? `Expected ${shortDate(e.date)} into ${acctName(m, e.source.account_id)}` : `${late ? `Expected ${shortDate(e.date)}. ` : ''}Did it land in ${acctName(m, e.source.account_id)}?`}</span>
        </span>
      </div>
      {!future && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 h-10 rounded-xl border border-line bg-surface-2 px-2.5 flex-1 min-w-0">
            <span className="text-muted font-bold">$</span>
            <input inputMode="decimal" aria-label={`${e.source.name} amount`} value={amount} onChange={(ev) => setAmount(ev.target.value)} placeholder="0.00"
              className="flex-1 min-w-0 border-0 bg-transparent text-fg font-bold tnum focus:outline-none" />
          </label>
          <button type="button" disabled={busy} onClick={() => void landed()} className="h-10 px-4 rounded-xl border-0 bg-pay text-white font-bold cursor-pointer">It landed</button>
        </div>
      )}
      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
    </div>
  )
}

/** Money in on a calendar day: what came in, and side work expected (today also shows any from the last few days still waiting). */
export function DayMoneyIn({ date, today, money: m, reloadMoney }: { date: string; today: string; money: MoneyData; reloadMoney: Reload }) {
  const got = incomeOn(m, date)
  const expected = date === today ? waitingDeposits(m, today) : expectedOn(m, date).filter((e) => !e.got && date > today)
  if (got.length === 0 && expected.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {got.map((x) => (
        <div key={x.id} className="flex items-center gap-3 rounded-xl bg-pay-soft text-pay-ink px-3.5 py-2.5 font-bold">
          <span className="size-7 rounded-full bg-pay text-white grid place-items-center shrink-0 text-sm">+$</span>
          <span className="flex-1 min-w-0">
            {money(x.amount)} · {INCOME_KIND_LABEL[x.kind]}{x.from_name && x.from_name !== INCOME_KIND_LABEL[x.kind] ? ` from ${x.from_name}` : ''}
            <span className="block text-sm font-semibold">Into {acctName(m, x.account_id)}</span>
          </span>
        </div>
      ))}
      {expected.map((e) => <ExpectedRow key={e.source.id + e.date} e={e} m={m} today={today} reloadMoney={reloadMoney} />)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Money tab section
// ---------------------------------------------------------------------------

export function MoneyInSection({ m, today, reloadMoney, onAdd }: { m: MoneyData; today: string; reloadMoney: Reload; onAdd: () => void }) {
  const [error, setError] = useState('')
  const monthStart = today.slice(0, 8) + '01'
  const thisMonth = m.income.filter((x) => x.received_on >= monthStart && x.received_on <= today)
  const otherIn = thisMonth.reduce((t, x) => t + x.amount, 0)
  const pay = paychecksBetween(m, monthStart, today)
  const out = m.transactions.filter((t) => t.occurred_on >= monthStart && t.occurred_on <= today).reduce((t, x) => t + x.amount, 0)
  const recent = m.income.slice(0, 25)
  const waiting = waitingDeposits(m, today)

  async function run(f: () => Promise<unknown>) {
    setError('')
    try { await f(); await reloadMoney() } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t save') }
  }

  return (
    <section aria-label="Money in" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-2xl font-bold">Money in</h2>
        <button type="button" onClick={onAdd} className="h-11 px-4 rounded-xl border-0 bg-pay text-white font-bold cursor-pointer">+ Money in</button>
      </div>
      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="rounded-2xl bg-pay-soft text-pay-ink p-4">
          <span className="block text-xs font-bold tracking-widest uppercase">In this month</span>
          <b className="block text-2xl tnum">{money(pay + otherIn)}</b>
          <span className="block text-sm font-semibold">{money(pay)} paychecks · {money(otherIn)} other</span>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <span className={`block ${label}`}>Out this month</span>
          <b className="block text-2xl tnum">{money(out)}</b>
          <span className="block text-sm text-muted">Purchases, auto-pay and Afterpay logged</span>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <span className={`block ${label}`}>Difference</span>
          <b className={`block text-2xl tnum ${pay + otherIn - out < 0 ? 'text-bad' : 'text-pay-ink'}`}>{pay + otherIn - out < 0 ? '−' : '+'}{money(Math.abs(pay + otherIn - out))}</b>
          <span className="block text-sm text-muted">Bill payments aren't counted here</span>
        </div>
      </div>

      {waiting.map((e) => <ExpectedRow key={e.source.id + e.date} e={e} m={m} today={today} reloadMoney={reloadMoney} />)}

      {m.incomeSources.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm">
          <b>{s.name}</b>
          <span className="text-muted">expected the {s.days.map((d) => (d === 1 || d === 21 || d === 31 ? `${d}st` : d === 2 || d === 22 ? `${d}nd` : d === 3 || d === 23 ? `${d}rd` : `${d}th`)).join(' and ')} into {acctName(m, s.account_id)}</span>
          <label className="ml-auto flex items-center gap-1.5">
            <span className="text-muted">Usually</span>
            <input inputMode="decimal" aria-label={`${s.name} usual amount`} defaultValue={s.expected_amount?.toFixed(2) ?? ''} placeholder="amount"
              onBlur={(e) => { const v = parseMoney(e.target.value); if (v !== s.expected_amount) void run(() => setExpectedAmount(s.id, v)) }}
              className="w-24 h-9 rounded-lg border border-line bg-surface-2 px-2 text-fg tnum focus:outline-2 focus:outline-accent-hi" />
          </label>
        </div>
      ))}

      {recent.length === 0 ? (
        <p className="m-0 text-muted">Nothing logged yet. Side work, Zelle, refunds and gifts show up here.</p>
      ) : (
        <ul className="m-0 p-0 list-none rounded-2xl border border-line bg-surface px-3.5">
          {recent.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2.5 border-t border-line first:border-t-0">
              <span className="w-16 shrink-0 text-sm text-muted">{shortDate(x.received_on)}</span>
              <span className="flex-1 min-w-0">
                <b className="block truncate">{INCOME_KIND_LABEL[x.kind]}{x.from_name && x.from_name !== INCOME_KIND_LABEL[x.kind] ? ` · ${x.from_name}` : ''}</b>
                <span className="text-sm text-muted">{acctName(m, x.account_id)}</span>
              </span>
              <b className="tnum text-pay-ink">+{money(x.amount)}</b>
              <button type="button" aria-label={`Remove ${money(x.amount)} ${INCOME_KIND_LABEL[x.kind]}`} onClick={() => void run(() => deleteIncome(x.id))}
                className="size-9 rounded-lg border border-line bg-transparent text-muted cursor-pointer">×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
