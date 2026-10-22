import { useState, type FormEvent } from 'react'
import { DAYS, addDays, dateOf, money, shortDate } from '../lib/dates'
import { parseMoney, type MoneyData, type TripCost } from '../lib/money'
import {
  CARD_LINE, CUSHION, becauseText, canIAfford, dayText, type AccountAnswer, type AfterpayAnswer, type Verdict,
} from '../lib/afford'

const TONE: Record<Verdict, string> = {
  yes: 'border-pay bg-pay-soft text-pay-ink',
  tight: 'border-warn bg-warn-soft text-warn',
  no: 'border-bad bg-bad/10 text-bad',
  unknown: 'border-line bg-surface-2 text-muted',
}
const ICON: Record<Verdict, string> = { yes: '🟢', tight: '🟡', no: '🔴', unknown: '⚪' }

function Answer({ title, verdict, lines }: { title: string; verdict: Verdict; lines: (string | null | false)[] }) {
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 ${TONE[verdict]}`}>
      <b className="block">{ICON[verdict]} {title}</b>
      {lines.filter(Boolean).map((l, i) => <span key={i} className="block text-sm text-fg/80">{l}</span>)}
    </div>
  )
}

function accountTitle(a: AccountAnswer): string {
  const name = a.account.institution ?? a.account.name
  if (a.verdict === 'unknown') return `${name}: add your balance on the Money tab first`
  if (a.verdict === 'yes') return `Yes, from ${name}`
  if (a.verdict === 'tight') return `Tight from ${name}`
  return `Not yet from ${name}. You'd be ${money(Math.abs(a.low!.amount))} short`
}

