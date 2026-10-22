import { useState } from 'react'
import { shortDate } from '../lib/dates'
import { parseMoney, type MoneyData, type TripCost } from '../lib/money'
import { CUSHION } from '../lib/afford'
import {
  PAYDAYS_PER_MONTH, monthlyInterest, money, payExtra, paydownSuggestion, payoffOrder, setShare, simulate, undoExtra,
} from '../lib/paydown'
import type { Card } from '../lib/types'

type Reload = () => Promise<void>

const skipKey = (payday: string) => `runway-paydown-skip-${payday}`
const wasSkipped = (payday: string) => { try { return localStorage.getItem(skipKey(payday)) === '1' } catch { return false } }

/** Split an amount across cards, highest APR first. */
function allocate(cards: Card[], total: number) {
  let left = total
  const out: { card: Card; amount: number }[] = []
  for (const c of payoffOrder(cards)) {
    if (left <= 0) break
    const amt = Math.min(left, Math.round((c.balance ?? 0) * 100) / 100)
    if (amt > 0) { out.push({ card: c, amount: amt }); left = Math.round((left - amt) * 100) / 100 }
  }
  return out
}

/** Payday: "You can safely put $X toward Kohl's". On Home and the Bills tab, only in payday week. */
export function PaydownCard({ m, today, tripCosts, reloadMoney, onToast }: { m: MoneyData; today: string; tripCosts: TripCost[]; reloadMoney: Reload; onToast?: (msg: string) => void }) {
  const s = paydownSuggestion(m, today, tripCosts)
  const [amount, setAmount] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!s || skipped || wasSkipped(s.payday)) return null

  const box = 'rounded-2xl border-2 border-pay bg-pay-soft p-4 flex flex-col gap-2.5'
  const head = <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-pay-ink">💡 Payday paydown</h2>

  if (s.alreadyPaid > 0) {
    return (
      <section aria-label="Payday paydown" className={box}>
        {head}
        <b className="text-lg">✓ {money(s.alreadyPaid)} sent toward your cards this payday.</b>
        <span className="text-sm text-fg/80">That's interest you won't pay. See your plan on the Bills tab.</span>
      </section>
    )
  }
  if (s.total < 10) {
    return (
      <section aria-label="Payday paydown" className={box.replace('border-pay bg-pay-soft', 'border-line bg-surface')}>
        {head}
        <b>Nothing safely extra this payday.</b>
        <span className="text-sm text-muted">
          {s.accountName} gets down to {money(s.lowest)} on {shortDate(s.lowestOn)} with everything due{s.nextPayday ? ` before your ${shortDate(s.nextPayday)} payday` : ''}, and you keep a {money(CUSHION)} cushion.
          {' '}Next check: {s.nextPayday ? shortDate(s.nextPayday) : 'next payday'}.
        </span>
        <button type="button" onClick={() => { try { localStorage.setItem(skipKey(s.payday), '1') } catch { /* fine */ } setSkipped(true) }}
          className="self-start bg-transparent border-0 p-0 text-sm font-bold text-accent underline cursor-pointer">OK</button>
      </section>
    )
  }

  const total = amount === null ? s.total : (parseMoney(amount) ?? 0)
  const parts = amount === null ? s.split : allocate(m.cards, total)
  const missingApr = payoffOrder(m.cards).some((c) => c.apr === null)

  async function paid() {
    if (total <= 0) { setError('Enter the amount you paid.'); return }
    setBusy(true); setError('')
    try {
      await payExtra(m, s!.accountId, parts, today)
      await reloadMoney()
      onToast?.(`${money(total)} toward ${parts.map((p) => p.card.name.replace(' Mastercard', '')).join(' and ')}. Nice.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t save'); setBusy(false) }
  }

  return (
    <section aria-label="Payday paydown" className={box}>
      {head}
      <b className="text-lg leading-snug">You can safely put {money(s.total)} toward your cards.</b>
      <ul className="m-0 p-0 list-none flex flex-col gap-1">
        {parts.map((p) => (
          <li key={p.card.id} className="flex items-center gap-2 text-sm">
            <span className="size-3 rounded-full shrink-0" style={{ background: p.card.color }} />
            <b className="flex-1 min-w-0 truncate">{p.card.name}{p.card.apr !== null ? <span className="font-normal text-muted"> · {p.card.apr}% APR</span> : null}</b>
            <b className="tnum">{money(p.amount)}</b>
          </li>
        ))}
      </ul>
      <span className="text-sm text-fg/80">
        That's {s.share}% of the {money(s.safeExtra)} that's safely extra in {s.accountName}. The rest stays for surprises, and {s.accountName} still keeps {money(CUSHION)}+ through {s.nextPayday ? `your ${shortDate(s.nextPayday)} payday` : 'next payday'}.
      </span>
      {missingApr && <span className="text-sm font-bold text-warn">Add each card's APR on the Bills tab so the order is right.</span>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 h-10 w-32 rounded-xl border border-line bg-surface px-2.5 font-bold">
          <span className="text-muted">$</span>
          <input inputMode="decimal" aria-label="Amount you'll pay" value={amount ?? s.total.toFixed(2)} onChange={(e) => setAmount(e.target.value)}
            className="flex-1 min-w-0 border-0 bg-transparent text-fg font-bold tnum focus:outline-none" />
        </label>
        <button type="button" disabled={busy} onClick={() => void paid()} className="h-10 px-4 rounded-xl border-0 bg-pay text-white font-bold cursor-pointer">{busy ? 'Saving…' : 'I paid it'}</button>
        <button type="button" onClick={() => { try { localStorage.setItem(skipKey(s.payday), '1') } catch { /* fine */ } setSkipped(true) }}
          className="h-10 px-3 rounded-xl border border-line bg-transparent text-fg font-bold cursor-pointer">Not this time</button>
      </div>
      <span className="text-xs text-muted">Make the payment in your card's app, then tap I paid it so Runway updates the balance.</span>
      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
    </section>
  )
}

/** Bills tab: the plan. Debt-free date with minimums only vs. with extra each payday. */
export function PaydownPlan({ m, today, tripCosts, reloadMoney }: { m: MoneyData; today: string; tripCosts: TripCost[]; reloadMoney: Reload }) {
  const order = payoffOrder(m.cards)
  const s = paydownSuggestion(m, today, tripCosts)
  const recent = m.extraPayments.slice(0, 8)
  const paidSince = m.extraPayments.reduce((t, x) => t + x.amount, 0)
  const typical = (() => {
    const since = m.extraPayments.filter((x) => x.paid_on >= addDaysKey(today, -90))
    if (since.length) return Math.round(since.reduce((t, x) => t + x.amount, 0) / (90 / 14))
    return s && s.total >= 10 ? s.total : 100
  })()
  const [extra, setExtra] = useState(String(typical))
  const [error, setError] = useState('')
  const perPayday = parseMoney(extra) ?? 0
  const share = m.settings?.paydown_share ?? 40

  if (!order.length) {
    return <p className="m-0 text-muted">Enter each card's balance (and its APR and minimum) above to see your paydown plan.</p>
  }
  const missing = order.filter((c) => c.minimum_payment === null || c.apr === null)
  const total = order.reduce((t, c) => t + (c.balance ?? 0), 0)
  const base = simulate(m.cards, 0, today, false)
  const plan = simulate(m.cards, perPayday * PAYDAYS_PER_MONTH, today, true)
  const label = (r: { months: number | null; done: string | null }) => {
    if (r.months === null || !r.done) return 'never (the minimums don\'t cover the interest)'
    const [y, mo] = r.done.split('-').map(Number)
    const yrs = Math.floor(r.months / 12), ms = r.months % 12
    return `${new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })} (${yrs ? `${yrs} yr${yrs > 1 ? 's' : ''} ` : ''}${ms ? `${ms} mo` : ''})`.replace(' )', ')')
  }

  async function run(f: () => Promise<unknown>) {
    setError('')
    try { await f(); await reloadMoney() } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t save') }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <span className="block text-xs font-bold tracking-widest uppercase text-muted">Card balances</span>
          <b className="block text-2xl tnum">{money(total)}</b>
          <span className="block text-sm text-muted">about {money(monthlyInterest(m.cards))} interest a month</span>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <span className="block text-xs font-bold tracking-widest uppercase text-muted">Minimums only</span>
          <b className="block text-lg leading-snug">Debt-free {label(base)}</b>
          <span className="block text-sm text-muted">{base.months !== null ? `${money(base.interest)} in interest` : ''}</span>
        </div>
        <div className="rounded-2xl border-2 border-pay bg-pay-soft p-4">
          <span className="block text-xs font-bold tracking-widest uppercase text-pay-ink">With extra each payday</span>
          <b className="block text-lg leading-snug">Debt-free {label(plan)}</b>
          <span className="block text-sm text-pay-ink">
            {plan.months !== null && base.months !== null ? `Saves ${money(Math.max(0, base.interest - plan.interest))} and ${base.months - plan.months} months` : plan.months !== null ? `${money(plan.interest)} in interest` : ''}
          </span>
        </div>
      </div>

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>If you send about</span>
        <span className="flex items-center gap-1 h-9 w-28 rounded-lg border border-line bg-surface-2 px-2 font-bold">
          <span className="text-muted">$</span>
          <input inputMode="decimal" aria-label="Extra each payday" value={extra} onChange={(e) => setExtra(e.target.value)} className="flex-1 min-w-0 border-0 bg-transparent text-fg font-bold tnum focus:outline-none" />
        </span>
        <span>extra each payday (minimums keep going, and a paid-off card's minimum rolls into the next one).</span>
      </label>

      <ol className="m-0 p-0 list-none rounded-2xl border border-line bg-surface px-3.5">
        {order.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5 border-t border-line first:border-t-0">
            <span className="size-7 rounded-full grid place-items-center text-sm font-bold text-white shrink-0" style={{ background: c.color }}>{i + 1}</span>
            <span className="flex-1 min-w-0">
              <b className="block truncate">{c.name}</b>
              <span className="block text-sm text-muted">{c.apr !== null ? `${c.apr}% APR` : 'APR not entered'} · min {c.minimum_payment !== null ? money(c.minimum_payment) : 'not entered'}</span>
            </span>
            <b className="tnum">{money(c.balance ?? 0)}</b>
          </li>
        ))}
      </ol>
      <p className="m-0 text-sm text-muted">Extra goes to #1 first (highest interest), which saves the most money overall.</p>
      {missing.length > 0 && <p className="m-0 text-sm font-bold text-warn">Add the {missing.some((c) => c.apr === null) ? 'APR' : ''}{missing.some((c) => c.apr === null) && missing.some((c) => c.minimum_payment === null) ? ' and ' : ''}{missing.some((c) => c.minimum_payment === null) ? 'minimum' : ''} for {missing.map((c) => c.name).join(', ')} so the plan is accurate.</p>}

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>On payday, suggest</span>
        <select aria-label="Share of the safe extra" value={share} onChange={(e) => void run(() => setShare(Number(e.target.value)))}
          className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-fg font-bold">
          {[25, 40, 50, 75, 100].map((n) => <option key={n} value={n}>{n}%</option>)}
        </select>
        <span>of what's safely extra (keeping the {money(CUSHION)} cushion).</span>
      </label>

      {recent.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-widest uppercase text-muted">Extra paid · {money(paidSince)} so far</span>
          <ul className="m-0 p-0 list-none rounded-2xl border border-line bg-surface px-3.5">
            {recent.map((x) => {
              const c = m.cards.find((k) => k.id === x.card_id)
              return (
                <li key={x.id} className="flex items-center gap-3 py-2 border-t border-line first:border-t-0 text-sm">
                  <span className="w-14 text-muted">{shortDate(x.paid_on)}</span>
                  <b className="flex-1 min-w-0 truncate">{c?.name ?? 'Card'}</b>
                  <b className="tnum text-pay-ink">{money(x.amount)}</b>
                  <button type="button" onClick={() => void run(() => undoExtra(m, x.id))} className="bg-transparent border-0 text-accent font-bold cursor-pointer">Undo</button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
    </div>
  )
}

function addDaysKey(k: string, n: number) {
  const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
