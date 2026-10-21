import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MONTHS, money } from '../lib/dates'
import {
  HEADS_UP_DAYS, KIND_ICON, KIND_WORD, comingUp, datesOn, deleteSpecialDate, fetchGiftIdeas, giftToTodo, giftsMakeSense, headline,
  monthDayLabel, saveSpecialDate, shopLink, upcoming, whenText,
  type DateKind, type GiftIdea, type SpecialDate, type Upcoming,
} from '../lib/specialDates'

type Reload = () => Promise<void>

const inputCls = 'h-10 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi'
const btn = 'h-10 px-4 rounded-xl font-bold cursor-pointer'
const btnMain = `${btn} border-0 bg-accent text-accent-ink`
const btnPlain = `${btn} border border-line bg-surface text-fg`
const heading = 'm-0 text-xs font-bold tracking-widest uppercase text-muted'

// ---------------------------------------------------------------------------
// Calendar pieces
// ---------------------------------------------------------------------------

/** Rows for the open day (under the week / month). */
export function DayDates({ date, list }: { date: string; list: SpecialDate[] }) {
  const on = datesOn(list, date)
  if (on.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      {on.map((d) => (
        <div key={d.id} className="flex items-center gap-2 rounded-xl bg-cel-soft text-cel-ink px-3 py-2 font-bold">
          <span aria-hidden="true">{KIND_ICON[d.kind]}</span>
          <span className="truncate">{headline(d, date)}</span>
        </div>
      ))}
    </div>
  )
}

/** Phone Home: a card the week before, otherwise one slim row to get to your dates. */
export function DatesHomeCard({ list, today, onOpen }: { list: SpecialDate[]; today: string; onOpen: () => void }) {
  const soon = comingUp(list, today)
  if (soon.length > 0) {
    return (
      <button type="button" onClick={onOpen}
        className="w-full rounded-2xl border-2 border-cel bg-cel-soft p-4 flex flex-col gap-1.5 text-left text-fg cursor-pointer">
        <span className="flex items-center justify-between w-full">
          <span className="text-xs font-bold tracking-widest uppercase text-cel-ink">Coming up this week</span>
          <span className="text-sm font-bold text-cel-ink underline">Gift ideas</span>
        </span>
        {soon.map((u) => (
          <span key={u.d.id} className="flex items-center gap-2 w-full min-w-0">
            <span aria-hidden="true" className="text-lg">{KIND_ICON[u.d.kind]}</span>
            <b className="flex-1 min-w-0 truncate">{headline(u.d, u.date)}</b>
            <span className="text-sm font-bold text-cel-ink whitespace-nowrap">{whenText(u)}</span>
          </span>
        ))}
      </button>
    )
  }
  const next = upcoming(list, today)[0]
  return (
    <button type="button" onClick={onOpen}
      className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 flex items-center gap-2 text-left text-fg cursor-pointer">
      <span aria-hidden="true">🎂</span>
      <span className="flex-1 min-w-0 truncate font-bold">
        {next ? <>Next: {headline(next.d, next.date)} <span className="font-normal text-muted">· {whenText(next)}</span></> : 'Add birthdays and anniversaries'}
      </span>
      <span aria-hidden="true" className="text-muted">›</span>
    </button>
  )
}

