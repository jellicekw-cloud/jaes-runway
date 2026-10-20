import { useState, type FormEvent, type ReactNode } from 'react'
import { DAYS, dateOf, daysBetween, money, shortDate } from '../lib/dates'
import { parseMoney } from '../lib/money'
import { timeLabel } from '../lib/plans'
import { SWATCHES } from '../lib/types'
import {
  FLIGHT_STATUS_LABEL, KIND_LABEL, PASS_LABEL, STARTER_PACKING, STATUS_LABEL,
  activeTrip, addPacking, addPerson, bumpToBackup, createTrip, defaultItemDate, deletePacking, deleteItem, deleteTrip, itemsOn, nextTrip,
  passportProblem, personName, saveItem, setFlightStatus, setPassport, setTraveler, togglePacking, tripCost, tripDayNumber, updateTrip,
  type Backup, type ItemFields, type ItemKind, type PassType, type Trip, type TripItem, type TripStatus, type TripsData,
} from '../lib/trips'
import { BedIcon, CarIcon, ChevronIcon, FoodIcon, GlobeIcon, PinIcon, PlaneIcon, RoadIcon, SuitcaseIcon, TicketIcon } from './icons'

type Reload = () => Promise<void>

const errText = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
const dayName = (k: string) => `${DAYS[dateOf(k).getDay()].slice(0, 3)}, ${shortDate(k)}`

// ---------------------------------------------------------------------------
// Small pieces shared by the Trips tab, day panels and phone Home
// ---------------------------------------------------------------------------

export function ItemIcon({ kind, size = 20 }: { kind: ItemKind; size?: number }) {
  const Icon = kind === 'flight' ? PlaneIcon : kind === 'hotel' ? BedIcon : kind === 'car' ? CarIcon : kind === 'drive' ? RoadIcon : kind === 'food' ? FoodIcon : kind === 'event' ? TicketIcon : PinIcon
  return <Icon size={size} />
}

export function Who({ data, ids, small }: { data: TripsData; ids: string[]; small?: boolean }) {
  if (!ids.length) return null
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex">
        {ids.map((id, i) => {
          const p = data.people.find((x) => x.id === id)
          return (
            <span key={id} title={p?.name} aria-hidden="true"
              className={`${small ? 'size-5 text-[10px]' : 'size-6 text-xs'} rounded-full grid place-items-center font-extrabold text-white border-2 border-surface ${i ? '-ml-1.5' : ''}`}
              style={{ background: p?.color ?? 'var(--muted)' }}>{(p?.name ?? '?').charAt(0)}</span>
          )
        })}
      </span>
      <span className={`${small ? 'text-xs' : 'text-sm'} text-muted`}>{ids.map((id) => personName(data, id)).join(', ')}</span>
    </span>
  )
}

