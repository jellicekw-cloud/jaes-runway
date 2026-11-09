import { useState } from 'react'
import { addDays, daysBetween, shortDate } from '../lib/dates'
import { cycleStats, deletePeriod, endPeriod, periodEnd, periodOn, startPeriod, type Period } from '../lib/cycle'

export const CYCLE_COLOR = '#E11D74'

/** 🌸 one line under the calendar; tap to see past periods. */
export function CycleCard({ periods, today, reload }: { periods: Period[]; today: string; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = cycleStats(periods, today)
  const run = (f: () => Promise<void>) => { setBusy(true); void f().then(reload).finally(() => setBusy(false)) }

  const line = s.open ? `Period · day ${s.day}`
    : !s.last ? 'Tap "Started today" when your next period starts'
      : !s.from ? `Day ${s.day} · log one more period to see an estimate`
        : s.late !== null ? `Day ${s.day} · it's been longer than usual, and that's common when cycles are changing`
          : `Day ${s.day} · next likely ${s.from === s.to ? shortDate(s.from) : `${shortDate(s.from)} – ${shortDate(s.to!)}`}`
  return (
    <section aria-label="Cycle" className="rounded-2xl border border-line bg-surface px-3.5 py-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-2 bg-transparent border-0 p-0 text-left text-fg cursor-pointer">
          <span aria-hidden="true">🌸</span>
          <span className="flex-1 min-w-0 text-sm"><b>Cycle</b> <span className="text-muted">· {line}</span></span>
          <span aria-hidden="true" className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        </button>
        {s.open
          ? <button type="button" disabled={busy} onClick={() => run(() => endPeriod(s.last!.id, today))} className="h-9 px-3 rounded-lg border border-line bg-surface text-fg text-sm font-bold cursor-pointer shrink-0">Ended today</button>
          : <button type="button" disabled={busy} onClick={() => run(() => startPeriod(today))} className="h-9 px-3 rounded-lg border-0 text-white text-sm font-bold cursor-pointer shrink-0" style={{ background: CYCLE_COLOR }}>Started today</button>}
      </div>
      {open && (
        <div className="flex flex-col gap-2 text-sm">
          {s.min !== null && s.max !== null && (
            <p className="m-0 text-muted">
              {s.changing ? `Your cycles have run ${s.min}–${s.max} days lately, so Runway shows a range instead of one date.` : `Your cycles have been about ${s.avg} days.`}
              {' '}Estimates only, not for birth control.
            </p>
          )}
          {periods.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col">
              {periods.slice(0, 6).map((p, i) => {
                const prev = periods[i + 1]
                const len = daysBetween(p.start_date, periodEnd(p, today)) + 1
                return (
                  <li key={p.id} className="flex items-center gap-2 py-1.5 border-t border-line first:border-t-0">
                    <span className="flex-1">{shortDate(p.start_date)}{p.end_date ? ` – ${shortDate(p.end_date)}` : ''} <span className="text-muted">· {len} day{len === 1 ? '' : 's'}{prev ? ` · ${daysBetween(prev.start_date, p.start_date)}-day cycle` : ''}</span></span>
                    <button type="button" disabled={busy} onClick={() => run(() => deletePeriod(p.id))} aria-label={`Remove period starting ${shortDate(p.start_date)}`}
                      className="bg-transparent border-0 text-muted text-xs font-bold cursor-pointer">Remove</button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="m-0 text-xs text-muted">Missed one? Tap that day on the calendar, then "Period started this day".</p>
        </div>
      )}
    </section>
  )
}

/** In the selected day's panel: mark a start, an end, or see which period day it was. */
export function CycleDay({ periods, date, today, reload }: { periods: Period[]; date: string; today: string; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  if (date > today) return null
  const p = periodOn(periods, date, today)
  const run = (f: () => Promise<void>) => { setBusy(true); void f().then(reload).finally(() => setBusy(false)) }
  if (p) {
    const n = daysBetween(p.start_date, date) + 1
    const last = periodEnd(p, today)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="cycle-day">
        <span style={{ color: CYCLE_COLOR }} className="font-bold">🌸 Period · day {n}</span>
        {date !== last || !p.end_date ? (
          date >= p.start_date && <button type="button" disabled={busy} onClick={() => run(() => endPeriod(p.id, date))} className="bg-transparent border-0 text-accent text-sm font-bold underline cursor-pointer">Ended this day</button>
        ) : null}
        {date === p.start_date && <button type="button" disabled={busy} onClick={() => run(() => deletePeriod(p.id))} className="bg-transparent border-0 text-muted text-sm font-bold underline cursor-pointer">Not a period · remove</button>}
      </div>
    )
  }
  // Right after a period that ended early? Let this day extend it instead of starting a new one.
  const before = periods.find((x) => x.end_date && x.end_date === addDays(date, -1))
  return (
    <div className="flex flex-wrap gap-3 text-sm" data-testid="cycle-day">
      <button type="button" disabled={busy} onClick={() => run(() => startPeriod(date))} className="bg-transparent border-0 p-0 text-sm font-bold underline cursor-pointer" style={{ color: CYCLE_COLOR }}>🌸 Period started this day</button>
      {before && <button type="button" disabled={busy} onClick={() => run(() => endPeriod(before.id, date))} className="bg-transparent border-0 p-0 text-accent text-sm font-bold underline cursor-pointer">Still going (extend)</button>}
    </div>
  )
}