/** Desktop header pill. */
export function DatesPill({ list, today, onOpen }: { list: SpecialDate[]; today: string; onOpen: () => void }) {
  const soon = comingUp(list, today)
  const first = soon[0]
  return (
    <button type="button" onClick={onOpen}
      className={`inline-flex items-center gap-1.5 rounded-full py-1.5 px-3 font-bold text-sm border-0 cursor-pointer ${first ? 'bg-cel-soft text-cel-ink' : 'bg-header-2 text-header-muted hover:text-white'}`}>
      <span aria-hidden="true">{first ? KIND_ICON[first.d.kind] : '🎂'}</span>
      {first ? `${headline(first.d, first.date)} · ${whenText(first)}${soon.length > 1 ? ` +${soon.length - 1}` : ''}` : 'Dates'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Gift ideas
// ---------------------------------------------------------------------------

function GiftIdeas({ u, today, reload, reloadPlans, onToast }: { u: Upcoming; today: string; reload: Reload; reloadPlans: Reload; onToast: (m: string) => void }) {
  const [ideas, setIdeas] = useState<GiftIdea[]>(u.d.gift_ideas)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState<string[]>([])

  async function load() {
    setBusy(true); setError('')
    try { setIdeas(await fetchGiftIdeas(u.d.id)); await reload() } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t get ideas') }
    setBusy(false)
  }
  async function keep(g: GiftIdea) {
    try {
      await giftToTodo(u, g, today)
      setAdded((a) => [...a, g.title])
      onToast(`Added to your to-dos: ${g.title}`)
      await reloadPlans()
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t add it') }
  }

  return (
    <div className="flex flex-col gap-2">
      {ideas.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
          {ideas.map((g) => (
            <li key={g.title} className="rounded-xl border border-line bg-surface-2 p-2.5 flex flex-col gap-1">
              <span className="flex items-baseline gap-2">
                <b className="flex-1 min-w-0">{g.title}</b>
                <span className="text-sm font-bold text-pay-ink tnum whitespace-nowrap">~{money(g.price).replace('.00', '')}</span>
              </span>
              {g.why && <span className="text-sm text-muted">{g.why}</span>}
              <span className="flex gap-3 text-sm font-bold">
                <a href={shopLink(g)} target="_blank" rel="noreferrer" className="text-accent">Find it</a>
                {added.includes(g.title)
                  ? <span className="text-pay-ink">✓ On your to-dos</span>
                  : <button type="button" onClick={() => void keep(g)} className="bg-transparent border-0 p-0 text-accent font-bold cursor-pointer">I'll get this</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void load()} className={`${btnPlain} self-start`}>
        {busy ? 'Thinking…' : ideas.length ? 'Different ideas' : `Gift ideas under $40`}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------

function DateForm({ initial, suggestions, onDone, reload }: {
  initial?: SpecialDate; suggestions: string[]; onDone: () => void; reload: Reload
}) {
  const [kind, setKind] = useState<DateKind>(initial?.kind ?? 'birthday')
  const [name, setName] = useState(initial?.name ?? '')
  const [month, setMonth] = useState(initial?.month ?? 0)
  const [day, setDay] = useState(initial?.day ?? 0)
  const [year, setYear] = useState(initial?.year ? String(initial.year) : '')
  const [likes, setLikes] = useState(initial?.likes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sure, setSure] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const maxDay = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31
  const thisYear = new Date().getFullYear()

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) { setError(kind === 'anniversary' ? 'Name it, like "Thor & me".' : 'Add a name.'); nameRef.current?.focus(); return }
    if (!month || !day) { setError('Pick the month and day.'); return }
    const y = year.trim() ? Number(year) : null
    if (y !== null && (!Number.isInteger(y) || y < 1900 || y > thisYear)) { setError(`The year should be between 1900 and ${thisYear}, or left blank.`); return }
    setBusy(true); setError('')
    try {
      await saveSpecialDate({ kind, name, month, day: Math.min(day, maxDay), year: y, likes: kind === 'memorial' ? null : likes }, initial?.id)
      await reload()
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t save'); setBusy(false) }
  }

  async function remove() {
    if (!initial) return
    setBusy(true)
    try { await deleteSpecialDate(initial.id); await reload(); onDone() } catch (e) { setError(e instanceof Error ? e.message : 'Couldn\'t delete'); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-3.5 flex flex-col gap-3">
      <div role="radiogroup" aria-label="Kind of date" className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
        {(['birthday', 'anniversary', 'memorial', 'other'] as DateKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={`h-9 rounded-lg border-0 text-sm font-bold cursor-pointer ${kind === k ? 'bg-accent text-accent-ink' : 'bg-transparent text-muted'}`}>
            {KIND_WORD[k]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold tracking-wider uppercase text-muted">{kind === 'birthday' ? 'Whose birthday' : kind === 'anniversary' ? 'Whose anniversary' : 'Name'}</span>
        <input ref={nameRef} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
          placeholder={kind === 'anniversary' ? 'Thor & me' : kind === 'memorial' ? 'Grandma' : 'Chicken'} />
      </label>
      {!initial && kind === 'birthday' && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((n) => (
            <button key={n} type="button" onClick={() => setName(n)}
              className={`h-8 px-3 rounded-full border text-sm font-bold cursor-pointer ${name === n ? 'bg-accent text-accent-ink border-accent' : 'bg-surface-2 text-fg border-line'}`}>{n}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted">Month</span>
          <select className={inputCls} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            <option value={0}>Month…</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted">Day</span>
          <select className={inputCls} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            <option value={0}>Day…</option>
            {Array.from({ length: maxDay }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted">Year</span>
          <input className={inputCls} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="optional" />
        </label>
      </div>
      <p className="m-0 -mt-1 text-xs text-muted">{kind === 'birthday' ? 'Add the year to see how old they turn.' : 'Add the year to see how many years it\'s been.'}</p>
      {kind !== 'memorial' && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted">What they're into (for gift ideas)</span>
          <input className={inputCls} value={likes} onChange={(e) => setLikes(e.target.value)} placeholder="Braves, candles, coffee, Roblox…" />
        </label>
      )}
      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={btnMain}>{busy ? 'Saving…' : initial ? 'Save' : 'Add'}</button>
        <button type="button" onClick={onDone} className={btnPlain}>Cancel</button>
        {initial && (sure
          ? <button type="button" disabled={busy} onClick={() => void remove()} className={`${btn} ml-auto border-0 bg-bad text-white`}>Delete it</button>
          : <button type="button" onClick={() => setSure(true)} className={`${btn} ml-auto border border-line bg-transparent text-bad`}>Delete</button>)}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function DatesPanel({ open, onClose, isPhone, today, list, reload, reloadPlans, peopleNames, onToast }: {
  open: boolean; onClose: () => void; isPhone: boolean; today: string; list: SpecialDate[]; reload: Reload; reloadPlans: Reload
  peopleNames: string[]; onToast: (m: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) { el.showModal(); setAdding(list.length === 0); setEditing(null) }
    if (!open && el.open) el.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const soon = comingUp(list, today)
  const all = upcoming(list, today)
  const haveBirthday = new Set(list.filter((d) => d.kind === 'birthday').map((d) => d.name.trim().toLowerCase()))
  const suggestions = peopleNames.filter((n) => !haveBirthday.has(n.toLowerCase()))

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="dates-title"
      className={`p-0 text-fg bg-bg border-line backdrop:bg-black/50 ${isPhone ? 'm-0 w-full max-w-full h-dvh max-h-dvh border-0' : 'm-0 ms-auto h-dvh max-h-dvh w-[480px] max-w-full border-l'}`}>
      <div className="sticky top-0 z-10 bg-header text-white px-4 py-3 flex items-center gap-3" style={{ paddingTop: isPhone ? 'max(12px, env(safe-area-inset-top, 0px))' : undefined }}>
        <h2 id="dates-title" className="m-0 flex-1 text-2xl font-bold">Birthdays & dates</h2>
        <button type="button" onClick={onClose} aria-label="Close birthdays"
          className="size-10 rounded-full border border-header-2 bg-transparent text-white grid place-items-center cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="p-4 flex flex-col gap-5" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
        <section aria-label="Coming up this week" className="flex flex-col gap-2.5">
          <h3 className={heading}>Coming up · next {HEADS_UP_DAYS} days</h3>
          {soon.length === 0 && <p className="m-0 text-sm text-muted">Nothing this week.</p>}
          {soon.map((u) => (
            <article key={u.d.id} className="rounded-2xl border-2 border-cel bg-surface p-3.5 flex flex-col gap-2">
              <div className="flex items-start gap-2.5">
                <span aria-hidden="true" className="text-2xl leading-8">{KIND_ICON[u.d.kind]}</span>
                <div className="flex-1 min-w-0">
                  <b className="block text-lg leading-snug">{headline(u.d, u.date)}</b>
                  <span className="block text-sm font-bold text-cel-ink">{u.days === 0 ? 'Today!' : u.days === 1 ? 'Tomorrow' : `${whenText(u)}, ${monthDayLabel(u.d)}`}</span>
                  {u.d.likes && <span className="block text-sm text-muted">Into: {u.d.likes}</span>}
                </div>
              </div>
              {giftsMakeSense(u.d) && <GiftIdeas key={u.d.id + (u.d.gift_ideas_at ?? '')} u={u} today={today} reload={reload} reloadPlans={reloadPlans} onToast={onToast} />}
            </article>
          ))}
        </section>

        <section aria-label="All dates" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className={heading}>All dates · {list.length}</h3>
            {!adding && <button type="button" onClick={() => { setAdding(true); setEditing(null) }} className={btnMain}>+ Add</button>}
          </div>
          {adding && <DateForm suggestions={suggestions} reload={reload} onDone={() => setAdding(false)} />}
          {all.length === 0 && !adding && <p className="m-0 text-sm text-muted">No dates yet.</p>}
          {all.length > 0 && (
            <ul className="m-0 p-0 list-none rounded-2xl border border-line bg-surface px-3">
              {all.map((u) => (
                <li key={u.d.id} className="py-2 border-t border-line first:border-t-0">
                  {editing === u.d.id ? (
                    <DateForm initial={u.d} suggestions={[]} reload={reload} onDone={() => setEditing(null)} />
                  ) : (
                    <button type="button" onClick={() => { setEditing(u.d.id); setAdding(false) }} aria-label={`Edit ${u.d.name}`}
                      className="w-full flex items-center gap-2.5 bg-transparent border-0 p-0 text-left text-fg cursor-pointer min-w-0">
                      <span aria-hidden="true" className="text-lg">{KIND_ICON[u.d.kind]}</span>
                      <span className="flex-1 min-w-0">
                        <b className="block truncate">{headline(u.d, u.date)}</b>
                        <span className="block text-sm text-muted">{monthDayLabel(u.d)}{u.d.year ? `, ${u.d.year}` : ''}</span>
                      </span>
                      <span className={`text-sm font-bold whitespace-nowrap ${u.days <= HEADS_UP_DAYS ? 'text-cel-ink' : 'text-muted'}`}>{whenText(u)}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </dialog>
  )
}
