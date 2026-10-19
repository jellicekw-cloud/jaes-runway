import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DAYS, MONTHS, addDays, dateOf, money, shortDate, weekStart } from '../lib/dates'
import { loadEntries, loadTags } from '../lib/journal'
import { isPayday, obligationsOn, paycheckTotal, type MoneyData, type Obligation } from '../lib/money'
import { MOOD_EMOJI, type JournalEntry, type Tag, type Todo } from '../lib/types'
import JournalEditor from './JournalEditor'
import DayBills from './DayBills'

interface Props {
  email: string
  userId: string
  today: string
  selected: string
  onSelect: (date: string) => void
  money: MoneyData
  moneyLoaded: boolean
  reloadMoney: () => Promise<void>
}

/** The week: seven day cards, then the selected day opened below (bills + journal). */
export default function WeekView({ email, userId, today, selected, onSelect, money: m, moneyLoaded, reloadMoney }: Props) {
  const start = weekStart(selected, 1)
  const end = addDays(start, 6)

  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [entries, allTags, todoRes] = await Promise.all([
        loadEntries(start, end),
        loadTags(),
        supabase.from('todos').select('id, text, due_date, done_at, repeat').lte('due_date', end),
      ])
      if (todoRes.error) throw todoRes.error
      setJournal(entries)
      setTags(allTags)
      setTodos((todoRes.data ?? []) as Todo[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
    setLoading(false)
  }, [start, end])

  useEffect(() => { void load() }, [load])

  const onSaved = useCallback((date: string, entry: JournalEntry | null) => {
    setJournal((list) => {
      const rest = list.filter((e) => e.entry_date !== date)
      return entry ? [...rest, entry] : rest
    })
  }, [])
  const onTagCreated = useCallback((tag: Tag) => setTags((list) => [...list, tag].sort((a, b) => a.name.localeCompare(b.name))), [])

  const payTotal = paycheckTotal(m)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  return (
    <main className="flex-1 safe-x py-5 flex flex-col gap-4 w-full max-w-[1480px] mx-auto">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="m-0 text-2xl font-bold">Week of {shortDate(start)}</h1>
        {loading || !moneyLoaded ? (
          <span className="text-sm text-muted">Loading…</span>
        ) : error ? (
          <span role="alert" className="text-sm font-bold text-bad">
            Couldn't load your week: {error}{' '}
            <button type="button" onClick={() => void load()} className="ml-1 underline bg-transparent border-0 text-bad font-bold cursor-pointer">Try again</button>
          </span>
        ) : (
          <span className="text-sm font-bold text-pay-ink bg-pay-soft rounded-full px-3 py-0.5">
            ✓ Connected as {email} · {m.cards.length} cards · {m.subs.length} subscriptions{payTotal ? ` · ${money(payTotal)} per paycheck` : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
        {days.map((k) => {
          const d = dateOf(k)
          const entry = journal.find((j) => j.entry_date === k)
          const pay = isPayday(m, k)
          const due = obligationsOn(m, k, today)
          const dayTodos = todos.filter((t) => t.due_date === k || (k === today && !t.done_at && t.due_date !== null && t.due_date < today))
          const isToday = k === today
          const isSel = k === selected
          const border = isSel ? 'border-2 border-accent-hi ring-3 ring-accent-hi/30 bg-accent-soft' : isToday ? 'border-2 border-accent-hi bg-surface' : pay ? 'border border-pay bg-surface' : 'border border-line bg-surface'
          return (
            <button key={k} type="button" onClick={() => onSelect(k)} aria-pressed={isSel}
              aria-label={`${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${pay ? ', payday' : ''}${due.length ? `, ${due.length} due` : ''}${entry?.body ? ', has journal entry' : ''}. Open this day`}
              className={`flex flex-col items-stretch gap-1.5 rounded-2xl p-3 min-h-40 lg:min-h-80 min-w-0 text-left text-fg cursor-pointer hover:border-accent-hi ${border}`}>
              <span className="flex items-center justify-between">
                <span className="text-sm font-bold tracking-widest uppercase text-muted">{DAYS[d.getDay()].slice(0, 3)}</span>
                <span className="text-2xl leading-none">{entry?.mood ? MOOD_EMOJI[entry.mood] : ''}</span>
              </span>
              <span className={`text-3xl font-bold leading-none tnum mb-1 ${isToday ? 'text-accent' : ''}`}>{d.getDate()}</span>

              {pay && (
                <span className="self-start rounded-full bg-pay text-white text-xs font-bold px-2.5 py-0.5">
                  $ Payday{payTotal ? ` · ${money(payTotal)}` : ''}
                </span>
              )}

              {due.map((o) => <Chip key={o.key} o={o} />)}

              {dayTodos.map((t) => (
                <span key={t.id} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold min-w-0 ${t.due_date && t.due_date < today && !t.done_at ? 'bg-warn-soft text-warn' : 'bg-accent-soft'}`}>
                  <span aria-hidden="true">{t.done_at ? '☑' : '☐'}</span>
                  <span className={`truncate ${t.done_at ? 'line-through' : ''}`}>{t.text}</span>
                </span>
              ))}

              {entry && entry.tags.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {entry.tags.map((t) => <span key={t.id} className="text-xs font-bold text-accent">#{t.name}</span>)}
                </span>
              )}

              <span className={`mt-auto border-t border-dashed border-line pt-2 text-sm leading-snug whitespace-pre-line line-clamp-6 ${entry?.body ? '' : 'text-muted italic'}`}>
                {entry?.body ? entry.body : 'Nothing written'}
              </span>
            </button>
          )
        })}
      </div>

      {!loading && !error && moneyLoaded && (
        <JournalEditor
          key={selected}
          userId={userId}
          date={selected}
          today={today}
          entry={journal.find((j) => j.entry_date === selected)}
          allTags={tags}
          onSaved={onSaved}
          onTagCreated={onTagCreated}
          side={<DayBills date={selected} today={today} money={m} reloadMoney={reloadMoney} />}
        />
      )}
    </main>
  )
}

function Chip({ o }: { o: Obligation }) {
  if (o.kind === 'sub') {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2 py-1 text-xs text-muted min-w-0">
        <span aria-hidden="true">↻</span>
        <span className="truncate">{o.short}</span>
        <span className="ml-auto tnum font-bold">{money(o.amount)}</span>
      </span>
    )
  }
  const tone = o.status === 'overdue' ? 'bg-bad text-white border-bad' : o.status === 'soon' ? 'bg-warn-soft border-warn' : 'bg-surface-2 border-line'
  return (
    <span className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold min-w-0 ${tone}`}>
      <span className="size-2.5 rounded-full shrink-0" style={{ background: o.color }} />
      <span className={`truncate ${o.status === 'paid' ? 'line-through text-muted' : ''}`}>{o.short}</span>
      {o.status === 'paid'
        ? <span className="ml-auto text-pay-ink" aria-label="paid">✓</span>
        : o.amount !== null ? <span className="ml-auto tnum">{money(o.amount)}</span> : null}
    </span>
  )
}
