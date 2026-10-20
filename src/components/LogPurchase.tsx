import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addDays, money, shortDate } from '../lib/dates'
import {
  billsAccountId, challengeSteps, estimateBalance, installmentAmount, installmentDate, logPurchase, obligationsOn, parseMoney,
  type MoneyData, type PayWith,
} from '../lib/money'
import { CATEGORIES } from '../lib/types'
import { REPEAT_LABEL, addEvent, addTodo, type Repeat } from '../lib/plans'

export type AddMode = 'buy' | 'todo' | 'event'

interface Props {
  open: boolean
  onClose: () => void
  mode: AddMode
  onMode: (m: AddMode) => void
  reloadPlans: () => Promise<void>
  today: string
  money: MoneyData
  reloadMoney: () => Promise<void>
  onLogged: (message: string) => void
}

/** The + button's window: log a purchase from anywhere in the app. */
export default function LogPurchase({ open, onClose, mode, onMode, reloadPlans, today, money: m, reloadMoney, onLogged }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState('')
  const [what, setWhat] = useState('')
  const [category, setCategory] = useState<string>('Other')
  const [date, setDate] = useState(today)
  const [withKey, setWithKey] = useState('')
  const [apSkip, setApSkip] = useState(false)
  const [apFirst, setApFirst] = useState(addDays(today, 14))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // to-do / event fields
  const textRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [when, setWhen] = useState<'none' | 'today' | 'tomorrow' | 'pick'>('none')
  const [pick, setPick] = useState(today)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')

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
      setAmount(''); setWhat(''); setCategory('Other'); setDate(today); setError(''); setApSkip(false); setApFirst(addDays(today, 14))
      setText(''); setWhen(mode === 'event' ? 'today' : 'none'); setPick(today); setRepeat('none'); setTime(''); setPlace('')
      setWithKey(nfcu ? `a:${nfcu}` : options[0]?.key ?? '')
      el.showModal()
      requestAnimationFrame(() => (mode === 'buy' ? amountRef.current : textRef.current)?.focus())
    }
    if (!open && el.open) el.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const amt = parseMoney(amount)
  const picked = options.find((o) => o.key === withKey)
  const chosen = picked && picked.with.kind === 'afterpay' ? { ...picked, with: { kind: 'afterpay', firstPayment: apSkip ? apFirst : date } as PayWith } : picked
  const hint = buildHint(m, today, chosen?.with, amt, date)

  const dueDate = when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : when === 'pick' ? pick : null

  async function submitPlan(e: FormEvent) {
    e.preventDefault()
    const v = text.trim()
    if (!v) { setError(mode === 'event' ? 'Name the event.' : 'Type the to-do.'); textRef.current?.focus(); return }
    if (mode === 'event' && !dueDate) { setError('Pick a day for the event.'); return }
    setBusy(true); setError('')
    try {
      if (mode === 'todo') await addTodo({ text: v, due_date: dueDate, repeat })
      else await addEvent({ title: v, event_date: dueDate!, start_time: time || null, location: place.trim() || null })
      await reloadPlans()
      onLogged(`Added${dueDate ? ` for ${dueDate === today ? 'today' : shortDate(dueDate)}` : ''} · ${v}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\'t save')
    }
    setBusy(false)
  }

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
        ? (apSkip ? `Afterpay order added · first payment ${shortDate(apFirst)}` : `Afterpay order added · ${money(installmentAmount({ total: amt, installments: 4 }, 1))} today`)
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
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 id="log-title" className="m-0 text-2xl font-bold">Add</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="size-10 rounded-full border border-line bg-transparent text-fg grid place-items-center cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div role="tablist" aria-label="What to add" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {([['buy', 'Purchase'], ['todo', 'To-do'], ['event', 'Event']] as [AddMode, string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k}
              onClick={() => { onMode(k); setError(''); if (k === 'event' && when === 'none') setWhen('today'); requestAnimationFrame(() => (k === 'buy' ? amountRef.current : textRef.current)?.focus()) }}
              className={`h-10 rounded-lg border-0 font-bold cursor-pointer ${mode === k ? 'bg-accent text-accent-ink' : 'bg-transparent text-muted'}`}>{l}</button>
          ))}
        </div>

        {mode !== 'buy' ? (
          <form onSubmit={submitPlan} className="flex flex-col gap-4">
            <label htmlFor="ad-text" className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-widest uppercase text-muted">{mode === 'todo' ? 'What needs doing' : 'Event'}</span>
              <input id="ad-text" ref={textRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off"
                placeholder={mode === 'todo' ? 'e.g. Return tags to DMV' : 'e.g. Dentist, Bubb\'s game'}
                className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
            </label>
            <div className="flex flex-col gap-1.5">
              <span id="ad-when" className="text-xs font-bold tracking-widest uppercase text-muted">When</span>
              <div role="group" aria-labelledby="ad-when" className="flex flex-wrap gap-1.5">
                {([...(mode === 'todo' ? [['none', 'Anytime']] : []), ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['pick', 'Pick a date']] as [typeof when, string][]).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={when === k} onClick={() => setWhen(k)}
                    className={`h-9 px-3 rounded-full border text-sm font-bold cursor-pointer ${when === k ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>{l}</button>
                ))}
              </div>
              {when === 'pick' && (
                <input type="date" aria-label="Date" value={pick} onChange={(e) => setPick(e.target.value || today)}
                  className="h-10 self-start rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
              )}
            </div>
            {mode === 'todo' && dueDate && (
              <div className="flex flex-col gap-1.5">
                <span id="ad-rep" className="text-xs font-bold tracking-widest uppercase text-muted">Repeats</span>
                <div role="group" aria-labelledby="ad-rep" className="flex flex-wrap gap-1.5">
                  {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
                    <button key={r} type="button" aria-pressed={repeat === r} onClick={() => setRepeat(r)}
                      className={`h-9 px-3 rounded-full border text-sm font-bold cursor-pointer ${repeat === r ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>{REPEAT_LABEL[r]}</button>
                  ))}
                </div>
              </div>
            )}
            {mode === 'event' && (
              <div className="grid grid-cols-2 gap-2.5">
                <label htmlFor="ad-time" className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold tracking-widest uppercase text-muted">Time (optional)</span>
                  <input id="ad-time" type="time" value={time} onChange={(e) => setTime(e.target.value)}
                    className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
                </label>
                <label htmlFor="ad-place" className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold tracking-widest uppercase text-muted">Where (optional)</span>
                  <input id="ad-place" value={place} onChange={(e) => setPlace(e.target.value)} autoComplete="off"
                    className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
                </label>
              </div>
            )}
            {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
            <button type="submit" disabled={busy}
              className="h-12 rounded-2xl border-0 bg-accent text-accent-ink text-lg font-bold cursor-pointer disabled:opacity-60">
              {busy ? 'Saving…' : mode === 'todo' ? 'Add to-do' : 'Add event'}
            </button>
          </form>
        ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
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
          <input id="lp-date" type="date" value={date} max={today} onChange={(e) => { const v = e.target.value || today; setDate(v); if (!apSkip) setApFirst(addDays(v, 14)) }}
            className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
        </label>

        {picked?.with.kind === 'afterpay' && (
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2.5 font-bold">
              <input type="checkbox" checked={apSkip} onChange={(e) => setApSkip(e.target.checked)} className="size-5 accent-[var(--accent)]" />
              First payment isn't due today (skipped / pay later)
            </label>
            {apSkip && (
              <label htmlFor="lp-ap-first" className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold tracking-widest uppercase text-muted">First payment due</span>
                <input id="lp-ap-first" type="date" min={date} value={apFirst} onChange={(e) => setApFirst(e.target.value || apFirst)}
                  className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
              </label>
            )}
          </div>
        )}

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
        )}
      </div>
    </dialog>
  )
}

/** The heads-up under the form: Afterpay's 4 payments, or what SoFi has spoken for. */
function buildHint(m: MoneyData, today: string, w: PayWith | undefined, amt: number | null, date: string) {
  if (!w) return null
  if (w.kind === 'afterpay') {
    if (!amt) return { title: 'Splits into 4 payments.', text: 'Enter the order total to see the dates.', warn: false }
    const firstDue = w.firstPayment ?? date
    const o = { total: amt, installments: 4, order_date: firstDue, interval_days: 14 }
    const later = firstDue > date
    const parts = [1, 2, 3, 4].map((n) => `${n === 1 && !later && date === today ? 'today' : shortDate(installmentDate(o, n))} ${money(installmentAmount(o, n))}`)
    return { title: 'Splits into 4 payments:', text: `${parts.join(', ')}. ${later ? 'Nothing comes out today.' : 'Only the first counts as spent today.'}`, warn: false }
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