function Chip({ tone = 'soft', children }: { tone?: 'soft' | 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const cls = tone === 'ok' ? 'bg-pay-soft text-pay-ink' : tone === 'warn' ? 'bg-warn-soft text-warn' : tone === 'bad' ? 'bg-bad/15 text-bad' : 'bg-accent-soft text-fg'
  return <span className={`inline-flex items-center h-6 px-2 rounded-full text-xs font-bold ${cls}`}>{children}</span>
}

function flightTone(i: TripItem): 'ok' | 'warn' | 'bad' {
  return i.flight_status === 'missed' ? 'bad' : i.flight_status === 'listed' ? 'warn' : 'ok'
}

/** One itinerary line: icon, what, when, details. Flights show pass type, status, who, and (when listed standby) the clear/bump buttons. */
export function ItemCard({ item, part = 'start', data, reload, actions = true, onEdit }: {
  trip: Trip; item: TripItem; part?: 'start' | 'end'; data: TripsData; reload?: Reload; actions?: boolean; onEdit?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const date = part === 'end' ? item.end_date! : item.item_date
  const time = part === 'end' ? item.end_time : item.item_time
  const title = part === 'end'
    ? (item.kind === 'hotel' ? `Check out · ${item.title}` : `Return · ${item.title}`)
    : item.kind === 'flight'
      ? [item.origin && item.destination ? `${item.origin} → ${item.destination}` : item.title, item.flight_number].filter(Boolean).join(' · ')
      : item.kind === 'hotel' ? `Check in · ${item.title}` : item.kind === 'car' ? `Pick up · ${item.title}` : item.title
  const sub = [dayName(date), timeLabel(time)].filter(Boolean).join(' · ')
  const extra = [
    item.kind === 'flight' ? item.airline : null,
    part === 'start' ? item.details : null,
    item.kind === 'hotel' && part === 'start' && item.end_date ? `${daysBetween(item.item_date, item.end_date)} night${daysBetween(item.item_date, item.end_date) === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ')

  async function act(fn: () => Promise<unknown>, done?: (r: unknown) => string) {
    if (!reload) return
    setBusy(true); setMsg('')
    try { const r = await fn(); await reload(); if (done) setMsg(done(r)) } catch (e) { setMsg(errText(e)) }
    setBusy(false)
  }

  const standbyOpen = item.kind === 'flight' && item.pass_type === 'standby' && (item.flight_status === 'listed' || item.flight_status === 'missed')

  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5">
      <span className="size-10 rounded-xl bg-accent-soft text-accent grid place-items-center"><ItemIcon kind={item.kind} /></span>
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-start gap-2">
          <b className="flex-1 min-w-0 leading-snug">{title}</b>
          {onEdit && part === 'start' && (
            <button type="button" onClick={onEdit} aria-label={`Edit ${item.title}`}
              className="h-8 px-2.5 rounded-lg border border-line bg-surface text-fg text-xs font-bold cursor-pointer shrink-0">Edit</button>
          )}
        </div>
        <span className="text-sm text-muted">{sub}{extra ? ` · ${extra}` : ''}</span>
        {item.confirmation && part === 'start' && <span className="text-sm">Confirmation <b className="tnum tracking-wide">{item.confirmation}</b></span>}
        {item.cost !== null && part === 'start' && (
          <span className="text-sm text-muted">{money(item.cost)}{item.cost_due_on ? ` · pay ${item.cost_due_on === item.item_date ? 'at check-in' : `on ${shortDate(item.cost_due_on)}`}` : ''}</span>
        )}
        {item.kind === 'flight' && part === 'start' && (
          <>
            <span className="flex flex-wrap gap-1.5 mt-0.5">
              {item.pass_type && <Chip>{PASS_LABEL[item.pass_type]}</Chip>}
              {item.flight_status && <Chip tone={flightTone(item)}>{FLIGHT_STATUS_LABEL[item.flight_status]}</Chip>}
            </span>
            <Who data={data} ids={item.people} small />
            {item.pass_type === 'standby' && item.alternates.length > 0 && (
              <span className="text-xs text-muted">Backups: {item.alternates.map((a) => [timeLabel(a.time), a.flight].filter(Boolean).join(' ')).join(' · ')}</span>
            )}
            {actions && reload && standbyOpen && (
              <span className="flex flex-wrap gap-1.5 mt-1">
                <button type="button" disabled={busy} onClick={() => void act(() => setFlightStatus(item.id, 'cleared'), () => 'Cleared! Have a good flight.')}
                  className="h-9 px-3 rounded-lg border-0 bg-pay text-white text-sm font-bold cursor-pointer disabled:opacity-60">Made it on</button>
                {item.flight_status === 'listed' && (
                  <button type="button" disabled={busy}
                    onClick={() => void act(() => bumpToBackup(item), (r) => (r ? `Listed on the ${[timeLabel((r as Backup).time), (r as Backup).flight].filter(Boolean).join(' ')} flight.` : 'No backups left. Marked as didn\'t clear.'))}
                    className="h-9 px-3 rounded-lg border border-line bg-surface text-fg text-sm font-bold cursor-pointer disabled:opacity-60">
                    {item.alternates.length ? `Didn't clear → ${[timeLabel(item.alternates[0].time), item.alternates[0].flight].filter(Boolean).join(' ')}` : 'Didn\'t clear'}
                  </button>
                )}
              </span>
            )}
            {actions && reload && item.flight_status === 'cleared' && item.pass_type === 'standby' && (
              <button type="button" disabled={busy} onClick={() => void act(() => setFlightStatus(item.id, 'listed'))}
                className="self-start h-8 px-2.5 rounded-lg border border-line bg-surface text-muted text-xs font-bold cursor-pointer">Undo cleared</button>
            )}
          </>
        )}
        {msg && <span role="status" className="text-sm font-bold text-accent">{msg}</span>}
      </div>
    </div>
  )
}

