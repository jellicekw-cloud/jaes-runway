import { useEffect, useState } from 'react'
import { money, shortDate } from '../lib/dates'
import type { MoneyData } from '../lib/money'
import {
  closesText, debtSeries, interestAvoided, lastMonthKey, recap, recapWeek, recentMilestones, statementsSoon, type Milestone,
} from '../lib/progress'
import { Burst } from './Confetti'

const seen = (k: string) => { try { return localStorage.getItem(`runway-seen-${k}`) === '1' } catch { return false } }
const markSeen = (k: string) => { try { localStorage.setItem(`runway-seen-${k}`, '1') } catch { /* fine */ } }

// ---------------------------------------------------------------------------
// The chart on the Paydown plan
// ---------------------------------------------------------------------------

export function DebtProgress({ m, today }: { m: MoneyData; today: string }) {
  const series = debtSeries(m, today)
  const saved = interestAvoided(m, today)
  if (series.length < 2) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
        📉 Your progress chart starts {series.length ? `on ${shortDate(series[0].date)}` : 'with your first card balance'}. It fills in as your balances go down.
      </div>
    )
  }
  const W = 600, H = 140, P = 6
  const max = Math.max(...series.map((s) => s.total)), min = Math.min(...series.map((s) => s.total))
  const span = Math.max(1, max - min)
  const t0 = new Date(series[0].date).getTime(), t1 = new Date(series[series.length - 1].date).getTime()
  const x = (d: string) => P + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P)
  const y = (v: number) => P + (1 - (v - min) / span) * (H - 2 * P)
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(s.date).toFixed(1)},${y(s.total).toFixed(1)}`).join(' ')
  const area = `${line} L${x(series[series.length - 1].date).toFixed(1)},${H} L${x(series[0].date).toFixed(1)},${H} Z`
  const first = series[0], last = series[series.length - 1]
  const down = Math.round((first.total - last.total) * 100) / 100
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className={down > 0 ? 'text-pay-ink' : ''}>{down > 0 ? `📉 Down ${money(down)} since ${shortDate(first.date)}` : `Card debt since ${shortDate(first.date)}`}</b>
        {saved > 0 && <span className="text-sm text-pay-ink font-bold">about {money(saved)} interest avoided</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label={`Card debt from ${money(first.total)} to ${money(last.total)}`} preserveAspectRatio="none">
        <path d={area} fill="var(--pay-soft)" />
        <path d={line} fill="none" stroke="var(--pay)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-xs text-muted tnum"><span>{shortDate(first.date)} · {money(first.total)}</span><span>{shortDate(last.date)} · {money(last.total)}</span></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Milestones: a card paid off, or under 30%
// ---------------------------------------------------------------------------

export function MilestoneBanner({ m, today }: { m: MoneyData; today: string }) {
  const [gone, setGone] = useState<string[]>([])
  const [burst, setBurst] = useState(0)
  const next: Milestone | undefined = recentMilestones(m, today).find((x) => !seen(x.key) && !gone.includes(x.key))
  useEffect(() => { if (next) setBurst((n) => n + 1) }, [next?.key])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!next) return null
  const paid = next.kind === 'paid_off'
  return (
    <>
      <section aria-label="Milestone" className="rounded-2xl p-4 text-white flex items-center gap-3" style={{ background: 'linear-gradient(120deg, #16A34A 0%, #0D9488 60%, #6D28D9 100%)' }}>
        <span aria-hidden="true" className="text-3xl">{paid ? '🎉' : '🏅'}</span>
        <span className="flex-1 min-w-0">
          <b className="block text-lg leading-tight">{paid ? `${next.card.name} is PAID OFF!` : `${next.card.name} is under 30%!`}</b>
          <span className="block text-sm text-white/90">{paid ? 'That\'s one card done. Its minimum now goes to the next card.' : 'That helps your credit score. Keep going.'}</span>
        </span>
        <button type="button" onClick={() => { markSeen(next.key); setGone((g) => [...g, next.key]) }} className="h-9 px-3 rounded-xl border-0 bg-white/20 text-white font-bold cursor-pointer">Yay!</button>
      </section>
      {burst > 0 && <Burst key={burst} onDone={() => setBurst(0)} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Statement closing soon
// ---------------------------------------------------------------------------

export function StatementNudge({ m, today }: { m: MoneyData; today: string }) {
  const soon = statementsSoon(m, today).filter((s) => s.payForUnder30 !== null)
  if (!soon.length) return null
  return (
    <section aria-label="Statement closing soon" className="rounded-2xl border border-warn bg-warn-soft p-4 flex flex-col gap-1.5">
      <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-warn">🧾 Statement closing soon</h2>
      {soon.map((s) => (
        <p key={s.card.id} className="m-0 text-sm">
          <b>{s.card.name}</b> closes <b>{closesText(s)}</b> ({shortDate(s.closes)}). Pay <b>{money(s.payForUnder30!)}</b> before then and it reports under 30% instead of {s.usedNow}%.
        </p>
      ))}
      <span className="text-xs text-muted">The balance on the closing day is what the card tells the credit bureaus.</span>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Monthly recap
// ---------------------------------------------------------------------------

export function RecapCard({ m, today, homeOnly }: { m: MoneyData; today: string; homeOnly?: boolean }) {
  const month = lastMonthKey(today)
  const [hidden, setHidden] = useState(() => seen(`recap-${month}`))
  if (homeOnly && (!recapWeek(today) || hidden)) return null
  const r = recap(m, month)
  const change = r.debtStart !== null && r.debtEnd !== null ? Math.round((r.debtStart - r.debtEnd) * 100) / 100 : null
  const pct = change !== null && r.debtStart ? Math.round((change / r.debtStart) * 100) : null
  const net = Math.round((r.paychecks + r.otherIn - r.spent) * 100) / 100
  return (
    <section aria-label={`${r.label} recap`} className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-muted">📊 Your {r.label} recap</h2>
        {homeOnly && <button type="button" onClick={() => { markSeen(`recap-${month}`); setHidden(true) }} className="bg-transparent border-0 text-sm font-bold text-accent cursor-pointer">Got it</button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Card debt" value={change === null ? '—' : change >= 0 ? `↓ ${money(change)}` : `↑ ${money(-change)}`} note={pct !== null ? `${Math.abs(pct)}% ${change! >= 0 ? 'lower' : 'higher'}` : 'balance tracking hadn\'t started yet'} good={change !== null && change > 0} />
        <Tile label="Extra to cards" value={money(r.extraPaid)} note={r.interestAvoided ? `≈ ${money(r.interestAvoided)}/mo interest avoided` : `${money(r.minimumsPaid)} in minimums`} good={r.extraPaid > 0} />
        <Tile label="Money in" value={money(r.paychecks + r.otherIn)} note={`${money(r.paychecks)} pay · ${money(r.otherIn)} other`} />
        <Tile label="Spent" value={money(r.spent)} note={net >= 0 ? `${money(net)} left over` : `${money(-net)} more than came in`} good={net >= 0} />
      </div>
      {r.categories.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-widest uppercase text-muted">Top spending</span>
          {r.categories.map((c) => {
            const diff = Math.round((c.amount - c.before) * 100) / 100
            return (
              <div key={c.name} className="flex items-center gap-2 text-sm">
                <b className="flex-1">{c.name}</b>
                <span className="tnum">{money(c.amount)}</span>
                <span className={`tnum text-xs font-bold w-24 text-right ${diff > 0 ? 'text-warn' : 'text-pay-ink'}`}>{c.before ? `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))} vs before` : 'new'}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Tile({ label, value, note, good }: { label: string; value: string; note: string; good?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${good ? 'bg-pay-soft' : 'bg-surface-2'}`}>
      <span className="block text-[11px] font-bold tracking-wider uppercase text-muted">{label}</span>
      <b className={`block text-lg tnum ${good ? 'text-pay-ink' : ''}`}>{value}</b>
      <span className="block text-xs text-muted">{note}</span>
    </div>
  )
}