export default function AffordCheck({ m, today, tripCosts, compact }: { m: MoneyData; today: string; tripCosts: TripCost[]; compact?: boolean }) {
  const [amount, setAmount] = useState('')
  const [what, setWhat] = useState('')
  const [when, setWhen] = useState<'today' | 'pick' | string>('today')
  const [pick, setPick] = useState(addDays(today, 1))
  const [showCards, setShowCards] = useState(false)
  const [asked, setAsked] = useState<{ amount: number; date: string; what: string } | null>(null)
  const [error, setError] = useState('')

  const quick = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, i)).filter((k, i) => i === 0 || dateOf(k).getDay() === 5 || i === 1)
  const date = when === 'today' ? today : when === 'pick' ? pick : when

  function ask(e: FormEvent) {
    e.preventDefault()
    const amt = parseMoney(amount)
    if (!amt || amt <= 0) { setError('Enter the amount.'); return }
    setError('')
    setAsked({ amount: amt, date, what: what.trim() })
  }

  const result = asked ? canIAfford(m, today, asked.amount, asked.date, tripCosts) : null
  const best = result?.accounts.filter((a) => a.verdict === 'yes').sort((a, b) => b.low!.amount - a.low!.amount)[0]

  return (
    <section aria-label="Can I afford it?" className={`rounded-2xl border border-line bg-surface ${compact ? 'p-4' : 'p-5'} flex flex-col gap-3`}>
      <h2 className={compact ? 'm-0 text-xs font-bold tracking-widest uppercase text-muted' : 'm-0 text-2xl font-bold'}>Can I afford it?</h2>
      <form onSubmit={ask} className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <label className="flex items-center gap-1 h-11 w-36 shrink-0 rounded-xl border border-line bg-surface-2 px-3 font-bold">
            <span className="text-muted">$</span>
            <input inputMode="decimal" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoComplete="off"
              className="flex-1 min-w-0 border-0 bg-transparent text-fg font-bold tnum focus:outline-none" />
          </label>
          <input aria-label="What is it (optional)" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What (optional)" autoComplete="off"
            className="h-11 flex-1 min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
        </div>
        <div role="group" aria-label="When" className="flex flex-wrap items-center gap-1.5">
          {quick.map((k) => (
            <button key={k} type="button" aria-pressed={date === k && when !== 'pick'} onClick={() => setWhen(k === today ? 'today' : k)}
              className={`h-9 px-3 rounded-full border text-sm font-bold cursor-pointer ${date === k && when !== 'pick' ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>
              {k === today ? 'Today' : k === addDays(today, 1) ? 'Tomorrow' : DAYS[dateOf(k).getDay()]}
            </button>
          ))}
          <button type="button" aria-pressed={when === 'pick'} onClick={() => setWhen('pick')}
            className={`h-9 px-3 rounded-full border text-sm font-bold cursor-pointer ${when === 'pick' ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>Pick a date</button>
          {when === 'pick' && <input type="date" aria-label="Date" min={today} value={pick} onChange={(e) => setPick(e.target.value || pick)} className="h-9 rounded-xl border border-line bg-surface-2 px-2 text-fg" />}
          <button type="submit" className="ml-auto h-10 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">Check</button>
        </div>
        {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
      </form>

      {asked && result && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="m-0 text-sm text-muted">
            {money(asked.amount)}{asked.what ? ` for ${asked.what}` : ''} {asked.date === today ? 'today' : `on ${DAYS[dateOf(asked.date).getDay()]}, ${shortDate(asked.date)}`}
            {best ? <b className="text-pay-ink"> · Best: {best.account.institution ?? best.account.name}</b> : null}
          </p>
          {result.accounts.map((a) => (
            <Answer key={a.account.id} title={accountTitle(a)} verdict={a.verdict} lines={a.verdict === 'unknown' ? [] : [
              `Lowest point ${money(a.low!.amount)} on ${dayText(a.low!.date, today)}${becauseText(a.low!) ? `, ${becauseText(a.low!)}` : ''}${a.payday ? `, before your ${shortDate(a.payday)} payday` : ''}.`,
              a.verdict === 'tight' && `That's under your ${money(CUSHION)} cushion.`,
              a.verdict !== 'yes' && (a.fitsOn ? `It fits on ${DAYS[dateOf(a.fitsOn).getDay()]}, ${shortDate(a.fitsOn)}.` : 'It doesn\'t clear your cushion in the next 6 weeks.'),
              a.missingMinimums > 0 && `${a.missingMinimums} card${a.missingMinimums === 1 ? '' : 's'} due with no minimum entered, counted as $0.`,
              a.basedOn && `Using the balance you entered ${shortDate(a.basedOn.slice(0, 10))}.`,
            ]} />
          ))}
          <AfterpayLine ap={result.afterpay} today={today} />
          <button type="button" onClick={() => setShowCards(!showCards)} aria-expanded={showCards}
            className="self-start bg-transparent border-0 p-0 text-sm font-bold text-accent underline cursor-pointer">{showCards ? 'Hide cards' : 'What about a card?'}</button>
          {showCards && result.cards.map((c) => (
            <Answer key={c.card.id} title={c.card.name} verdict={c.usedAfter === null ? 'unknown' : c.overLine ? 'tight' : 'yes'} lines={[
              c.usedAfter === null ? 'Add the balance and limit on the Bills tab to check.' : `Would go to ${c.usedAfter}% used${c.overLine ? `, over your ${CARD_LINE}% line` : ''}.`,
              c.available !== null && `${money(c.available)} available now.`,
            ]} />
          ))}
        </div>
      )}
    </section>
  )
}

function AfterpayLine({ ap, today }: { ap: AfterpayAnswer; today: string }) {
  const name = ap.account?.institution ?? 'your bills account'
  const plan = ap.payments.map((p) => `${money(p.amount)} ${dayText(p.date, today)}`).join(' · ')
  const title = ap.verdict === 'unknown' ? 'Afterpay: add your NFCU balance first' : ap.verdict === 'yes' ? `Yes with Afterpay (from ${name})` : ap.verdict === 'tight' ? 'Tight with Afterpay' : 'Not yet with Afterpay'
  return (
    <Answer title={title} verdict={ap.verdict} lines={[
      plan,
      ap.low && `Lowest point ${money(ap.low.amount)} on ${dayText(ap.low.date, today)}.`,
      ap.verdict !== 'yes' && ap.verdict !== 'unknown' && (ap.fitsOn ? `It fits starting ${shortDate(ap.fitsOn)}.` : null),
    ]} />
  )
}