/** For a day panel: the trip you're on that day, plus anything scheduled. */
export function DayTrips({ date, data, reload, onOpenTrip }: { date: string; data: TripsData; reload: Reload; onOpenTrip: (id: string) => void }) {
  const items = itemsOn(data, date)
  const on = data.trips.filter((t) => t.start_date && t.end_date && t.start_date <= date && date <= t.end_date && t.status !== 'idea')
  if (!items.length && !on.length) return null
  const tripIds = [...new Set([...on.map((t) => t.id), ...items.map((x) => x.trip.id)])]
  return (
    <div className="flex flex-col gap-2">
      {tripIds.map((id) => {
        const t = data.trips.find((x) => x.id === id)!
        const n = tripDayNumber(t, date)
        return (
          <div key={id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-widest uppercase text-muted flex-1 min-w-0 truncate">
                ✈ {t.name}{n && n.day >= 1 && n.day <= n.of ? ` · day ${n.day} of ${n.of}` : ''}
              </span>
              <button type="button" onClick={() => onOpenTrip(id)} className="bg-transparent border-0 text-accent text-sm font-bold underline cursor-pointer">Open trip</button>
            </div>
            {items.filter((x) => x.trip.id === id).map((x) => (
              <ItemCard key={`${x.item.id}:${x.part}`} trip={t} item={x.item} part={x.part} data={data} reload={reload} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** Phone Home: next trip with its flight, hotel and car (from your drawing). */
export function TravelCard({ today, data, onOpenTrip, onPlan }: { today: string; data: TripsData; onOpenTrip: (id: string) => void; onPlan: () => void }) {
  const t = nextTrip(data, today)
  if (!t) {
    return (
      <section aria-label="Travel plans" className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-3">
        <span className="size-10 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0"><PlaneIcon size={20} /></span>
        <span className="flex-1 text-muted">No trips coming up.</span>
        <button type="button" onClick={onPlan} className="h-10 px-3.5 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">Plan a trip</button>
      </section>
    )
  }
  const first = (k: ItemKind) => t.items.find((i) => i.kind === k)
  const legs = (['flight', 'hotel', 'car'] as ItemKind[]).map(first).filter((i): i is TripItem => Boolean(i))
  const days = daysBetween(today, t.start_date!)
  return (
    <section aria-label="Travel plans" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-muted">Travel plans</h2>
        <span className="text-sm font-bold text-accent">{days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : 'now'}</span>
      </div>
      <button type="button" onClick={() => onOpenTrip(t.id)} className="flex flex-col gap-1 border-0 bg-transparent p-0 text-left text-fg cursor-pointer">
        <b className="text-xl">{t.name}</b>
        <span className="text-sm text-muted">{shortDate(t.start_date!)} – {shortDate(t.end_date!)}{t.destination ? ` · ${t.destination}` : ''}</span>
      </button>
      <Who data={data} ids={t.people} small />
      {legs.length === 0 && <p className="m-0 text-sm text-muted">Add flights, a hotel or a car on the Trips tab.</p>}
      {legs.map((i) => <ItemCard key={i.id} trip={t} item={i} data={data} actions={false} />)}
    </section>
  )
}

/** Phone Home while you're away: today's part of the trip goes to the top. */
export function TripModeCard({ today, data, reload, onOpenTrip }: { today: string; data: TripsData; reload: Reload; onOpenTrip: (id: string) => void }) {
  const t = activeTrip(data, today)
  if (!t) return null
  const n = tripDayNumber(t, today)
  const items = itemsOn(data, today).filter((x) => x.trip.id === t.id)
  return (
    <section aria-label="On your trip" className="rounded-2xl border-2 border-accent-hi bg-accent-soft p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-accent">On your trip{n ? ` · day ${n.day} of ${n.of}` : ''}</h2>
        <button type="button" onClick={() => onOpenTrip(t.id)} className="bg-transparent border-0 text-accent text-sm font-bold underline cursor-pointer">Open trip</button>
      </div>
      <b className="text-xl">Today in {t.name}</b>
      {items.length === 0 && <p className="m-0 text-sm text-muted">Nothing booked today. Enjoy it.</p>}
      {items.map((x) => <ItemCard key={`${x.item.id}:${x.part}`} trip={t} item={x.item} part={x.part} data={data} reload={reload} />)}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Trips tab
// ---------------------------------------------------------------------------

export default function TripsView({ today, data, loaded, error, reload, openId, onOpen }: {
  today: string; data: TripsData; loaded: boolean; error: string; reload: Reload; openId: string | null; onOpen: (id: string | null) => void
}) {
  const [creating, setCreating] = useState(false)
  if (!loaded) return <main className="flex-1 safe-x py-5 text-muted">Loading…</main>
  const open = openId ? data.trips.find((t) => t.id === openId) : undefined
  if (open) return <TripDetail trip={open} today={today} data={data} reload={reload} onBack={() => onOpen(null)} />

  const upcoming = data.trips.filter((t) => t.start_date && t.end_date && t.end_date >= today && t.status !== 'done')
  const ideas = data.trips.filter((t) => !t.start_date || !t.end_date)
  const past = data.trips.filter((t) => t.end_date && (t.end_date < today || t.status === 'done') && t.start_date).reverse()

  return (
    <main className="flex-1 safe-x py-5 flex flex-col gap-6 w-full max-w-[1000px] mx-auto">
      {error && <p role="alert" className="m-0 rounded-xl border border-bad bg-bad/10 px-4 py-3 font-bold text-bad">Couldn't load trips: {error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-3xl font-bold">Trips</h1>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">+ New trip</button>
        )}
      </div>
      {creating && <NewTrip data={data} today={today} reload={reload} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); onOpen(id) }} />}
      <TripGroup title="Upcoming" trips={upcoming} today={today} data={data} onOpen={onOpen} empty="No trips planned yet. Tap + New trip to start one." />
      <TripGroup title="Ideas" trips={ideas} today={today} data={data} onOpen={onOpen} empty="Somewhere you want to go someday? Make a trip with no dates." />
      {past.length > 0 && <TripGroup title="Past trips" trips={past} today={today} data={data} onOpen={onOpen} empty="" />}
    </main>
  )
}

function TripGroup({ title, trips, today, data, onOpen, empty }: { title: string; trips: Trip[]; today: string; data: TripsData; onOpen: (id: string) => void; empty: string }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 text-sm font-bold tracking-widest uppercase text-muted">{title}</h2>
      {trips.length === 0 && <p className="m-0 text-muted">{empty}</p>}
      {trips.map((t) => {
        const flies = t.items.some((i) => i.kind === 'flight')
        const days = t.start_date ? daysBetween(today, t.start_date) : null
        return (
          <button key={t.id} type="button" onClick={() => onOpen(t.id)}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left text-fg cursor-pointer hover:border-accent-hi">
            <span className="size-11 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0">
              {flies ? <PlaneIcon size={22} /> : t.is_international ? <GlobeIcon size={22} /> : <CarIcon size={22} />}
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-1">
              <b className="text-lg truncate">{t.name}</b>
              <span className="text-sm text-muted">
                {t.start_date && t.end_date ? `${shortDate(t.start_date)} – ${shortDate(t.end_date)}` : 'No dates yet'}
                {days !== null && days > 0 && t.status !== 'done' ? ` · in ${days} days` : days !== null && days <= 0 && t.end_date && t.end_date >= today ? ' · happening now' : ''}
                {t.destination ? ` · ${t.destination}` : ''}
              </span>
              <Who data={data} ids={t.people} small />
            </span>
            <StatusPill s={t.status} />
          </button>
        )
      })}
    </section>
  )
}

function StatusPill({ s }: { s: TripStatus }) {
  const cls = s === 'booked' ? 'bg-pay-soft text-pay-ink' : s === 'planning' ? 'bg-warn-soft text-warn' : s === 'idea' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tracking-wide uppercase ${cls}`}>{STATUS_LABEL[s]}</span>
}

const inputCls = 'h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg min-w-0 w-full focus:outline-2 focus:outline-accent-hi'
const labelCls = 'text-xs font-bold tracking-wider uppercase text-muted'

function Labeled({ id, label, children, className = '' }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={id} className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}

function PeoplePicker({ data, value, onToggle, label = 'Who\'s going' }: { data: TripsData; value: string[]; onToggle: (id: string, on: boolean) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {data.people.map((p) => {
          const on = value.includes(p.id)
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => onToggle(p.id, !on)}
              className={`h-10 pl-1.5 pr-3 inline-flex items-center gap-2 rounded-full border font-bold cursor-pointer ${on ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>
              <span className="size-7 rounded-full grid place-items-center text-xs text-white" style={{ background: p.color }}>{p.name.charAt(0)}</span>
              {p.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NewTrip({ data, today, reload, onCancel, onCreated }: { data: TripsData; today: string; reload: Reload; onCancel: () => void; onCreated: (id: string) => void }) {
  const me = data.people.find((p) => p.is_self)?.id
  const [name, setName] = useState('')
  const [dest, setDest] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [intl, setIntl] = useState(false)
  const [people, setPeople] = useState<string[]>(me ? [me] : [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Give the trip a name.'); return }
    if (start && end && end < start) { setError('The trip ends before it starts.'); return }
    setBusy(true); setError('')
    try {
      const id = await createTrip({ name: name.trim(), destination: dest.trim() || null, start_date: start || null, end_date: end || start || null, is_international: intl, people })
      await reload()
      onCreated(id)
    } catch (err) { setError(errText(err)); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-2xl border border-dashed border-muted bg-surface p-4">
      <b className="text-lg">New trip</b>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Labeled id="nt-name" label="Trip name"><input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Orleans, Savannah road trip" className={inputCls} autoComplete="off" /></Labeled>
        <Labeled id="nt-dest" label="Where"><input id="nt-dest" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="City, state or country" className={inputCls} autoComplete="off" /></Labeled>
        <Labeled id="nt-start" label="Leave"><input id="nt-start" type="date" min={today > start && start ? undefined : undefined} value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value) }} className={inputCls} /></Labeled>
        <Labeled id="nt-end" label="Come back"><input id="nt-end" type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Labeled>
      </div>
      <p className="m-0 text-sm text-muted">No dates yet? Leave them blank and it's saved as an idea.</p>
      <PeoplePicker data={data} value={people} onToggle={(id, on) => setPeople(on ? [...people, id] : people.filter((x) => x !== id))} />
      <label className="inline-flex items-center gap-2.5 font-bold">
        <input type="checkbox" checked={intl} onChange={(e) => setIntl(e.target.checked)} className="size-5 accent-[var(--accent)]" />
        International (adds passport checks)
      </label>
      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="h-11 px-5 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer disabled:opacity-60">{busy ? 'Saving…' : 'Create trip'}</button>
        <button type="button" onClick={onCancel} className="h-11 px-4 rounded-xl border border-line bg-transparent text-fg font-bold cursor-pointer">Cancel</button>
      </div>
    </form>
  )
}

/** A field that saves when you leave it. */
function BlurField({ id, label, value, type = 'text', onCommit, placeholder, money: isMoney }: {
  id: string; label: string; value: string | null; type?: 'text' | 'date'; onCommit: (v: string) => void; placeholder?: string; money?: boolean
}) {
  const initial = value ?? ''
  const [v, setV] = useState(initial)
  const [last, setLast] = useState(initial)
  if (initial !== last) { setLast(initial); setV(initial) }
  return (
    <Labeled id={id} label={label}>
      <span className={`flex items-center ${inputCls} px-0`}>
        {isMoney && <span className="pl-3 text-muted">$</span>}
        <input id={id} type={type} value={v} placeholder={placeholder} inputMode={isMoney ? 'decimal' : undefined}
          onChange={(e) => { setV(e.target.value); if (type === 'date' && e.target.value !== initial) onCommit(e.target.value) }}
          onBlur={() => { if (type !== 'date' && v !== initial) onCommit(v) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="h-full flex-1 min-w-0 border-0 bg-transparent px-3 text-fg focus:outline-none" />
      </span>
    </Labeled>
  )
}

function TripDetail({ trip: t, today, data, reload, onBack }: { trip: Trip; today: string; data: TripsData; reload: Reload; onBack: () => void }) {
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try { await fn(); await reload() } catch (e) { setError(errText(e)) }
  }

  const days: string[] = []
  if (t.start_date && t.end_date) for (let k = t.start_date; k <= t.end_date; k = addDay(k)) days.push(k)
  const outside = t.items.filter((i) => !days.includes(i.item_date))
  const cost = tripCost(t)
  const until = t.start_date ? daysBetween(today, t.start_date) : null

  return (
    <main className="flex-1 safe-x py-5 flex flex-col gap-5 w-full max-w-[1000px] mx-auto">
      <button type="button" onClick={onBack} className="self-start h-10 inline-flex items-center gap-1 pl-1 pr-3 rounded-xl border-0 bg-transparent text-accent font-bold cursor-pointer">
        <ChevronIcon dir="left" /> All trips
      </button>

      {error && <p role="alert" className="m-0 rounded-xl border border-bad bg-bad/10 px-4 py-3 font-bold text-bad">Couldn't save that: {error}</p>}

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-3xl font-bold flex-1 min-w-0">{t.name}</h1>
          {until !== null && until > 0 && t.status !== 'done' && <span className="text-accent font-bold">in {until} days</span>}
        </div>
        <div role="group" aria-label="Trip status" className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
          {(['idea', 'planning', 'booked', 'done'] as TripStatus[]).map((s) => (
            <button key={s} type="button" aria-pressed={t.status === s} onClick={() => void run(() => updateTrip(t.id, { status: s }))}
              className={`h-9 rounded-lg border-0 text-sm font-bold cursor-pointer ${t.status === s ? 'bg-accent text-accent-ink' : 'bg-transparent text-muted'}`}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BlurField id="td-name" label="Trip name" value={t.name} onCommit={(v) => { if (v.trim()) void run(() => updateTrip(t.id, { name: v.trim() })) }} />
          <BlurField id="td-dest" label="Where" value={t.destination} onCommit={(v) => void run(() => updateTrip(t.id, { destination: v.trim() || null }))} />
          <BlurField id="td-start" label="Leave" type="date" value={t.start_date}
            onCommit={(v) => void run(() => updateTrip(t.id, { start_date: v || null, end_date: v && (!t.end_date || t.end_date < v) ? v : t.end_date, status: v && t.status === 'idea' ? 'planning' : t.status }))} />
          <BlurField id="td-end" label="Come back" type="date" value={t.end_date}
            onCommit={(v) => { if (!v || !t.start_date || v >= t.start_date) void run(() => updateTrip(t.id, { end_date: v || null })); else setError('The trip ends before it starts.') }} />
        </div>
        <PeoplePicker data={data} value={t.people} onToggle={(id, on) => void run(() => setTraveler(t.id, id, on))} />
        <AddPerson data={data} run={run} />
        <label className="inline-flex items-center gap-2.5 font-bold">
          <input type="checkbox" checked={t.is_international} onChange={(e) => void run(() => updateTrip(t.id, { is_international: e.target.checked }))} className="size-5 accent-[var(--accent)]" />
          International (adds passport checks)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <BlurField id="td-budget" label="Budget" money value={t.budget === null ? null : t.budget.toFixed(2)} placeholder="0.00"
            onCommit={(v) => void run(() => updateTrip(t.id, { budget: parseMoney(v) }))} />
          <p className="m-0 pb-2.5 text-sm">
            Planned costs <b className="tnum">{money(cost)}</b>
            {t.budget !== null && <span className={cost > t.budget ? 'text-bad font-bold' : 'text-muted'}> · {cost > t.budget ? `${money(cost - t.budget)} over` : `${money(t.budget - cost)} left`}</span>}
          </p>
        </div>
      </section>

      {t.is_international && <Passports trip={t} data={data} run={run} />}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-2xl font-bold">Itinerary</h2>
          {!adding && <button type="button" onClick={() => { setAdding(true); setEditing(null) }} className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">+ Add to itinerary</button>}
        </div>
        {adding && <ItemForm trip={t} data={data} today={today} reload={reload} onDone={() => setAdding(false)} />}
        {!t.start_date && t.items.length === 0 && !adding && <p className="m-0 text-muted">Still an idea. Add dates above when you're ready, then flights, a hotel and plans.</p>}
        {t.start_date && t.items.length === 0 && !adding && <p className="m-0 text-muted">Nothing booked yet. Add your flights, hotel, car or a drive.</p>}
        {[...days, ...(outside.length ? ['outside'] : [])].map((k, idx) => {
          const list = k === 'outside' ? outside.map((i) => ({ item: i, part: 'start' as const })) : itemsOn({ people: data.people, trips: [t] }, k).map((x) => ({ item: x.item, part: x.part }))
          if (!list.length) return null
          return (
            <div key={k} className="flex flex-col gap-2">
              <span className="text-xs font-extrabold tracking-widest uppercase text-accent pt-1">
                {k === 'outside' ? 'Outside the trip dates' : `Day ${idx + 1} · ${DAYS[dateOf(k).getDay()]}, ${shortDate(k)}`}
              </span>
              {list.map(({ item, part }) => (
                editing === item.id && part === 'start'
                  ? <ItemForm key={item.id} trip={t} data={data} today={today} reload={reload} initial={item} onDone={() => setEditing(null)} />
                  : <ItemCard key={`${item.id}:${part}`} trip={t} item={item} part={part} data={data} reload={reload} onEdit={() => { setEditing(item.id); setAdding(false) }} />
              ))}
            </div>
          )
        })}
      </section>

      <Packing trip={t} run={run} />

      <BlurField id="td-notes" label="Notes" value={t.notes} placeholder="Anything else to remember" onCommit={(v) => void run(() => updateTrip(t.id, { notes: v.trim() || null }))} />

      <div className="pt-2">
        <button type="button" onBlur={() => setArmed(false)} onClick={() => (armed ? void run(async () => { await deleteTrip(t.id); onBack() }) : setArmed(true))}
          className={`h-10 px-4 rounded-xl font-bold cursor-pointer ${armed ? 'bg-bad text-white border border-bad' : 'bg-transparent border border-line text-muted'}`}>
          {armed ? 'Tap again to delete this trip' : 'Delete trip'}
        </button>
      </div>
    </main>
  )
}

function addDay(k: string): string {
  const d = dateOf(k); d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function AddPerson({ data, run }: { data: TripsData; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="self-start bg-transparent border-0 p-0 text-accent text-sm font-bold underline cursor-pointer">+ Add someone else</button>
  return (
    <form className="flex gap-2" onSubmit={(e) => {
      e.preventDefault()
      if (!name.trim()) return
      const color = SWATCHES[data.people.length % SWATCHES.length].hex
      void run(() => addPerson(name.trim(), color, data.people.length + 1)).then(() => { setName(''); setOpen(false) })
    }}>
      <label htmlFor="ap-name" className="sr-only">Name</label>
      <input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus className={inputCls} />
      <button type="submit" className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">Add</button>
    </form>
  )
}

function Passports({ trip: t, data, run }: { trip: Trip; data: TripsData; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const people = t.people.map((id) => data.people.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2"><GlobeIcon /><h2 className="m-0 text-xl font-bold">Passports</h2></div>
      <p className="m-0 text-sm text-muted">Only the expiration date is saved, never the passport number. Many countries want 6 months left after you come home, and kids' passports only last 5 years.</p>
      {people.length === 0 && <p className="m-0 text-sm text-muted">Pick who's going above.</p>}
      {people.map((p) => {
        const prob = passportProblem(p, t)
        return (
          <div key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line pt-2.5">
            <span className="size-8 rounded-full grid place-items-center text-sm font-extrabold text-white shrink-0" style={{ background: p.color }}>{p.name.charAt(0)}</span>
            <span className="flex-1 min-w-32">
              <b className="block">{p.name}</b>
              <span className={`block text-sm ${prob && prob !== 'missing' ? 'text-bad font-bold' : 'text-muted'}`}>
                {prob === 'missing' ? 'Expiration not entered' : prob === 'expired' ? 'Expires before you come home. Renew it.' : prob === 'too-soon' ? 'Less than 6 months left after the trip. Renew it.' : `Good through ${shortDate(p.passport_expires!)}, ${p.passport_expires!.slice(0, 4)}`}
              </span>
            </span>
            <label htmlFor={`pp-${p.id}`} className="sr-only">{p.name}'s passport expiration</label>
            <input id={`pp-${p.id}`} type="date" value={p.passport_expires ?? ''} onChange={(e) => void run(() => setPassport(p.id, e.target.value || null))}
              className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
          </div>
        )
      })}
    </section>
  )
}

function Packing({ trip: t, run }: { trip: Trip; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [text, setText] = useState('')
  const done = t.packing.filter((p) => p.packed).length
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <SuitcaseIcon size={22} />
        <h2 className="m-0 text-xl font-bold flex-1">Packing</h2>
        {t.packing.length > 0 && <span className="font-bold tnum text-muted">{done} of {t.packing.length}</span>}
      </div>
      {t.packing.length === 0 && (
        <button type="button" onClick={() => void run(() => addPacking(t.id, STARTER_PACKING, 0))}
          className="self-start h-10 px-3.5 rounded-xl border border-line bg-surface-2 text-fg font-bold cursor-pointer">Start with my usual list</button>
      )}
      {t.packing.map((p) => (
        <div key={p.id} className="flex items-center gap-3 min-h-11">
          <input id={`pk-${p.id}`} type="checkbox" checked={p.packed} onChange={() => void run(() => togglePacking(p))} className="size-5 accent-[var(--accent)]" />
          <label htmlFor={`pk-${p.id}`} className={`flex-1 ${p.packed ? 'line-through text-muted' : ''}`}>{p.text}</label>
          <button type="button" aria-label={`Remove ${p.text}`} onClick={() => void run(() => deletePacking(p.id))}
            className="h-8 px-2 rounded-lg border border-line bg-transparent text-muted text-xs font-bold cursor-pointer">✕</button>
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v) void run(() => addPacking(t.id, [v], t.packing.length + 1)).then(() => setText('')) }}>
        <label htmlFor={`pk-add-${t.id}`} className="sr-only">Add to packing list</label>
        <input id={`pk-add-${t.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add something to pack…" autoComplete="off"
          className="flex-1 min-w-0 h-11 rounded-xl border border-dashed border-muted bg-surface-2 px-3 text-fg focus:outline-none focus:border-solid focus:border-accent-hi" />
        <button type="submit" className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">Add</button>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Add / edit an itinerary item
// ---------------------------------------------------------------------------

const KINDS: ItemKind[] = ['flight', 'hotel', 'car', 'drive', 'food', 'event']

function ItemForm({ trip: t, data, today, reload, initial, onDone }: {
  trip: Trip; data: TripsData; today: string; reload: Reload; initial?: TripItem; onDone: () => void
}) {
  const hhmm = (x: string | null | undefined) => (x ? x.slice(0, 5) : '')
  const [kind, setKind] = useState<ItemKind>(initial?.kind ?? 'flight')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.item_date ?? defaultItemDate(t, today))
  const [time, setTime] = useState(hhmm(initial?.item_time))
  const [endDate, setEndDate] = useState(initial?.end_date ?? t.end_date ?? '')
  const [endTime, setEndTime] = useState(hhmm(initial?.end_time) || (initial ? '' : ''))
  const [details, setDetails] = useState(initial?.details ?? '')
  const [conf, setConf] = useState(initial?.confirmation ?? '')
  const [cost, setCost] = useState(initial?.cost != null ? initial.cost.toFixed(2) : '')
  const [payLater, setPayLater] = useState(Boolean(initial?.cost_due_on && initial.cost_due_on !== initial.item_date))
  const [airline, setAirline] = useState(initial?.airline ?? 'Delta')
  const [flightNo, setFlightNo] = useState(initial?.flight_number ?? '')
  const [origin, setOrigin] = useState(initial?.origin ?? '')
  const [dest, setDest] = useState(initial?.destination ?? '')
  const [pass, setPass] = useState<PassType>(initial?.pass_type ?? 'standby')
  const [backups, setBackups] = useState<Backup[]>(initial?.alternates?.length ? initial.alternates.map((b) => ({ time: hhmm(b.time), flight: b.flight })) : [])
  const [people, setPeople] = useState<string[]>(initial?.people ?? t.people)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [armed, setArmed] = useState(false)

  const spans = kind === 'hotel' || kind === 'car'
  const id = initial?.id ?? 'new'

  async function submit(e: FormEvent) {
    e.preventDefault()
    const name = kind === 'flight' ? (title.trim() || [origin.trim().toUpperCase(), dest.trim().toUpperCase()].filter(Boolean).join(' → ') || 'Flight') : title.trim()
    if (!name) { setError(kind === 'hotel' ? 'Enter the hotel name.' : kind === 'car' ? 'Enter the rental company.' : 'Give it a name.'); return }
    if (!date) { setError('Pick a date.'); return }
    if (spans && endDate && endDate < date) { setError('The end date is before the start.'); return }
    const c = parseMoney(cost)
    const fields: ItemFields = {
      kind, title: name, item_date: date, item_time: time || null,
      end_date: spans ? (endDate || null) : null, end_time: spans ? (endTime || null) : null,
      details: details.trim() || null, confirmation: conf.trim().toUpperCase() || null,
      cost: c, cost_due_on: c === null ? null : kind === 'hotel' && payLater && endDate ? endDate : date,
      airline: kind === 'flight' ? airline.trim() || null : null,
      flight_number: kind === 'flight' ? flightNo.trim().toUpperCase() || null : null,
      origin: kind === 'flight' ? origin.trim().toUpperCase() || null : null,
      destination: kind === 'flight' ? dest.trim().toUpperCase() || null : null,
      pass_type: kind === 'flight' ? pass : null,
      flight_status: kind === 'flight' ? (initial?.kind === 'flight' && initial.pass_type === pass ? initial.flight_status : pass === 'standby' ? 'listed' : 'confirmed') : null,
      alternates: kind === 'flight' && pass === 'standby' ? backups.filter((b) => b.time || b.flight.trim()).map((b) => ({ time: b.time || null, flight: b.flight.trim().toUpperCase() })) : [],
    }
    setBusy(true); setError('')
    try { await saveItem(t.id, fields, kind === 'flight' ? people : [], initial?.id); await reload(); onDone() } catch (err) { setError(errText(err)); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-2xl border border-accent-hi bg-surface p-4">
      <b className="text-lg">{initial ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : 'Add to itinerary'}</b>
      {!initial && (
        <div role="group" aria-label="What kind" className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
              className={`min-h-16 flex flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold cursor-pointer ${kind === k ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>
              <ItemIcon kind={k} size={22} />{KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      {kind === 'flight' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Labeled id={`if-from-${id}`} label="From"><input id={`if-from-${id}`} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="ATL" maxLength={4} className={`${inputCls} uppercase`} autoComplete="off" /></Labeled>
            <Labeled id={`if-to-${id}`} label="To"><input id={`if-to-${id}`} value={dest} onChange={(e) => setDest(e.target.value)} placeholder="MSY" maxLength={4} className={`${inputCls} uppercase`} autoComplete="off" /></Labeled>
            <Labeled id={`if-air-${id}`} label="Airline"><input id={`if-air-${id}`} value={airline} onChange={(e) => setAirline(e.target.value)} className={inputCls} autoComplete="off" /></Labeled>
            <Labeled id={`if-no-${id}`} label="Flight #"><input id={`if-no-${id}`} value={flightNo} onChange={(e) => setFlightNo(e.target.value)} placeholder="DL 1234" className={`${inputCls} uppercase`} autoComplete="off" /></Labeled>
            <Labeled id={`if-date-${id}`} label="Date"><input id={`if-date-${id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Labeled>
            <Labeled id={`if-time-${id}`} label="Departs (local)"><input id={`if-time-${id}`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Labeled>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>How you're flying</span>
            <div role="group" aria-label="How you're flying" className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {(['standby', 'award', 'ticket'] as PassType[]).map((p) => (
                <button key={p} type="button" aria-pressed={pass === p} onClick={() => setPass(p)}
                  className={`h-11 rounded-xl border font-bold cursor-pointer ${pass === p ? 'bg-accent border-accent text-accent-ink' : 'bg-surface-2 border-line text-fg'}`}>{PASS_LABEL[p]}</button>
              ))}
            </div>
          </div>
          {pass === 'standby' && (
            <div className="flex flex-col gap-2">
              <span className={labelCls}>Backup flights</span>
              {backups.map((b, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <label htmlFor={`bk-t-${id}-${i}`} className="sr-only">Backup {i + 1} departs</label>
                  <input id={`bk-t-${id}-${i}`} type="time" value={b.time ?? ''} onChange={(e) => setBackups(backups.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} className={inputCls} />
                  <label htmlFor={`bk-f-${id}-${i}`} className="sr-only">Backup {i + 1} flight number</label>
                  <input id={`bk-f-${id}-${i}`} value={b.flight} placeholder="Flight #" onChange={(e) => setBackups(backups.map((x, j) => (j === i ? { ...x, flight: e.target.value } : x)))} className={`${inputCls} uppercase`} autoComplete="off" />
                  <button type="button" aria-label={`Remove backup ${i + 1}`} onClick={() => setBackups(backups.filter((_, j) => j !== i))}
                    className="h-11 px-3 rounded-xl border border-line bg-transparent text-muted font-bold cursor-pointer">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setBackups([...backups, { time: '', flight: '' }])}
                className="self-start bg-transparent border-0 p-0 text-accent text-sm font-bold underline cursor-pointer">+ Add a backup flight</button>
            </div>
          )}
          <PeoplePicker data={{ people: data.people.filter((p) => t.people.includes(p.id) || people.includes(p.id)), trips: [] }} value={people}
            onToggle={(pid, on) => setPeople(on ? [...people, pid] : people.filter((x) => x !== pid))} label="Who's on this flight" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Labeled id={`if-conf-${id}`} label={pass === 'award' ? 'Confirmation / certificate #' : 'Confirmation'}><input id={`if-conf-${id}`} value={conf} onChange={(e) => setConf(e.target.value)} className={`${inputCls} uppercase`} autoComplete="off" /></Labeled>
            <Labeled id={`if-cost-${id}`} label="Cost (fees, taxes)"><input id={`if-cost-${id}`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="$0.00" className={inputCls} /></Labeled>
          </div>
        </>
      ) : (
        <>
          <Labeled id={`if-title-${id}`} label={kind === 'hotel' ? 'Hotel' : kind === 'car' ? 'Rental company' : kind === 'drive' ? 'Drive' : kind === 'food' ? 'Restaurant' : 'What'}>
            <input id={`if-title-${id}`} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" className={inputCls}
              placeholder={kind === 'hotel' ? 'Hotel name' : kind === 'car' ? 'e.g. Enterprise' : kind === 'drive' ? 'e.g. Drive ATL → Savannah' : kind === 'food' ? 'Where you\'re eating' : 'e.g. Trolley tour'} />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled id={`if-date-${id}`} label={kind === 'hotel' ? 'Check in' : kind === 'car' ? 'Pick up' : 'Date'}><input id={`if-date-${id}`} type="date" value={date} onChange={(e) => { setDate(e.target.value); if (spans && (!endDate || endDate < e.target.value)) setEndDate(e.target.value) }} className={inputCls} /></Labeled>
            <Labeled id={`if-time-${id}`} label="Time"><input id={`if-time-${id}`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Labeled>
            {spans && <Labeled id={`if-end-${id}`} label={kind === 'hotel' ? 'Check out' : 'Return'}><input id={`if-end-${id}`} type="date" min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} /></Labeled>}
            {spans && <Labeled id={`if-endt-${id}`} label="Time"><input id={`if-endt-${id}`} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} /></Labeled>}
          </div>
          <Labeled id={`if-det-${id}`} label={kind === 'car' ? 'Where to pick up' : kind === 'drive' ? 'Notes (distance, stops)' : 'Details'}>
            <input id={`if-det-${id}`} value={details} onChange={(e) => setDetails(e.target.value)} autoComplete="off" className={inputCls}
              placeholder={kind === 'car' ? 'e.g. MSY airport' : kind === 'drive' ? 'e.g. About 4 hours, stop for gas' : kind === 'food' ? 'e.g. Party of 2' : 'Address or notes'} />
          </Labeled>
          {kind !== 'drive' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Labeled id={`if-conf-${id}`} label="Confirmation"><input id={`if-conf-${id}`} value={conf} onChange={(e) => setConf(e.target.value)} className={`${inputCls} uppercase`} autoComplete="off" /></Labeled>
              <Labeled id={`if-cost-${id}`} label="Cost"><input id={`if-cost-${id}`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="$0.00" className={inputCls} /></Labeled>
            </div>
          )}
          {kind === 'hotel' && (
            <label className="inline-flex items-center gap-2.5 font-bold">
              <input type="checkbox" checked={payLater} onChange={(e) => setPayLater(e.target.checked)} className="size-5 accent-[var(--accent)]" />
              Pay at the hotel at checkout (not prepaid)
            </label>
          )}
        </>
      )}

      {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="h-11 px-5 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer disabled:opacity-60">{busy ? 'Saving…' : initial ? 'Save changes' : 'Add'}</button>
        <button type="button" onClick={onDone} className="h-11 px-4 rounded-xl border border-line bg-transparent text-fg font-bold cursor-pointer">Cancel</button>
        {initial && (
          <button type="button" onBlur={() => setArmed(false)}
            onClick={() => (armed ? void deleteItem(initial.id).then(reload).then(onDone).catch((e) => setError(errText(e))) : setArmed(true))}
            className={`ml-auto h-11 px-4 rounded-xl font-bold cursor-pointer ${armed ? 'bg-bad text-white border border-bad' : 'bg-transparent border border-line text-muted'}`}>
            {armed ? 'Tap again to delete' : 'Delete'}
          </button>
        )}
      </div>
    </form>
  )
}
