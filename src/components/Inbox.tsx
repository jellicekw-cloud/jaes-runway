import { useEffect, useRef, useState, type ReactNode } from 'react'
import { money, shortDate } from '../lib/dates'
import { INCOME_KIND_LABEL, installmentAmount, type IncomeKind, type MoneyData } from '../lib/money'
import { timeLabel } from '../lib/plans'
import { KIND_LABEL, PASS_LABEL, type ItemKind, type PassType, type TripsData } from '../lib/trips'
import {
  ORDER_STATUS_LABEL, RETURN_STAGE_LABEL, addFromEmail, applyRefund, defaultPayWith, markDroppedOff, moneyInDefaults, openReturns, payWithLabel, handled, markDelivered,
  needsFixing, notSure, onTheWay, packageTone, packagesOn, pasteEmail, recentRefunds, refundOptions, refundToFromOrder, refundToLabel, removeOrder, removeReturn,
  rereadEmail, returnLine, returnTone, saveReturn, setEmailStatus, statusLine, stillReading, toReview, waitingCount,
  type AfterpayInfo, type AppointmentInfo, type MoneyInInfo, type CardKind, type InboxData, type InboxEmail, type Order, type OrderInfo, type OrderStatus,
  type ReturnInfo, type ReturnRec, type ReturnStage, type Suggestion, type TripItemInfo,
} from '../lib/inbox'

type Reload = () => Promise<void>

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const inputCls = 'h-10 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi'
const btn = 'h-10 px-4 rounded-xl font-bold cursor-pointer'
const btnMain = `${btn} border-0 bg-accent text-accent-ink`
const btnPlain = `${btn} border border-line bg-surface text-fg`
const heading = 'm-0 text-xs font-bold tracking-widest uppercase text-muted'

function F({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-[11px] font-bold tracking-wider uppercase text-muted">{label}</span>
      {children}
    </label>
  )
}

const KIND_ICON: Record<string, string> = { order: '📦', shipping: '📦', afterpay: '💳', afterpay_payment: '💳', appointment: '🩺', trip: '✈', money_in: '💵', return: '↩️', gmail_confirm: '✉', other: '✉' }
const KIND_NAME: Record<CardKind, string> = { order: 'Order', afterpay: 'Afterpay', appointment: 'Appointment', trip: 'Trip item', money_in: 'Money in', return: 'Return' }

const blankOrder = (store: string | null = null): OrderInfo => ({
  store, order_number: null, items: null, total: null, ordered_on: null, status: 'ordered', carrier: null, tracking_number: null,
  expected_on: null, delivered_on: null, delivered_time: null, paid_with_afterpay: false,
})
const blankAfterpay = (store: string | null = null): AfterpayInfo => ({ store, total: null, purchased_on: null, first_payment_on: null, order_number: null })
const blankAppt = (title: string | null = null): AppointmentInfo => ({ title, date: null, start_time: null, end_time: null, location: null, notes: null })
const blankTrip = (title: string | null = null): TripItemInfo => ({
  trip_id: null, kind: null, title, date: null, time: null, end_date: null, end_time: null, confirmation: null, airline: null,
  flight_number: null, origin: null, destination: null, details: null, cost: null,
})

const blankReturn = (store: string | null = null): ReturnInfo => ({
  stage: 'started', store, order_number: null, items: null, amount: null, date: null, drop_off_by: null, refund_method: null,
})

const toNum = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ''))
  return v.trim() && Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
const orNull = (v: string) => (v.trim() ? v : null)

function apLine(total: number | null | undefined, purchased: string | null | undefined, first: string | null | undefined): string {
  if (!total) return 'Afterpay · add the total'
  const each = money(installmentAmount({ total, installments: 4 }, 1))
  const firstText = !first || (purchased && first <= purchased) ? '1st paid at checkout' : `1st payment ${shortDate(first)}`
  return `Afterpay · 4 × ${each} · ${firstText}`
}

