import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { DAYS, MONTHS, dateOf, keyOf, lastDayOfMonth } from '../lib/dates'
import { loadEntries, loadTags } from '../lib/journal'
import { isPayday, obligationsOn, savingsOn, type MoneyData } from '../lib/money'
import { MOOD_EMOJI, type JournalEntry, type Tag } from '../lib/types'
import DayBills from './DayBills'
import { eventsOn, todosOn, type Plans } from '../lib/plans'
import JournalEditor from './JournalEditor'
import { ChevronIcon } from './icons'
import { itemsOn, tripsOn, type TripsData } from '../lib/trips'

interface Props {
  userId: string
  today: string
  selected: string
  onSelect: (date: string) => void
  money: MoneyData
  reloadMoney: () => Promise<void>
  dayExtra?: (date: string, showAdd?: boolean) => ReactNode
  plans?: Plans
  trips?: TripsData
}

/** Full month (Monday first) with dots for what's on each day; tap a day to open it below. */
export default function MonthView({ userId, today, selected, onSelect, money: m, reloadMoney, dayExtra, plans, trips }: Props) {
  const sel = dateOf(selected)
  const year = sel.getFullYear(), month = sel.getMonth()
  const first = keyOf(new Date(year, month, 1))
  const last = keyOf(new Date(year, month, lastDayOfMonth(first)))
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loadedMonth, setLoadedMonth] = useState('')   // the editor waits for this so it never opens empty over a saved entry
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadedMonth('')
    Promise.all([loadEntries(first, last), loadTags()])
      .then(([e, t]) => { if (!cancelled) { setJournal(e); setTags(t); setLoadedMonth(first); setLoadError('') } })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Couldn\'t load your journal') })
    return () => { cancelled = true }
  }, [first, last])

  const onSaved = useCallback((date: string, entry: JournalEntry | null) => {
    setJournal((list) => [...list.filter((e) => e.entry_date !== date), ...(entry ? [entry] : [])])
  }, [])
  const onTagCreated = useCallback((tag: Tag) => setTags((l) => [...l, tag]), [])

  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const count = lastDayOfMonth(first)
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => keyOf(new Date(year, month, i + 1)))]
  while (cells.length % 7) cells.push(null)

  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    onSelect(keyOf(new Date(d.getFullYear(), d.getMonth(), Math.min(sel.getDate(), lastDayOfMonth(keyOf(d))))))
  }

  return (
    <div className="flex flex-col gap-3.5">
      <section className="rounded-2xl border border-line bg-surface p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <b className="text-xl">{MONTHS[month]} {year}</b>
          <div className="flex gap-1.5">
            <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="size-10 rounded-xl border border-line bg-surface text-fg grid place-items-center cursor-pointer"><ChevronIcon dir="left" /></button>
            <button type="button" aria-label="Next month" onClick={() => go(1)} className="size-10 rounded-xl border border-line bg-surface text-fg grid place-items-center cursor-pointer"><ChevronIcon dir="right" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold tracking-wide text-muted">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span key={i}>{x}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((k, i) => {
            if (!k) return <span key={i} />
            const d = dateOf(k).getDate()
            const pay = isPayday(m, k)
            const ob = obligationsOn(m, k, today)
            const save = savingsOn(m, k)
            const entry = journal.find((e) => e.entry_date === k)
            const late = ob.some((o) => o.status === 'overdue')
            const planDots = plans ? [...eventsOn(plans, k).map(() => 'var(--accent-hi)'), ...todosOn(plans, k, today).filter((t) => !t.done_at).map(() => 'var(--accent)')] : []
            const away = trips ? tripsOn(trips, k).length > 0 : false
            const tripDots = trips ? itemsOn(trips, k).slice(0, 1).map(() => '#8B3DFF') : []
            const dots = [
              ...tripDots,
              ...planDots,
              ...(save && !save.deposit ? ['var(--pay)'] : []),
              ...ob.filter((o) => o.status !== 'paid').slice(0, 3).map((o) => (o.kind === 'sub' ? 'var(--muted)' : o.color)),
            ].slice(0, 3)
            const isSel = k === selected, isToday = k === today
            return (
              <button key={k} type="button" onClick={() => onSelect(k)} aria-pressed={isSel}
                aria-label={`${DAYS[dateOf(k).getDay()]}, ${MONTHS[month]} ${d}${pay ? ', payday' : ''}${away ? ', on a trip' : ''}${ob.length ? `, ${ob.length} due` : ''}${late ? ', overdue' : ''}`}
                className={`relative h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 p-0 cursor-pointer border text-fg overflow-hidden ${isSel ? 'bg-accent text-accent-ink border-accent' : pay ? 'bg-pay-soft border-pay text-pay-ink' : late ? 'bg-surface-2 border-bad' : isToday ? 'bg-surface-2 border-2 border-accent-hi' : away ? 'bg-accent-soft border-transparent' : 'bg-surface-2 border-transparent'}`}>
                {away && <span aria-hidden="true" className="absolute left-0 right-0 top-0 h-1 bg-accent-hi" />}
                <span className="text-[15px] font-bold leading-none tnum">{d}</span>
                <span className="text-[11px] leading-none min-h-3">{entry?.mood ? MOOD_EMOJI[entry.mood] : pay ? '$' : ''}</span>
                <span className="flex gap-0.5 min-h-1.5">{dots.map((c, j) => <i key={j} className="size-1.5 rounded-full" style={{ background: c }} />)}</span>
              </button>
            )
          })}
        </div>
        <p className="m-0 text-xs text-muted">Green = payday · purple bar = on a trip · dots = trips, plans, to-dos, bills, auto-pay and savings · emoji = mood</p>
      </section>

      <section aria-label="Selected day" className="rounded-2xl border border-line bg-surface p-3.5 flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">{DAYS[sel.getDay()]}, {MONTHS[month]} {sel.getDate()}</h2>
        <DayBills date={selected} today={today} money={m} reloadMoney={reloadMoney} />
        {dayExtra?.(selected)}
        {!isPayday(m, selected) && obligationsOn(m, selected, today).length === 0 && !savingsOn(m, selected) && (
          <p className="m-0 text-sm text-muted">No bills or paydays this day.</p>
        )}
        {loadError ? <p role="alert" className="m-0 text-sm font-bold text-bad">Couldn't load the journal: {loadError}</p>
          : loadedMonth !== first ? <p className="m-0 text-sm text-muted">Loading journal…</p>
            : <JournalEditor key={selected} userId={userId} date={selected} today={today} entry={journal.find((e) => e.entry_date === selected)}
                allTags={tags} onSaved={onSaved} onTagCreated={onTagCreated} compact />}
      </section>
    </div>
  )
}
