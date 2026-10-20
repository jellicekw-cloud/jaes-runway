import { useState, type FormEvent } from 'react'
import { shortDate } from '../lib/dates'
import {
  REPEAT_LABEL, addTodo, anytimeTodos, deleteEvent, deleteTodo, eventsOn, timeLabel, todosOn, toggleTodo,
  type CalEvent, type Plans, type Todo,
} from '../lib/plans'

type Reload = () => Promise<void>

/** One to-do with a checkbox. Late ones (past due, not done) are orange. */
export function TodoRow({ t, today, plans, reload }: { t: Todo; today: string; plans: Plans; reload: Reload }) {
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const late = !t.done_at && t.due_date !== null && t.due_date < today
  const done = Boolean(t.done_at)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); await reload() } finally { setBusy(false) }
  }

  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 min-h-12 ${late ? 'border-warn bg-warn-soft' : 'border-line bg-surface'}`}>
      <button type="button" aria-pressed={done} disabled={busy} onClick={() => void run(() => toggleTodo(plans, t))}
        aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${t.text}`}
        className={`relative size-7 shrink-0 rounded-lg border-2 grid place-items-center cursor-pointer p-0 after:absolute after:-inset-2 after:content-[''] ${done ? 'bg-accent border-accent text-accent-ink' : 'bg-transparent border-accent'}`}>
        {done && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}
      </button>
      <span className="flex-1 min-w-0">
        <b className={`block truncate ${done ? 'line-through text-muted' : ''}`}>{t.text}</b>
        <span className={`block text-xs ${late ? 'text-warn font-bold' : 'text-muted'}`}>
          {late ? `Late · was due ${shortDate(t.due_date!)}` : t.due_date ? `To-do · ${shortDate(t.due_date)}` : 'To-do'}
          {t.repeat !== 'none' ? ` · ↻ ${REPEAT_LABEL[t.repeat].toLowerCase()}` : ''}
        </span>
      </span>
      <button type="button" onBlur={() => setArmed(false)} disabled={busy}
        onClick={() => (armed ? void run(() => deleteTodo(t.id)) : setArmed(true))}
        aria-label={armed ? `Confirm delete ${t.text}` : `Delete ${t.text}`}
        className={`h-8 px-2 rounded-lg text-xs font-bold cursor-pointer ${armed ? 'bg-bad text-white border border-bad' : 'bg-transparent border border-line text-muted'}`}>
        {armed ? 'Delete?' : '✕'}
      </button>
    </div>
  )
}

function EventRow({ e, reload }: { e: CalEvent; reload: Reload }) {
  const [armed, setArmed] = useState(false)
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 min-h-12">
      <span className="size-2.5 rounded-full shrink-0 bg-accent-hi" />
      <span className="flex-1 min-w-0">
        <b className="block truncate">{e.title}</b>
        <span className="block text-xs text-muted">{[timeLabel(e.start_time) || 'Any time', e.location].filter(Boolean).join(' · ')}</span>
      </span>
      <button type="button" onBlur={() => setArmed(false)}
        onClick={() => (armed ? void deleteEvent(e.id).then(reload) : setArmed(true))}
        aria-label={armed ? `Confirm delete ${e.title}` : `Delete ${e.title}`}
        className={`h-8 px-2 rounded-lg text-xs font-bold cursor-pointer ${armed ? 'bg-bad text-white border border-bad' : 'bg-transparent border border-line text-muted'}`}>
        {armed ? 'Delete?' : '✕'}
      </button>
    </div>
  )
}

/** A day's events and to-dos, with a quick "add a to-do for this day" box. */
export function DayPlans({ date, today, plans, reload, showAdd = true }: { date: string; today: string; plans: Plans; reload: Reload; showAdd?: boolean }) {
  const events = eventsOn(plans, date)
  const todos = todosOn(plans, date, today)
  if (!showAdd && events.length === 0 && todos.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {(events.length > 0 || todos.length > 0 || showAdd) && <span className="text-xs font-bold tracking-widest uppercase text-muted">Plans &amp; to-dos</span>}
      {events.map((e) => <EventRow key={e.id} e={e} reload={reload} />)}
      {todos.map((t) => <TodoRow key={t.id} t={t} today={today} plans={plans} reload={reload} />)}
      {showAdd && <QuickAdd placeholder={`Add a to-do for ${date === today ? 'today' : shortDate(date)}…`} due={date} reload={reload} id={`qa-${date}`} />}
    </div>
  )
}

/** Card of to-dos with no date, plus a quick-add box. */
export function AnytimeTodos({ today, plans, reload }: { today: string; plans: Plans; reload: Reload }) {
  const list = anytimeTodos(plans, today)
  const open = plans.todos.filter((t) => !t.done_at).length
  return (
    <section aria-label="To-do" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-muted">To-do · anytime</h2>
        <span className="text-sm font-bold text-muted">{open} open</span>
      </div>
      {list.length === 0 && <p className="m-0 text-sm text-muted">Nothing without a date. Dated to-dos show on their day.</p>}
      {list.map((t) => <TodoRow key={t.id} t={t} today={today} plans={plans} reload={reload} />)}
      <QuickAdd placeholder="Add a to-do…" due={null} reload={reload} id="qa-anytime" />
    </section>
  )
}

function QuickAdd({ placeholder, due, reload, id }: { placeholder: string; due: string | null; reload: Reload; id: string }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = text.trim()
    if (!v) return
    try { await addTodo({ text: v, due_date: due, repeat: 'none' }); setText(''); setError(''); await reload() } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\'t add that')
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex gap-1.5">
        <label htmlFor={id} className="sr-only">{placeholder}</label>
        <input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoComplete="off"
          className="flex-1 min-w-0 h-11 rounded-xl border border-dashed border-muted bg-surface-2 px-3 text-fg focus:outline-none focus:border-solid focus:border-accent-hi" />
        <button type="submit" className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">Add</button>
      </div>
      {error && <span role="alert" className="text-sm font-bold text-bad">{error}</span>}
    </form>
  )
}
