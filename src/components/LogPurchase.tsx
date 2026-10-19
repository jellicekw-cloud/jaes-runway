import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addDays, money, shortDate } from '../lib/dates'
import {
  billsAccountId, challengeSteps, estimateBalance, installmentAmount, installmentDate, logPurchase, obligationsOn, parseMoney,
  type MoneyData, type PayWith,
} from '../lib/money'
import { CATEGORIES } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  today: string
  money: MoneyData
  reloadMoney: () => Promise<void>
  onLogged: (message: string) => void
}

/** The + button's window: log a purchase from anywhere in the app. */
export default function LogPurchase({ open, onClose, today, money: m, reloadMoney, onLogged }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState('')
  const [what, setWhat] = useState('')
  const [category, setCategory] = useState<string>('Other')
  const [date, setDate] = useState(today)
  const [withKey, setWithKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const nfcu = billsAccountId(m)
  const options: { key: string; label: string; with: PayWith }[] = [
    ...m.accounts.filter((a) => a.kind === 'checking').map((a) => ({ key: `a:${a.id}`, label: a.institution ?? a.name, with: { kind: 'account', id: a.id } as PayWith })),
    ...m.cards.map((c) => ({ key: `c:${c.id}`, label: c.name.replace(' Mastercard', ''), with: { kind: 'card', id: c.id } as PayWith })),
    { key: 'afterpay', label: 'Afterpay', with: { kind: 'afterpay' } as PayWith },
  ]

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      setAmount(''); setWhat(''); setCategory('Other'); setDate(today); setError('')
      setWithKey(nfcu ? `a:${nfcu}` : options[0]?.key ?? '')
      el.showModal()
      requestAnimationFrame(() => amountRef.current?.focus())
    }
    if (!open && el.open) el.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const amt = parseMoney(amount)
  const chosen = options.find((o) => o.key === withKey)
  const hint = buildHint(m, today, chosen?.with, amt, date)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!amt || amt <= 0) { setError('Enter the amount.'); amountRef.current?.focus(); return }
    if (!chosen) { setError('Pick what you paid with.'); return }
    setBusy(true); setError('')
    try {
      const description = what.trim() || category
      await logPurchase(m, { amount: amt, description, category, date, with: chosen.with })
      await reloadMoney()
      onLogged(chosen.with.kind === 'afterpay'
        ? `Afterpay order added · ${money(installmentAmount({ total: amt, installments: 4 }, 1))} today`
        : `Logged ${money(amt)} · ${description}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\'t save')
    }
    setBusy(false)
  }

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="log-title"
      className="m-auto w-[min(520px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] rounded-3xl border border-line bg-surface p-0 text-fg backdrop:bg-black/50">
      <form onSubmit={submit} className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 id="log-title" className="m-0 text-2xl font-bold">Log a purchase</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="size-10 rounded-full border border-line bg-transparent text-fg grid place-items-center cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <label htmlFor="lp-amount" className="flex items-center gap-1 border-b-2 border-accent-hi pb-1 text-4xl font-bold">
          <span>$</span><span className="sr-only">Amount</span>
          <input id="lp-amount" ref={amountRef} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
            className="flex-1 min-w-0 border-0 bg-transparent text-fg text-4xl font-bold tnum focus:outline-none" />
        </label>

        <label htmlFor="lp-what" className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-widest uppercase text-muted">What was it</span>
          <input id="lp-what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Gas, groceries, nails" autoComplete="off"
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
        </label>

        <div className="flex flex-col gap-1.5">
          <span id="lp-cat" className="text-xs font-bold tracking-widest uppercase text-muted">Category</span>
          <div role="group" aria-labelledby="lp-cat" className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}
                className={`h-9 px-3 rounded-full border text-sm font-bold cursor-pointer ${category === c ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>{c}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="lp-with" className="text-xs font-bold tracking-widest uppercase text-muted">Paid with</span>
          <div role="group" aria-labelledby="lp-with" className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <button key={o.key} type="button" aria-pressed={withKey === o.key} onClick={() => setWithKey(o.key)}
                className={`h-9 px-3 rounded-full border text-sm font-bold cursor-pointer ${withKey === o.key ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>{o.label}</button>
            ))}
          </div>
        </div>

        <label htmlFor="lp-date" className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-widest uppercase text-muted">Date</span>
          <input id="lp-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)}
            className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
        </label>

        {hint && (
          <p role="status" className={`m-0 rounded-xl px-3.5 py-3 text-sm leading-snug ${hint.warn ? 'bg-warn-soft border border-warn' : 'bg-accent-soft'}`}>
            <b>{hint.title}</b> {hint.text}
          </p>
        )}
        {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}

        <button type="submit" disabled={busy}
          className="h-12 rounded-2xl border-0 bg-accent text-accent-ink text-lg font-bold cursor-pointer disabled:opacity-60">
          {busy ? 'Saving…' : chosen?.with.kind === 'afterpay' ? 'Add Afterpay order' : 'Save purchase'}
        </button>
      </form>
    </dialog>
  )
}

/** The heads-up under the form: Afterpay's 4 payments, or what SoFi has spoken for. */
function buildHint(m: MoneyData, today: string, w: PayWith | undefined, amt: number | null, date: string) {
  if (!w) return null
  if (w.kind === 'afterpay') {
    if (!amt) return { title: 'Splits into 4 payments.', text: 'Enter the order total to see the dates.', warn: false }
    const o = { total: amt, installments: 4, order_date: date, interval_days: 14 }
    const parts = [1, 2, 3, 4].map((n) => `${n === 1 ? 'today' : shortDate(installmentDate(o, n))} ${money(installmentAmount(o, n))}`)
    return { title: 'Splits into 4 payments:', text: `${parts.join(', ')}. Only the first counts as spent today.`, warn: false }
  }
  if (w.kind !== 'account') return null
  const acct = m.accounts.find((a) => a.id === w.id)
  if (!acct || acct.institution !== 'SoFi') return null

  // SoFi funds the savings challenge: show what's spoken for in the next 2 weeks
  const until = addDays(today, 14)
  let spoken = 0
  const parts: string[] = []
  for (const s of challengeSteps(m)) {
    if (!s.deposit && s.date >= today && s.date <= until) { spoken += s.amount; parts.push(`savings ${money(s.amount)} ${shortDate(s.date)}`) }
  }
  for (let k = today; k <= until; k = addDays(k, 1)) {
    for (const o of obligationsOn(m, k, today)) {
      if (o.kind === 'sub' && o.fromAccountId === acct.id) { spoken += o.amount ?? 0; parts.push(`${o.name.replace(' Life Insurance', '')} ${money(o.amount)} ${shortDate(k)}`) }
    }
  }
  const est = estimateBalance(m, acct, today).estimate
  if (est === null) {
    return { title: 'SoFi is your savings account.', text: `${spoken ? `${money(spoken)} is spoken for in the next 2 weeks (${parts.join(', ')}). ` : ''}Enter your SoFi balance on the Money tab to see what's free.`, warn: false }
  }
  const left = est - (amt ?? 0) - spoken
  return {
    title: 'SoFi is your savings account.',
    text: `${spoken ? `${money(spoken)} is spoken for in the next 2 weeks (${parts.join(', ')}). ` : ''}After this you'd have about ${money(left)} free.${left < 0 ? ' That dips into your savings. NFCU might be the better choice.' : ''}`,
    warn: left < 0,
  }
}