function sender(e: InboxEmail) {
  return e.from_name || e.from_address || (e.source === 'paste' ? 'Pasted email' : 'Email')
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

const TONE_TEXT = { done: 'text-pay-ink', late: 'text-bad', delayed: 'text-warn', go: 'text-pkg-ink' } as const

export function OrderRow({ o, today, reload, compact, onReturn }: { o: Order; today: string; reload: Reload; compact?: boolean; onReturn?: (o: Order) => void }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const tone = packageTone(o, today)
  async function run(f: () => Promise<void>) {
    setBusy(true)
    try { await f(); await reload() } catch { /* row stays; next reload shows the truth */ }
    setBusy(false)
  }
  return (
    <div className="flex items-center gap-2.5 py-2 border-t border-line first:border-t-0 min-w-0">
      <span aria-hidden="true" className="text-lg shrink-0">{tone === 'done' ? '✅' : '📦'}</span>
      <span className="flex-1 min-w-0">
        <b className="block truncate">{o.store}{o.items ? <span className="font-normal text-muted"> · {o.items}</span> : null}</b>
        <span className={`block text-sm font-bold ${TONE_TEXT[tone]}`}>{statusLine(o, today)}</span>
        {!compact && o.tracking_number && <span className="block text-xs text-muted truncate">Tracking {o.carrier ? `${o.carrier} ` : ''}{o.tracking_number}</span>}
      </span>
      {o.status !== 'delivered' && (
        <button type="button" disabled={busy} onClick={() => void run(() => markDelivered(o, today))}
          className="h-9 px-3 rounded-lg border border-pkg bg-surface text-pkg-ink text-sm font-bold cursor-pointer shrink-0">Got it</button>
      )}
      {!compact && onReturn && o.status === 'delivered' && (
        <button type="button" onClick={() => onReturn(o)}
          className="h-9 px-3 rounded-lg border border-line bg-surface text-fg text-sm font-bold cursor-pointer shrink-0">Return</button>
      )}
      {!compact && (
        confirm
          ? <button type="button" disabled={busy} onClick={() => void run(() => removeOrder(o.id))}
              className="h-9 px-3 rounded-lg border-0 bg-bad text-white text-sm font-bold cursor-pointer shrink-0">Remove?</button>
          : <button type="button" aria-label={`Remove ${o.store}`} onClick={() => setConfirm(true)}
              className="size-9 rounded-lg border border-line bg-transparent text-muted cursor-pointer shrink-0">×</button>
      )}
    </div>
  )
}

/** Phone Home: only on days something is coming (or came, or got delayed). */
export function ArrivingToday({ orders, today, reload, onOpen }: { orders: Order[]; today: string; reload: Reload; onOpen: () => void }) {
  const list = packagesOn(orders, today, today)
  if (list.length === 0) return null
  return (
    <section aria-label="Arriving today" className="rounded-2xl border-2 border-pkg bg-pkg-soft p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-pkg-ink">📦 Arriving today · {list.length}</h2>
        <button type="button" onClick={onOpen} className="bg-transparent border-0 text-pkg-ink text-sm font-bold underline cursor-pointer">All packages</button>
      </div>
      {list.map((o) => <OrderRow key={o.id} o={o} today={today} reload={reload} compact />)}
    </section>
  )
}

/** Phone Home: the way into the Inbox. Hidden when there's nothing to review and nothing coming. */
export function InboxHomeCard({ data, today, onOpen }: { data: InboxData; today: string; onOpen: () => void }) {
  const waiting = waitingCount(data)
  const coming = onTheWay(data.orders, today).filter((o) => o.status !== 'delivered').length
  if (waiting > 0) {
    const kinds = [...toReview(data), ...notSure(data)].map((e) => (e.status === 'review' ? (e.kind === 'gmail_confirm' ? 'Gmail code' : KIND_NAME[e.kind as CardKind] ?? 'Email') : 'not sure'))
    const uniq = [...new Set(kinds)].join(', ')
    return (
      <button type="button" onClick={onOpen}
        className="w-full rounded-2xl border-2 border-accent-hi bg-surface p-4 flex items-center gap-3 text-left text-fg cursor-pointer">
        <span aria-hidden="true" className="text-2xl">✉</span>
        <span className="flex-1 min-w-0">
          <b className="block text-lg">Inbox</b>
          <span className="block text-sm text-muted truncate">{uniq}</span>
        </span>
        <span className="rounded-full bg-accent text-accent-ink px-3 py-1 text-sm font-bold whitespace-nowrap">{waiting} to review</span>
      </button>
    )
  }
  if (coming > 0) {
    return (
      <button type="button" onClick={onOpen}
        className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 flex items-center gap-2 text-left text-fg cursor-pointer">
        <span aria-hidden="true">📦</span>
        <span className="flex-1 font-bold">{coming} package{coming === 1 ? '' : 's'} on the way</span>
        <span aria-hidden="true" className="text-muted">›</span>
      </button>
    )
  }
  return null
}

/** Packages on a calendar day (the open day under the week, or the day under the month). */
export function DayPackages({ date, today, orders, reload }: { date: string; today: string; orders: Order[]; reload: Reload }) {
  const list = packagesOn(orders, date, today)
  if (list.length === 0) return null
  return (
    <div className="rounded-xl border border-pkg/50 bg-pkg-soft/60 px-3">
      {list.map((o) => <OrderRow key={o.id} o={o} today={today} reload={reload} compact />)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One email waiting for you
// ---------------------------------------------------------------------------

function initialKind(e: InboxEmail): CardKind | null {
  if (e.kind === 'order' || e.kind === 'shipping') return e.suggestion.order ? 'order' : null
  if (e.kind === 'afterpay') return e.suggestion.afterpay ? 'afterpay' : null
  if (e.kind === 'appointment') return e.suggestion.appointment ? 'appointment' : null
  if (e.kind === 'trip') return e.suggestion.trip_item ? 'trip' : null
  if (e.kind === 'money_in') return e.suggestion.money_in ? 'money_in' : null
  if (e.kind === 'return') return e.suggestion.ret ? 'return' : null
  return null
}

function withDefaults(kind: CardKind, s: Suggestion, e: InboxEmail, m: MoneyData): Suggestion {
  const who = e.from_name ?? null
  if (kind === 'money_in') {
    const base = { amount: null, from: who, received_on: null, via: null, is_paycheck: false, account_hint: null }
    return { ...s, money_in: moneyInDefaults({ ...base, ...(s.money_in ?? {}) }, m) }
  }
  if (kind === 'order') {
    const order = { ...blankOrder(who), ...(s.order ?? {}) }
    const afterpay = order.paid_with_afterpay || s.afterpay ? { ...blankAfterpay(order.store), ...(s.afterpay ?? {}) } : s.afterpay ?? null
    if (s.afterpay) order.paid_with_afterpay = true
    if (order.pay_with === undefined) order.pay_with = defaultPayWith(m)
    return { ...s, order, afterpay }
  }
  if (kind === 'afterpay') return { ...s, afterpay: { ...blankAfterpay(s.order?.store ?? who), total: s.order?.total ?? null, ...(s.afterpay ?? {}) } }
  if (kind === 'return') {
    const base = { ...blankReturn(s.order?.store ?? who), items: s.order?.items ?? null, order_number: s.order?.order_number ?? null }
    return { ...s, ret: { ...base, ...(s.ret ?? {}), stage: s.ret?.stage ?? 'started' } }
  }
  if (kind === 'appointment') return { ...s, appointment: { ...blankAppt(who), ...(s.appointment ?? {}) } }
  return { ...s, trip_item: { ...blankTrip(e.subject), ...(s.trip_item ?? {}) } }
}

function describe(kind: CardKind, s: Suggestion, today: string, data: InboxData, trips: TripsData, m: MoneyData): string[] {
  if (kind === 'return' && s.ret) {
    const x = s.ret
    const first = [x.items, x.amount ? `${money(x.amount)} refund` : null].filter(Boolean).join(' · ') || 'Return'
    if (x.stage === 'refunded') {
      const to = refundToLabel(m, x.refund_to)
      return [first, to ? `Goes back to ${to}` : 'Where did it go? Tap Edit to pick', x.return_id ? 'Closes out the return you started' : '']
        .filter(Boolean)
    }
    return [first, x.stage === 'dropped_off' ? 'Dropped off · Runway watches for the refund' : `Return started${x.drop_off_by ? ` · drop off by ${shortDate(x.drop_off_by)}` : ''}`]
  }
  if (kind === 'money_in' && s.money_in) {
    const x = s.money_in
    const acct = m.accounts.find((a) => a.id === x.account_id)
    return [
      `+${x.amount ? money(x.amount) : '?'}${x.from ? ` from ${x.from}` : ''}`,
      `${INCOME_KIND_LABEL[x.income_kind ?? 'other']} · into ${acct?.institution ?? acct?.name ?? 'pick an account'}${x.received_on ? ` · ${shortDate(x.received_on)}` : ''}`,
    ]
  }
  if (kind === 'order' && s.order) {
    const o = s.order
    const lines = [[o.items, o.total !== null ? money(o.total) : null].filter(Boolean).join(' · ')]
    lines.push(statusLine({ status: (o.status ?? 'ordered') as OrderStatus, carrier: o.carrier, expected_on: o.expected_on, delivered_on: o.delivered_on, delivered_time: o.delivered_time }, today))
    if (o.paid_with_afterpay) {
      const a = s.afterpay
      lines.push(apLine(a?.total ?? o.total, a?.purchased_on ?? o.ordered_on ?? today, a?.first_payment_on ?? a?.purchased_on ?? o.ordered_on))
    } else {
      const from = payWithLabel(m, o.pay_with)
      lines.push(from && o.total ? `Logs ${money(o.total)} spent from ${from}` : from ? 'No total yet, so it won\'t be logged as spending (Edit to add one)' : 'Not logged as spending')
    }
    return lines.filter(Boolean)
  }
  if (kind === 'afterpay' && s.afterpay) {
    const a = s.afterpay
    const lines = [`${a.total ? money(a.total) : 'No total yet'}${a.purchased_on ? ` · bought ${shortDate(a.purchased_on)}` : ''}`, apLine(a.total, a.purchased_on ?? today, a.first_payment_on)]
    const linked = s.link_order_id ? data.orders.find((o) => o.id === s.link_order_id) : undefined
    if (linked) lines.push(`Links to your ${linked.store} order`)
    return lines
  }
  if (kind === 'appointment' && s.appointment) {
    const a = s.appointment
    return [
      [a.date ? shortDate(a.date) : 'No date', a.start_time ? timeLabel(a.start_time) : null].filter(Boolean).join(' · '),
      a.location ?? '',
    ].filter(Boolean)
  }
  if (kind === 'trip' && s.trip_item) {
    const t = s.trip_item
    const trip = trips.trips.find((x) => x.id === t.trip_id)
    return [
      `${t.kind ? KIND_LABEL[t.kind] : 'Item'} · ${t.date ? shortDate(t.date) : 'no date'}${t.time ? ` ${timeLabel(t.time)}` : ''}${t.end_date ? ` → ${shortDate(t.end_date)}` : ''}`,
      t.confirmation ? `Confirmation ${t.confirmation}` : '',
      trip ? `Goes in: ${trip.name}` : '',
    ].filter(Boolean)
  }
  return []
}

function ReviewCard({ e, today, data, money: m, trips, onAdded, reload }: {
  e: InboxEmail; today: string; data: InboxData; money: MoneyData; trips: TripsData; onAdded: (line: string, kind: CardKind) => Promise<void>; reload: Reload
}) {
  const unsure = e.status !== 'review'
  const [kind, setKind] = useState<CardKind | null>(unsure ? null : initialKind(e))
  const [draft, setDraft] = useState<Suggestion>(() => (kind ? withDefaults(kind, e.suggestion, e, m) : e.suggestion))
  const [editing, setEditing] = useState(false)
  const [showBody, setShowBody] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // Money arrives after the Inbox sometimes: fill in the account once accounts are known
  useEffect(() => {
    if (kind === 'money_in' && draft.money_in && !draft.money_in.account_id && m.accounts.length) {
      setDraft((d) => ({ ...d, money_in: moneyInDefaults(d.money_in!, m) }))
    }
    if (kind === 'order' && draft.order && !draft.order.pay_with && draft.order.pay_with !== 'none' && m.accounts.length) {
      const pw = defaultPayWith(m)
      if (pw) setDraft((d) => ({ ...d, order: { ...d.order!, pay_with: d.order!.pay_with || pw } }))
    }
  }, [kind, draft.money_in, draft.order, m])

  function choose(k: CardKind) {
    setKind(k); setDraft(withDefaults(k, e.suggestion, e, m)); setEditing(true); setError('')
  }

  async function add() {
    if (!kind) return
    const problem = needsFixing(kind, draft, trips.trips)
    if (problem) { setError(problem); setEditing(true); return }
    setBusy(true); setError('')
    try {
      const line = await addFromEmail(e, kind, draft, m, today)
      await onAdded(line, kind)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\'t add it')
      setBusy(false)
    }
  }

  async function act(f: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await f(); await reload() } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); setBusy(false) }
  }

  const title = e.kind === 'gmail_confirm' ? 'Gmail forwarding code'
    : kind === 'order' ? `Order · ${draft.order?.store ?? sender(e)}${draft.order?.paid_with_afterpay ? ' + Afterpay' : ''}`
      : kind === 'afterpay' ? `Afterpay · ${draft.afterpay?.store ?? sender(e)}`
        : kind === 'appointment' ? `Appointment · ${draft.appointment?.title ?? sender(e)}`
          : kind === 'trip' ? `Trip · ${draft.trip_item?.title ?? sender(e)}`
          : kind === 'money_in' ? `Money in · ${draft.money_in?.amount ? money(draft.money_in.amount) : sender(e)}`
          : kind === 'return' ? `${draft.ret?.stage === 'refunded' ? 'Refund' : 'Return'} · ${draft.ret?.store ?? sender(e)}`
            : e.subject || sender(e)
  const icon = KIND_ICON[e.kind === 'gmail_confirm' ? 'gmail_confirm' : kind ?? e.kind ?? 'other'] ?? '✉'

  return (
    <article className={`rounded-2xl border bg-surface p-3.5 flex flex-col gap-2 ${unsure ? 'border-warn/60' : 'border-line'}`}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="text-xl leading-7 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <b className="block leading-snug">{title}</b>
          <span className="block text-xs text-muted truncate">{sender(e)}{e.subject && title !== e.subject ? ` · ${e.subject}` : ''}</span>
        </div>
      </div>

      {/* Gmail's confirmation email: show the code, nothing to add */}
      {e.kind === 'gmail_confirm' ? (() => {
        const code = e.suggestion.code
          ?? e.subject?.match(/#(\d{6,12})/)?.[1]
          ?? e.body.match(/confirmation code\D{0,5}(\d{6,12})/i)?.[1]
          ?? e.body.match(/\b(\d{9})\b/)?.[1]
          ?? null
        return (
        <>
          <p className="m-0 text-sm">Gmail sent this when you added Runway as a forwarding address. Use the code in Gmail, or open the link.</p>
          {code ? (
            <div className="flex items-center gap-2">
              <code className="text-2xl font-bold tracking-widest tnum">{code}</code>
              <button type="button" className={btnPlain} onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true) }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          ) : <p className="m-0 text-sm font-bold">The code wasn't found automatically. Tap Show email and look for it there.</p>}
          {e.suggestion.link && <a href={e.suggestion.link} target="_blank" rel="noreferrer" className="text-accent font-bold text-sm break-all">Open the confirmation link</a>}
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} className={btnMain} onClick={() => void act(() => setEmailStatus(e.id, 'added'))}>Done</button>
            <button type="button" aria-expanded={showBody} onClick={() => setShowBody(!showBody)}
              className="ml-auto bg-transparent border-0 text-accent text-sm font-bold cursor-pointer">{showBody ? 'Hide email' : 'Show email'}</button>
          </div>
          {showBody && (
            <pre className="m-0 max-h-72 overflow-auto rounded-xl bg-surface-2 border border-line p-3 text-xs whitespace-pre-wrap break-words font-[inherit]">{e.body || '(empty)'}</pre>
          )}
        </>
        )
      })() : (
        <>
          {e.status === 'error' ? (
            <p className="m-0 text-sm font-bold text-bad">Couldn't read this one{e.error ? `: ${e.error}` : '.'}</p>
          ) : (e.summary && unsure && !kind) ? <p className="m-0 text-sm">{e.summary}</p> : null}

          {kind && !editing && (
            <ul className="m-0 p-0 list-none text-sm flex flex-col gap-0.5">
              {describe(kind, draft, today, data, trips, m).map((l, i) => <li key={i} className={i === 0 ? '' : 'text-muted'}>{l}</li>)}
            </ul>
          )}

          {unsure && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">{kind ? 'Adding it as' : 'What is it?'}</span>
              <div className="flex flex-wrap gap-1.5">
                {(['order', 'afterpay', 'appointment', 'trip', 'money_in', 'return'] as CardKind[]).map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => choose(k)}
                    className={`h-9 px-3 rounded-full text-sm font-bold cursor-pointer border ${kind === k ? 'bg-accent text-accent-ink border-accent' : 'bg-surface-2 text-fg border-line'}`}>
                    {KIND_NAME[k]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind && editing && <EditForm kind={kind} draft={draft} setDraft={setDraft} trips={trips} today={today} m={m} />}

          {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {kind && <button type="button" disabled={busy} className={btnMain} onClick={() => void add()}>{busy ? 'Adding…' : 'Add'}</button>}
            {kind && !editing && <button type="button" className={btnPlain} onClick={() => setEditing(true)}>Edit</button>}
            {kind && editing && !unsure && <button type="button" className={btnPlain} onClick={() => setEditing(false)}>Done editing</button>}
            {e.status === 'error' && <button type="button" disabled={busy} className={btnPlain} onClick={() => void act(() => rereadEmail(e.id))}>{busy ? 'Reading…' : 'Try again'}</button>}
            <button type="button" disabled={busy} className={btnPlain} onClick={() => void act(() => setEmailStatus(e.id, 'skipped'))}>Skip</button>
            <button type="button" aria-expanded={showBody} onClick={() => setShowBody(!showBody)}
              className="ml-auto bg-transparent border-0 text-accent text-sm font-bold cursor-pointer">{showBody ? 'Hide email' : 'Show email'}</button>
          </div>
          {showBody && (
            <pre className="m-0 max-h-72 overflow-auto rounded-xl bg-surface-2 border border-line p-3 text-xs whitespace-pre-wrap break-words font-[inherit]">{e.body || '(empty)'}</pre>
          )}
        </>
      )}
    </article>
  )
}

function EditForm({ kind, draft, setDraft, trips, today, m }: {
  kind: CardKind; draft: Suggestion; setDraft: (f: (d: Suggestion) => Suggestion) => void; trips: TripsData; today: string; m: MoneyData
}) {
  if (kind === 'return') {
    const x = draft.ret ?? blankReturn()
    const set = (p: Partial<ReturnInfo>) => setDraft((d) => ({ ...d, ret: { ...(d.ret ?? blankReturn()), ...p } }))
    return <ReturnFields x={x} set={set} m={m} today={today} />
  }
  if (kind === 'money_in') {
    const x = draft.money_in!
    const set = (p: Partial<MoneyInInfo>) => setDraft((d) => ({ ...d, money_in: { ...d.money_in!, ...p } }))
    return (
      <div className="grid grid-cols-2 gap-2">
        <F label="Amount"><input className={inputCls} inputMode="decimal" defaultValue={x.amount ?? ''} onChange={(ev) => set({ amount: toNum(ev.target.value) })} /></F>
        <F label="Date"><input type="date" className={inputCls} value={x.received_on ?? today} onChange={(ev) => set({ received_on: orNull(ev.target.value) })} /></F>
        <F label="From"><input className={inputCls} value={x.from ?? ''} onChange={(ev) => set({ from: orNull(ev.target.value) })} /></F>
        <F label="What is it">
          <select className={inputCls} value={x.income_kind ?? 'other'} onChange={(ev) => set({ income_kind: ev.target.value as IncomeKind })}>
            {(Object.keys(INCOME_KIND_LABEL) as IncomeKind[]).map((k) => <option key={k} value={k}>{INCOME_KIND_LABEL[k]}</option>)}
          </select>
        </F>
        <F label="Went into" wide>
          <select className={inputCls} value={x.account_id ?? ''} onChange={(ev) => set({ account_id: ev.target.value || null })}>
            <option value="">Pick an account…</option>
            {m.accounts.filter((a) => a.kind === 'checking').map((a) => <option key={a.id} value={a.id}>{a.institution ?? a.name}</option>)}
          </select>
        </F>
      </div>
    )
  }
  if (kind === 'order') {
    const o = draft.order ?? blankOrder()
    const a = draft.afterpay ?? blankAfterpay(o.store)
    const set = (p: Partial<OrderInfo>) => setDraft((d) => ({ ...d, order: { ...(d.order ?? blankOrder()), ...p } }))
    const setA = (p: Partial<AfterpayInfo>) => setDraft((d) => ({ ...d, afterpay: { ...(d.afterpay ?? blankAfterpay(d.order?.store ?? null)), ...p } }))
    return (
      <div className="grid grid-cols-2 gap-2">
        <F label="Store"><input className={inputCls} value={o.store ?? ''} onChange={(ev) => set({ store: orNull(ev.target.value) })} /></F>
        <F label="Total"><input className={inputCls} inputMode="decimal" defaultValue={o.total ?? ''} onChange={(ev) => set({ total: toNum(ev.target.value) })} /></F>
        <F label="What's in it" wide><input className={inputCls} value={o.items ?? ''} onChange={(ev) => set({ items: orNull(ev.target.value) })} /></F>
        <F label="Status">
          <select className={inputCls} value={o.status ?? 'ordered'} onChange={(ev) => set({ status: ev.target.value as OrderStatus })}>
            {(['ordered', 'shipped', 'out_for_delivery', 'delayed', 'delivered'] as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
          </select>
        </F>
        <F label="Arriving"><input type="date" className={inputCls} value={o.expected_on ?? ''} onChange={(ev) => set({ expected_on: orNull(ev.target.value) })} /></F>
        <F label="Order #"><input className={inputCls} value={o.order_number ?? ''} onChange={(ev) => set({ order_number: orNull(ev.target.value) })} /></F>
        <F label="Tracking #"><input className={inputCls} value={o.tracking_number ?? ''} onChange={(ev) => set({ tracking_number: orNull(ev.target.value) })} /></F>
        <label className="col-span-2 flex items-center gap-2 font-bold text-sm">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={o.paid_with_afterpay}
            onChange={(ev) => { set({ paid_with_afterpay: ev.target.checked }); if (ev.target.checked && !draft.afterpay) setA({ store: o.store, total: o.total, purchased_on: o.ordered_on ?? today }) }} />
          Paid with Afterpay
        </label>
        {!o.paid_with_afterpay && (
          <F label="Paid with" wide>
            <select className={inputCls} value={o.pay_with ?? 'none'} onChange={(ev) => set({ pay_with: ev.target.value })}>
              {m.accounts.filter((x) => x.kind === 'checking').map((x) => <option key={x.id} value={`a:${x.id}`}>{x.institution ?? x.name}</option>)}
              {m.cards.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
              <option value="none">Don't log it (already logged)</option>
            </select>
          </F>
        )}
        {o.paid_with_afterpay && (
          <>
            <F label="Bought on"><input type="date" className={inputCls} value={a.purchased_on ?? o.ordered_on ?? today} onChange={(ev) => setA({ purchased_on: orNull(ev.target.value) })} /></F>
            <F label="1st payment"><input type="date" className={inputCls} value={a.first_payment_on ?? a.purchased_on ?? o.ordered_on ?? today} onChange={(ev) => setA({ first_payment_on: orNull(ev.target.value) })} /></F>
          </>
        )}
      </div>
    )
  }
  if (kind === 'afterpay') {
    const a = draft.afterpay ?? blankAfterpay()
    const set = (p: Partial<AfterpayInfo>) => setDraft((d) => ({ ...d, afterpay: { ...(d.afterpay ?? blankAfterpay()), ...p } }))
    return (
      <div className="grid grid-cols-2 gap-2">
        <F label="Store"><input className={inputCls} value={a.store ?? ''} onChange={(ev) => set({ store: orNull(ev.target.value) })} /></F>
        <F label="Total"><input className={inputCls} inputMode="decimal" defaultValue={a.total ?? ''} onChange={(ev) => set({ total: toNum(ev.target.value) })} /></F>
        <F label="Bought on"><input type="date" className={inputCls} value={a.purchased_on ?? today} onChange={(ev) => set({ purchased_on: orNull(ev.target.value) })} /></F>
        <F label="1st payment"><input type="date" className={inputCls} value={a.first_payment_on ?? a.purchased_on ?? today} onChange={(ev) => set({ first_payment_on: orNull(ev.target.value) })} /></F>
        <p className="col-span-2 m-0 text-xs text-muted">Same day as bought = paid at checkout. A later day = you skipped or pushed the first payment.</p>
      </div>
    )
  }
  if (kind === 'appointment') {
    const a = draft.appointment ?? blankAppt()
    const set = (p: Partial<AppointmentInfo>) => setDraft((d) => ({ ...d, appointment: { ...(d.appointment ?? blankAppt()), ...p } }))
    return (
      <div className="grid grid-cols-2 gap-2">
        <F label="What" wide><input className={inputCls} value={a.title ?? ''} onChange={(ev) => set({ title: orNull(ev.target.value) })} /></F>
        <F label="Date"><input type="date" className={inputCls} value={a.date ?? ''} onChange={(ev) => set({ date: orNull(ev.target.value) })} /></F>
        <F label="Time"><input type="time" className={inputCls} value={a.start_time ?? ''} onChange={(ev) => set({ start_time: orNull(ev.target.value) })} /></F>
        <F label="Where" wide><input className={inputCls} value={a.location ?? ''} onChange={(ev) => set({ location: orNull(ev.target.value) })} /></F>
      </div>
    )
  }
  const t = draft.trip_item ?? blankTrip()
  const set = (p: Partial<TripItemInfo>) => setDraft((d) => ({ ...d, trip_item: { ...(d.trip_item ?? blankTrip()), ...p } }))
  const list = trips.trips.filter((x) => x.status !== 'done' || x.id === t.trip_id)
  return (
    <div className="grid grid-cols-2 gap-2">
      <F label="Trip" wide>
        <select className={inputCls} value={t.trip_id ?? (t.new_trip_name !== undefined && t.new_trip_name !== null ? '__new' : '')}
          onChange={(ev) => (ev.target.value === '__new' ? set({ trip_id: null, new_trip_name: t.destination ?? '' }) : set({ trip_id: ev.target.value || null, new_trip_name: null }))}>
          <option value="">Pick a trip…</option>
          {list.map((x) => <option key={x.id} value={x.id}>{x.name}{x.start_date ? ` · ${shortDate(x.start_date)}` : ''}</option>)}
          <option value="__new">New trip…</option>
        </select>
      </F>
      {!t.trip_id && t.new_trip_name !== undefined && t.new_trip_name !== null && (
        <F label="New trip name" wide><input className={inputCls} value={t.new_trip_name} onChange={(ev) => set({ new_trip_name: ev.target.value })} /></F>
      )}
      <F label="Type">
        <select className={inputCls} value={t.kind ?? 'other'} onChange={(ev) => set({ kind: ev.target.value as ItemKind })}>
          {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </F>
      <F label="Name"><input className={inputCls} value={t.title ?? ''} onChange={(ev) => set({ title: orNull(ev.target.value) })} /></F>
      <F label="Date"><input type="date" className={inputCls} value={t.date ?? ''} onChange={(ev) => set({ date: orNull(ev.target.value) })} /></F>
      <F label="Time"><input type="time" className={inputCls} value={t.time ?? ''} onChange={(ev) => set({ time: orNull(ev.target.value) })} /></F>
      <F label="Until"><input type="date" className={inputCls} value={t.end_date ?? ''} onChange={(ev) => set({ end_date: orNull(ev.target.value) })} /></F>
      <F label="Confirmation"><input className={inputCls} value={t.confirmation ?? ''} onChange={(ev) => set({ confirmation: orNull(ev.target.value.toUpperCase()) })} /></F>
      {t.kind === 'flight' && (
        <>
          <F label="Flight"><input className={inputCls} value={t.flight_number ?? ''} onChange={(ev) => set({ flight_number: orNull(ev.target.value) })} /></F>
          <F label="Pass">
            <select className={inputCls} value={t.pass_type ?? 'ticket'} onChange={(ev) => set({ pass_type: ev.target.value as PassType })}>
              {(Object.keys(PASS_LABEL) as PassType[]).map((k) => <option key={k} value={k}>{PASS_LABEL[k]}</option>)}
            </select>
          </F>
          <F label="From"><input className={inputCls} value={t.origin ?? ''} onChange={(ev) => set({ origin: orNull(ev.target.value.toUpperCase()) })} /></F>
          <F label="To"><input className={inputCls} value={t.destination ?? ''} onChange={(ev) => set({ destination: orNull(ev.target.value.toUpperCase()) })} /></F>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

function RefundToSelect({ value, onChange, m, id }: { value: string | null | undefined; onChange: (v: string | null) => void; m: MoneyData; id?: string }) {
  return (
    <select id={id} className={inputCls} value={value ?? ''} onChange={(ev) => onChange(ev.target.value || null)}>
      <option value="">Pick where it went…</option>
      {refundOptions(m).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function ReturnFields({ x, set, m, today }: { x: ReturnInfo; set: (p: Partial<ReturnInfo>) => void; m: MoneyData; today: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <F label="Step">
        <select className={inputCls} value={x.stage ?? 'started'} onChange={(ev) => set({ stage: ev.target.value as ReturnStage })}>
          {(Object.keys(RETURN_STAGE_LABEL) as ReturnStage[]).map((k) => <option key={k} value={k}>{RETURN_STAGE_LABEL[k]}</option>)}
        </select>
      </F>
      <F label="Store"><input className={inputCls} value={x.store ?? ''} onChange={(ev) => set({ store: orNull(ev.target.value) })} /></F>
      <F label="What you sent back" wide><input className={inputCls} value={x.items ?? ''} onChange={(ev) => set({ items: orNull(ev.target.value) })} /></F>
      <F label="Refund amount"><input className={inputCls} inputMode="decimal" defaultValue={x.amount ?? ''} onChange={(ev) => set({ amount: toNum(ev.target.value) })} /></F>
      {x.stage === 'refunded'
        ? <F label="Refund date"><input type="date" className={inputCls} value={x.date ?? today} onChange={(ev) => set({ date: orNull(ev.target.value) })} /></F>
        : x.stage === 'started'
          ? <F label="Drop off by"><input type="date" className={inputCls} value={x.drop_off_by ?? ''} onChange={(ev) => set({ drop_off_by: orNull(ev.target.value) })} /></F>
          : <F label="Order #"><input className={inputCls} value={x.order_number ?? ''} onChange={(ev) => set({ order_number: orNull(ev.target.value) })} /></F>}
      <F label={x.stage === 'refunded' ? 'Went back to' : 'Refund goes back to'} wide>
        <RefundToSelect value={x.refund_to} onChange={(v) => set({ refund_to: v })} m={m} />
      </F>
      {x.stage !== 'refunded' && <p className="col-span-2 m-0 text-xs text-muted">Nothing changes in your money until the refund comes. Then it goes back to this card or account.</p>}
    </div>
  )
}

function ReturnItem({ x, today, reload, m, onRefund }: { x: ReturnRec; today: string; reload: Reload; m: MoneyData; onRefund: (line: string) => Promise<void> }) {
  const [refunding, setRefunding] = useState(false)
  const [amount, setAmount] = useState(x.amount ? String(x.amount) : '')
  const [to, setTo] = useState<string | null>(x.refund_to)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const tone = returnTone(x, today)
  const color = tone === 'done' ? 'text-pay-ink' : tone === 'late' ? 'text-bad' : tone === 'soon' ? 'text-warn' : 'text-muted'
  async function run(f: () => Promise<void>) {
    setBusy(true); setErr('')
    try { await f(); await reload() } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong') }
    setBusy(false)
  }
  function refund() {
    const amt = toNum(amount)
    if (!amt || amt <= 0) { setErr('Add the refund amount.'); return }
    if (!to) { setErr('Pick where the refund went.'); return }
    void run(async () => {
      await applyRefund(m, { stage: 'refunded', store: x.store, order_number: x.order_number, items: x.items, amount: amt, date: today, drop_off_by: null, refund_method: null, return_id: x.id, order_id: x.order_id, refund_to: to }, today)
      await onRefund(`Refund · ${money(amt)} back to ${refundToLabel(m, to)}`)
    })
  }
  return (
    <div className="py-2.5 border-t border-line first:border-t-0 flex flex-col gap-2 min-w-0" data-testid="return-row">
      <div className="flex items-center gap-2.5 min-w-0">
        <span aria-hidden="true" className="text-lg shrink-0">{tone === 'done' ? '✅' : '↩️'}</span>
        <span className="flex-1 min-w-0">
          <b className="block truncate">{x.store}{x.items ? <span className="font-normal text-muted"> · {x.items}</span> : null}</b>
          <span className={`block text-sm font-bold ${color}`}>{returnLine(x, today, refundToLabel(m, x.refund_to))}</span>
        </span>
        {x.status !== 'refunded' && (confirm
          ? <button type="button" disabled={busy} onClick={() => void run(() => removeReturn(x.id))}
              className="h-9 px-3 rounded-lg border-0 bg-bad text-white text-sm font-bold cursor-pointer shrink-0">Remove?</button>
          : <button type="button" aria-label={`Remove ${x.store} return`} onClick={() => setConfirm(true)}
              className="size-9 rounded-lg border border-line bg-transparent text-muted cursor-pointer shrink-0">×</button>)}
      </div>
      {x.status !== 'refunded' && !refunding && (
        <div className="flex flex-wrap gap-2 pl-8">
          {x.status === 'started' && (
            <button type="button" disabled={busy} onClick={() => void run(() => markDroppedOff(x, today))}
              className="h-9 px-3 rounded-lg border border-line bg-surface text-fg text-sm font-bold cursor-pointer">Dropped off</button>
          )}
          <button type="button" onClick={() => setRefunding(true)}
            className="h-9 px-3 rounded-lg border border-pay bg-surface text-pay-ink text-sm font-bold cursor-pointer">Refund came</button>
        </div>
      )}
      {refunding && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-2.5">
          <F label="Amount"><input className={inputCls} inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value)} aria-label="Refund amount" /></F>
          <F label="Went back to"><RefundToSelect value={to} onChange={setTo} m={m} /></F>
          <div className="col-span-2 flex gap-2">
            <button type="button" disabled={busy} className={btnMain} onClick={refund}>{busy ? 'Saving…' : 'Save refund'}</button>
            <button type="button" className={btnPlain} onClick={() => { setRefunding(false); setErr('') }}>Cancel</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="m-0 text-sm font-bold text-bad">{err}</p>}
    </div>
  )
}

function StartReturn({ start, onDone, today, m, reload, onRefund }: { start: ReturnInfo; onDone: () => void; today: string; m: MoneyData; reload: Reload; onRefund: (line: string) => Promise<void> }) {
  const [x, setX] = useState<ReturnInfo>(start)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    if (!x.store?.trim()) { setErr('Add the store name.'); return }
    if (x.stage === 'refunded' && (!x.amount || !x.refund_to)) { setErr('Add the refund amount and where it went.'); return }
    setBusy(true); setErr('')
    try {
      if (x.stage === 'refunded') {
        await applyRefund(m, x, today)
        await onRefund(`Refund · ${money(x.amount!)} back to ${refundToLabel(m, x.refund_to)}`)
      } else {
        await saveReturn(x, today)
        await reload()
      }
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn\'t save it'); setBusy(false) }
  }
  return (
    <div className="rounded-2xl border border-accent-hi bg-surface p-3.5 flex flex-col gap-2.5" aria-label="New return" role="group">
      <b>↩️ New return</b>
      <ReturnFields x={x} set={(p) => setX((c) => ({ ...c, ...p }))} m={m} today={today} />
      {err && <p role="alert" className="m-0 text-sm font-bold text-bad">{err}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} className={btnMain} onClick={() => void save()}>{busy ? 'Saving…' : 'Save return'}</button>
        <button type="button" className={btnPlain} onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}

export function returnFromOrder(o: Order): ReturnInfo {
  return { ...blankReturn(o.store), items: o.items, amount: o.total, order_number: o.order_number, order_id: o.id, refund_to: refundToFromOrder(o) }
}

function ReturnsSection({ data, today, reload, m, starting, setStarting, onAdded }: {
  data: InboxData; today: string; reload: Reload; m: MoneyData; starting: ReturnInfo | null; setStarting: (x: ReturnInfo | null) => void
  onAdded: (line: string, kind: CardKind) => Promise<void>
}) {
  const onRefund = (line: string) => onAdded(line, 'return')   // shows the toast and reloads your money too
  const open = openReturns(data), done = recentRefunds(data)
  return (
    <section aria-label="Returns" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h3 className={heading}>Returns · {open.length}</h3>
        {!starting && <button type="button" onClick={() => setStarting(blankReturn())} className="bg-transparent border-0 text-accent text-sm font-bold cursor-pointer">+ Start a return</button>}
      </div>
      {starting && <StartReturn key={starting.order_id ?? 'new'} start={starting} onDone={() => setStarting(null)} today={today} m={m} reload={reload} onRefund={onRefund} />}
      {open.length + done.length === 0
        ? !starting && <p className="m-0 text-sm text-muted">No returns. Return emails from stores show up here, and Runway watches for the refund.</p>
        : <div className="rounded-2xl border border-line bg-surface px-3">{[...open, ...done].map((x) => <ReturnItem key={x.id} x={x} today={today} reload={reload} m={m} onRefund={onRefund} />)}</div>}
    </section>
  )
}

function ReadAgain({ id, reload }: { id: string; reload: Reload }) {
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" disabled={busy} className="bg-transparent border-0 text-accent font-bold cursor-pointer text-sm shrink-0"
      onClick={() => { setBusy(true); void rereadEmail(id).catch(() => null).then(reload).finally(() => setBusy(false)) }}>
      {busy ? 'Reading…' : 'Read again'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// The Inbox panel (side panel on desktop, full screen on phone)
// ---------------------------------------------------------------------------

interface PanelProps {
  open: boolean
  onClose: () => void
  isPhone: boolean
  focusPaste: boolean
  today: string
  data: InboxData
  reload: Reload
  money: MoneyData
  trips: TripsData
  onAdded: (line: string, kind: CardKind) => Promise<void>
}

export function InboxPanel({ open, onClose, isPhone, focusPaste, today, data, reload, money: m, trips, onAdded }: PanelProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const [paste, setPaste] = useState('')
  const [pasteBusy, setPasteBusy] = useState(false)
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [starting, setStarting] = useState<ReturnInfo | null>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      setPasteMsg(null)
      void reload()
      if (focusPaste) requestAnimationFrame(() => { pasteRef.current?.scrollIntoView({ block: 'center' }); pasteRef.current?.focus() })
    }
    if (!open && el.open) el.close()
  }, [open, focusPaste, reload])

  async function readPaste() {
    const text = paste.trim()
    if (text.length < 20) { setPasteMsg({ ok: false, text: 'Paste the whole email, including the details.' }); return }
    setPasteBusy(true); setPasteMsg(null)
    try {
      const r = await pasteEmail(text)
      setPaste('')
      setPasteMsg({ ok: r.status !== 'error', text: r.status === 'error' ? `Couldn't read it: ${r.error ?? ''}` : r.status === 'auto' ? `Done: ${r.summary}` : 'Read it. It\'s at the top of the Inbox.' })
      await reload()
    } catch (err) {
      setPasteMsg({ ok: false, text: err instanceof Error ? err.message : 'Couldn\'t read it' })
    }
    setPasteBusy(false)
  }

  const review = toReview(data)
  const unsure = notSure(data)
  const reading = stillReading(data)
  const coming = onTheWay(data.orders, today)
  const done = handled(data)
  const cardProps = { today, data, money: m, trips, onAdded, reload }

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="inbox-title"
      className={`p-0 text-fg bg-bg border-line backdrop:bg-black/50 ${isPhone ? 'm-0 w-full max-w-full h-dvh max-h-dvh border-0' : 'm-0 ms-auto h-dvh max-h-dvh w-[480px] max-w-full border-l'}`}>
      <div className="sticky top-0 z-10 bg-header text-white px-4 py-3 flex items-center gap-3" style={{ paddingTop: isPhone ? 'max(12px, env(safe-area-inset-top, 0px))' : undefined }}>
        <h2 id="inbox-title" className="m-0 flex-1 text-2xl font-bold">Inbox</h2>
        <button type="button" onClick={onClose} aria-label="Close inbox"
          className="size-10 rounded-full border border-header-2 bg-transparent text-white grid place-items-center cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="p-4 flex flex-col gap-5" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
        {reading.length > 0 && (
          <p role="status" className="m-0 rounded-xl bg-accent-soft px-3 py-2 text-sm font-bold">
            Reading {reading.length === 1 ? `“${reading[0].subject ?? 'an email'}”` : `${reading.length} emails`}…
          </p>
        )}

        <section aria-label="To review" className="flex flex-col gap-2.5">
          <h3 className={heading}>To review · {review.length}</h3>
          {review.length === 0 && <p className="m-0 text-sm text-muted">Nothing waiting. New emails you forward show up here.</p>}
          {review.map((e) => <ReviewCard key={e.id} e={e} {...cardProps} />)}
        </section>

        {unsure.length > 0 && (
          <section aria-label="Not sure" className="flex flex-col gap-2.5">
            <h3 className={heading}>Not sure, take a look · {unsure.length}</h3>
            {unsure.map((e) => <ReviewCard key={e.id} e={e} {...cardProps} />)}
          </section>
        )}

        <section aria-label="On the way" className="flex flex-col gap-1">
          <h3 className={heading}>On the way · {coming.filter((o) => o.status !== 'delivered').length}</h3>
          {coming.length === 0
            ? <p className="m-0 text-sm text-muted">No packages right now.</p>
            : <div className="rounded-2xl border border-line bg-surface px-3">{coming.map((o) => <OrderRow key={o.id} o={o} today={today} reload={reload} onReturn={(x) => setStarting(returnFromOrder(x))} />)}</div>}
        </section>

        <ReturnsSection data={data} today={today} reload={reload} m={m} starting={starting} setStarting={setStarting} onAdded={onAdded} />

        <section aria-label="Paste an email" className="flex flex-col gap-2">
          <h3 className={heading}>Paste an email</h3>
          <p className="m-0 text-sm text-muted">For one that bounced or didn't forward: open it, select all, copy, and paste it here.</p>
          <textarea ref={pasteRef} value={paste} onChange={(ev) => setPaste(ev.target.value)} rows={5} aria-label="Pasted email"
            placeholder="From: Amazon.com&#10;Subject: Your order…"
            className="w-full rounded-xl border border-line bg-surface p-3 text-fg text-sm focus:outline-2 focus:outline-accent-hi" />
          <div className="flex items-center gap-3">
            <button type="button" disabled={pasteBusy} className={btnMain} onClick={() => void readPaste()}>{pasteBusy ? 'Reading…' : 'Read it'}</button>
            {pasteMsg && <span role={pasteMsg.ok ? 'status' : 'alert'} className={`text-sm font-bold ${pasteMsg.ok ? 'text-pay-ink' : 'text-bad'}`}>{pasteMsg.text}</span>}
          </div>
        </section>

        {done.length > 0 && (
          <details className="rounded-2xl border border-line bg-surface px-3 py-2">
            <summary className="cursor-pointer font-bold text-sm py-1">Handled this week · {done.length}</summary>
            <ul className="m-0 p-0 list-none">
              {done.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2 border-t border-line text-sm min-w-0">
                  <span className="shrink-0 rounded-full bg-surface-2 border border-line px-2 py-0.5 text-xs font-bold">
                    {e.status === 'auto' ? 'Updated' : e.status === 'merged' ? 'Combined' : e.status === 'added' ? 'Added' : 'Skipped'}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{e.summary || e.subject || sender(e)}</span>
                  {e.status === 'skipped' && (
                    <button type="button" className="bg-transparent border-0 text-accent font-bold cursor-pointer text-sm shrink-0"
                      onClick={() => void setEmailStatus(e.id, 'unsure').then(reload)}>Bring back</button>
                  )}
                  {(e.status === 'auto' || e.status === 'merged' || e.status === 'skipped') && <ReadAgain id={e.id} reload={reload} />}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </dialog>
  )
}
