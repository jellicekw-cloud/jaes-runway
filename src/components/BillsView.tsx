import { useState, type FormEvent, type ReactNode } from 'react'
import { money, shortDate } from '../lib/dates'
import {
  addAfterpayOrder, deleteRow, dueBeforePayday, insertRow, installmentAmount, installmentDate, markPaid, obligationsOn,
  parseMoney, undoPayment, updateRow, type MoneyData,
} from '../lib/money'
import { SWATCHES, type AfterpayOrder, type Bill, type Card, type Subscription } from '../lib/types'

interface Props {
  today: string
  money: MoneyData
  loaded: boolean
  reloadMoney: () => Promise<void>
  onOpenDay: (date: string) => void
}

const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th')

/** Bills tab: overview, credit cards, Afterpay, subscriptions, other monthly bills. */
export default function BillsView({ today, money: m, loaded, reloadMoney, onOpenDay }: Props) {
  const [error, setError] = useState('')

  /** Runs a change, then reloads so every screen shows the new numbers. */
  async function run(change: () => Promise<unknown>) {
    setError('')
    try { await change(); await reloadMoney() } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
  }

  if (!loaded) return <main className="flex-1 safe-x py-5 text-muted">Loading…</main>

  const cardBal = m.cards.reduce((t, c) => t + (c.balance ?? 0), 0)
  const limits = m.cards.filter((c) => c.balance !== null && c.credit_limit).reduce((t, c) => t + (c.credit_limit ?? 0), 0)
  const util = limits ? Math.round((cardBal / limits) * 100) : null
  const apLeft = m.orders.reduce((t, o) => {
    for (let n = 1; n <= o.installments; n++) if (!m.payments.some((p) => p.afterpay_order_id === o.id && p.installment_no === n)) t += installmentAmount(o, n)
    return t
  }, 0)
  const subMonthly = m.subs.reduce((t, s) => t + (s.cycle === 'monthly' ? s.amount : s.cycle === 'yearly' ? s.amount / 12 : (s.amount * 52) / 12), 0)
  const due = dueBeforePayday(m, today)
  const payFrom = [
    ...m.accounts.filter((a) => a.kind === 'checking').map((a) => ({ value: `a:${a.id}`, label: a.institution ?? a.name })),
    ...m.cards.map((c) => ({ value: `c:${c.id}`, label: c.name })),
  ]

  return (
    <main className="flex-1 safe-x py-5 flex flex-col gap-7 w-full max-w-[1240px] mx-auto">
      {error && (
        <p role="alert" className="m-0 rounded-xl border border-bad bg-bad/10 px-4 py-3 font-bold text-bad">
          Couldn't save that change: {error}
        </p>
      )}

      <Section title="Overview">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Card balances" value={money(cardBal)} note={`Across ${m.cards.length} cards`} />
          <Stat label="Utilization" value={util === null ? '—' : `${util}%`}
            note={util === null ? 'Add balances and limits to see this' : 'Under 30% is best for your credit score'}
            meter={util} meterColor={util === null ? undefined : util < 30 ? 'var(--pay)' : util < 50 ? 'var(--warn)' : 'var(--bad)'} />
          <Stat label="Afterpay left" value={money(apLeft)} note={`${m.orders.length} order${m.orders.length === 1 ? '' : 's'}`} />
          <Stat label="Subscriptions" value={`${money(subMonthly)}/mo`} note={`${money(subMonthly * 12)} a year`} />
        </div>
        {due && (
          <p className="m-0 text-sm text-muted">
            <b className="text-fg">Before your {shortDate(due.payday)} payday:</b> {money(due.total)} going out ({due.billCount} bill{due.billCount === 1 ? '' : 's'}, {due.subCount} auto-pay)
            {due.missingAmounts ? `, plus ${due.missingAmounts} card${due.missingAmounts === 1 ? '' : 's'} with no minimum entered yet` : ''}.
          </p>
        )}
      </Section>

      <Section title="Credit cards">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {m.cards.map((c) => <CardEditor key={c.id} card={c} m={m} today={today} run={run} onOpenDay={onOpenDay} />)}
        </div>
      </Section>

      <Section title="Afterpay" right={<span className="font-bold tnum">{money(apLeft)} left</span>}>
        {m.orders.length === 0 && <p className="m-0 text-muted">No Afterpay orders yet. Add one below and its 4 payments land on your calendar.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {m.orders.map((o) => <OrderCard key={o.id} order={o} m={m} today={today} run={run} />)}
        </div>
        <AddOrder payFrom={payFrom} today={today} run={run} m={m} />
      </Section>

      <Section title="Subscriptions" right={<span className="font-bold tnum">{money(subMonthly)}/mo · {money(subMonthly * 12)}/yr</span>}>
        <p className="m-0 text-sm text-muted">These charge on their own, so there's nothing to mark paid. Change an amount here when a price goes up.</p>
        <div className="relative rounded-2xl border border-line bg-surface overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[620px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-3 py-2.5 font-bold">Name</th>
                <th className="px-3 py-2.5 font-bold">Amount</th>
                <th className="px-3 py-2.5 font-bold">Day</th>
                <th className="px-3 py-2.5 font-bold">Charges</th>
                <th className="px-3 py-2.5"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {m.subs.map((s) => <SubRow key={s.id} sub={s} payFrom={payFrom} run={run} />)}
            </tbody>
          </table>
        </div>
        <AddSub payFrom={payFrom} run={run} />
      </Section>

      <Section title="Other monthly bills">
        {m.bills.length === 0 && <p className="m-0 text-muted">Rent, phone, car, utilities: anything monthly that isn't a card or a subscription.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {m.bills.map((b) => <BillEditor key={b.id} bill={b} m={m} run={run} />)}
        </div>
        <AddBill accounts={payFrom.filter((p) => p.value.startsWith('a:'))} run={run} />
      </Section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

type Run = (change: () => Promise<unknown>) => Promise<void>

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-2xl font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, note, meter, meterColor }: { label: string; value: string; note: string; meter?: number | null; meterColor?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3.5 min-w-0">
      <span className="text-xs font-bold tracking-widest uppercase text-muted">{label}</span>
      <span className="text-3xl font-bold tnum">{value}</span>
      {meter !== undefined && (
        <span className="h-2.5 rounded-full bg-line overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: `${Math.min(meter ?? 0, 100)}%`, background: meterColor }} />
        </span>
      )}
      <span className="text-sm text-muted">{note}</span>
    </div>
  )
}

/** A text field that saves when you leave it or press Enter. */
function Field({ id, label, value, onCommit, money: isMoney, kind = 'text', placeholder, width, hideLabel }: {
  id: string; label: string; value: string | number | null; onCommit: (v: string) => void
  money?: boolean; kind?: 'text' | 'number' | 'date'; placeholder?: string; width?: string; hideLabel?: boolean
}) {
  const initial = value === null || value === undefined ? '' : isMoney ? Number(value).toFixed(2) : String(value)
  const [v, setV] = useState(initial)
  const [last, setLast] = useState(initial)
  if (initial !== last) { setLast(initial); setV(initial) }   // refresh when the saved value changes
  const commit = () => { if (v !== initial) onCommit(v) }
  return (
    <label htmlFor={id} className={`flex flex-col gap-1 min-w-0 ${width ?? ''}`}>
      <span className={hideLabel ? 'sr-only' : 'text-xs font-bold tracking-wider uppercase text-muted'}>{label}</span>
      <span className="flex items-center h-10 rounded-lg border border-line bg-surface-2 px-2.5 focus-within:border-accent-hi">
        {isMoney && <span className="text-muted">$</span>}
        <input id={id} type={kind === 'date' ? 'date' : 'text'} inputMode={isMoney ? 'decimal' : kind === 'number' ? 'numeric' : undefined}
          value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-full min-w-0 border-0 bg-transparent text-fg tnum focus:outline-none" />
      </span>
    </label>
  )
}

function Swatches({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  return (
    <div role="group" aria-label="Color" className="flex flex-wrap gap-1.5">
      {SWATCHES.map((s) => (
        <button key={s.hex} type="button" aria-label={s.name} aria-pressed={value === s.hex} onClick={() => onPick(s.hex)}
          className={`size-7 rounded-full cursor-pointer border-2 ${value === s.hex ? 'border-fg' : 'border-transparent'}`}
          style={{ background: s.hex, boxShadow: 'inset 0 0 0 2px var(--surface)' }} />
      ))}
    </div>
  )
}

function ConfirmDelete({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <button type="button" onClick={() => { if (armed) onConfirm(); else { setArmed(true); window.setTimeout(() => setArmed(false), 4000) } }}
      onBlur={() => setArmed(false)}
      className={`h-9 px-3 rounded-lg font-bold cursor-pointer text-sm ${armed ? 'bg-bad text-white border border-bad' : 'bg-transparent text-fg border border-line'}`}>
      {armed ? 'Tap again to delete' : label}
    </button>
  )
}

function splitSource(v: string): { account_id: string | null; card_id: string | null } {
  if (v.startsWith('a:')) return { account_id: v.slice(2), card_id: null }
  if (v.startsWith('c:')) return { account_id: null, card_id: v.slice(2) }
  return { account_id: null, card_id: null }
}

function SourceSelect({ id, value, options, onChange, label = 'Charges', hideLabel }: {
  id: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label?: string; hideLabel?: boolean
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 min-w-0">
      <span className={hideLabel ? 'sr-only' : 'text-xs font-bold tracking-wider uppercase text-muted'}>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-line bg-surface-2 px-2 text-fg focus:outline-2 focus:outline-accent-hi">
        <option value="">Not set</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function CardEditor({ card: c, m, today, run, onOpenDay }: { card: Card; m: MoneyData; today: string; run: Run; onOpenDay: (d: string) => void }) {
  const save = (patch: Partial<Card>) => run(() => updateRow('cards', c.id, patch))
  const util = c.balance !== null && c.credit_limit ? Math.round((c.balance / c.credit_limit) * 100) : null
  const recent = m.payments.filter((p) => p.card_id === c.id).slice(0, 3)
  const pre = `card-${c.id}`

  // This month's due date (or next month's if this one is paid)
  const upcoming = (() => {
    for (let i = 0; i < 62; i++) {
      const d = new Date(); d.setDate(d.getDate() + i - 31)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const o = obligationsOn(m, k, today).find((x) => x.kind === 'card' && x.sourceId === c.id)
      if (o && (o.status !== 'paid' || k >= today)) return o
    }
    return undefined
  })()

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="size-4 rounded-full shrink-0" style={{ background: c.color }} />
        <b className="text-xl flex-1 truncate">{c.name}</b>
        {c.last4 && <span className="text-sm text-muted tnum">•• {c.last4}</span>}
      </div>

      {upcoming && (
        <div className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm ${upcoming.status === 'paid' ? 'bg-pay-soft text-pay-ink' : upcoming.status === 'overdue' ? 'bg-bad/10 text-bad' : 'bg-surface-2'}`}>
          <b>{upcoming.status === 'paid' ? `Paid ${money(upcoming.payment?.amount)} for ${shortDate(upcoming.date)}` : `Due ${shortDate(upcoming.date)}`}</b>
          {upcoming.status !== 'paid' && <QuickPay key={`${upcoming.key}:${upcoming.amount ?? ''}`} o={upcoming} m={m} run={run} />}
          {upcoming.status === 'paid' && (
            <button type="button" onClick={() => void run(() => undoPayment(m, upcoming))}
              className="h-8 px-3 rounded-lg border border-line bg-surface text-fg font-bold cursor-pointer">Undo</button>
          )}
          <button type="button" onClick={() => onOpenDay(upcoming.date)} className="ml-auto bg-transparent border-0 text-accent font-bold cursor-pointer underline">Open day</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Field id={`${pre}-due`} label="Due day" value={c.due_day} kind="number"
          onCommit={(v) => { const n = parseInt(v, 10); if (n >= 1 && n <= 31) void save({ due_day: n }) }} />
        <Field id={`${pre}-min`} label="Minimum" value={c.minimum_payment} money onCommit={(v) => void save({ minimum_payment: parseMoney(v) })} />
        <Field id={`${pre}-bal`} label="Balance" value={c.balance} money onCommit={(v) => void save({ balance: parseMoney(v) })} />
        <Field id={`${pre}-lim`} label="Credit limit" value={c.credit_limit} money onCommit={(v) => void save({ credit_limit: parseMoney(v) })} />
        <Field id={`${pre}-apr`} label="APR %" value={c.apr} onCommit={(v) => void save({ apr: parseMoney(v) })} />
        <Field id={`${pre}-l4`} label="Last 4" value={c.last4} placeholder="••••"
          onCommit={(v) => { const d = v.replace(/\D/g, ''); if (d === '' || d.length === 4) void save({ last4: d || null }) }} />
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-muted">
        <div className="flex justify-between gap-2 tnum">
          <span>Utilization</span>
          <span>{util === null ? 'Add balance + limit' : `${util}% · ${money(c.balance)} of ${money(c.credit_limit)}`}</span>
        </div>
        <span className="h-2.5 rounded-full bg-line overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: `${Math.min(util ?? 0, 100)}%`, background: c.color }} />
        </span>
      </div>

      <div className="flex flex-col gap-1 text-sm text-muted">
        <span className="text-xs font-bold tracking-widest uppercase">Recent payments</span>
        {recent.length === 0 ? <span>None yet</span> : recent.map((p) => (
          <span key={p.id} className="flex justify-between tnum"><span>For {shortDate(p.due_date)} · paid {shortDate(p.paid_on)}</span><b className="text-fg">{money(p.amount)}</b></span>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={c.autopay} onChange={(e) => void save({ autopay: e.target.checked })} className="size-[18px] accent-[var(--accent)]" />
          Autopay is on
        </label>
        <Swatches value={c.color} onPick={(hex) => void save({ color: hex })} />
      </div>
    </div>
  )
}

function QuickPay({ o, m, run }: { o: ReturnType<typeof obligationsOn>[number]; m: MoneyData; run: Run }) {
  const [v, setV] = useState(o.amount !== null ? o.amount.toFixed(2) : '')
  const id = `qp-${o.key.replace(/[^a-z0-9]/gi, '-')}`
  function submit(e: FormEvent) {
    e.preventDefault()
    const amt = parseMoney(v)
    if (amt && amt > 0) void run(() => markPaid(m, o, amt))
  }
  return (
    <form onSubmit={submit} className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className="inline-flex items-center h-8 px-2 rounded-lg border border-line bg-surface focus-within:border-accent-hi">
        <span className="text-muted">$</span><span className="sr-only">Amount paid</span>
        <input id={id} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="Paid" className="w-20 border-0 bg-transparent text-fg tnum focus:outline-none" />
      </label>
      <button type="submit" className="h-8 px-3 rounded-lg border-0 bg-accent text-accent-ink font-bold cursor-pointer">Mark paid</button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Afterpay
// ---------------------------------------------------------------------------

function OrderCard({ order: o, m, today, run }: { order: AfterpayOrder; m: MoneyData; today: string; run: Run }) {
  const tiles = Array.from({ length: o.installments }, (_, i) => i + 1).map((n) => {
    const date = installmentDate(o, n)
    const ob = obligationsOn(m, date, today).find((x) => x.kind === 'afterpay' && x.sourceId === o.id && x.installmentNo === n)!
    return { n, date, ob }
  })
  const paid = tiles.filter((t) => t.ob.status === 'paid').length
  const from = o.account_id ? m.accounts.find((a) => a.id === o.account_id)?.institution : o.card_id ? m.cards.find((c) => c.id === o.card_id)?.name : null

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="size-3.5 rounded-full shrink-0 bg-[#0EA5E9]" />
        <b className="text-lg flex-1 truncate">{o.name}</b>
        <b className="tnum">{money(o.total)}</b>
      </div>
      <span className="h-2.5 rounded-full bg-line overflow-hidden">
        <span className="block h-full rounded-full bg-[#0EA5E9]" style={{ width: `${(paid / o.installments) * 100}%` }} />
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {tiles.map(({ n, date, ob }) => (
          <div key={n} className={`flex flex-col gap-1 rounded-xl border p-2 text-sm tnum ${ob.status === 'paid' ? 'border-pay text-pay-ink' : ob.status === 'overdue' ? 'border-bad text-bad' : 'border-line'}`}>
            <b>{shortDate(date)}</b>
            <span>{money(ob.amount)}</span>
            {ob.status === 'paid'
              ? <button type="button" onClick={() => void run(() => undoPayment(m, ob))} className="h-7 rounded-md border border-line bg-surface text-fg text-xs font-bold cursor-pointer">Paid · undo</button>
              : <button type="button" onClick={() => void run(() => markPaid(m, ob, ob.amount ?? 0))} className="h-7 rounded-md border-0 bg-accent text-accent-ink text-xs font-bold cursor-pointer">{ob.status === 'overdue' ? 'Overdue · paid?' : 'Mark paid'}</button>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{paid} of {o.installments} paid · every {o.interval_days} days · charges {from ?? 'not set'}</span>
        <ConfirmDelete label="Delete order" onConfirm={() => void run(() => deleteRow('afterpay_orders', o.id))} />
      </div>
    </div>
  )
}

function AddOrder({ payFrom, today, run, m }: { payFrom: { value: string; label: string }[]; today: string; run: Run; m: MoneyData }) {
  const nfcu = payFrom.find((p) => p.label === 'NFCU')?.value ?? ''
  const [name, setName] = useState('')
  const [total, setTotal] = useState('')
  const [date, setDate] = useState(today)
  const [src, setSrc] = useState(nfcu)
  const t = parseMoney(total)
  const preview = t && t > 0 ? Array.from({ length: 4 }, (_, i) => {
    const o: AfterpayOrder = { id: '', name, total: t, order_date: date, installments: 4, interval_days: 14, account_id: null, card_id: null }
    return `${shortDate(installmentDate(o, i + 1))} ${money(installmentAmount(o, i + 1))}`
  }).join(' · ') : ''

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!t || t <= 0) return
    void run(async () => {
      await addAfterpayOrder(m, { name: name.trim() || 'Afterpay order', total: t, order_date: date, ...splitSource(src) })
      setName(''); setTotal(''); setDate(today)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-dashed border-muted p-4">
      <b className="text-lg">Add an Afterpay order</b>
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2.5 items-end">
        <label htmlFor="ap-name" className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-wider uppercase text-muted">What did you buy</span>
          <input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Boots, Ulta order"
            className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg focus:outline-2 focus:outline-accent-hi" />
        </label>
        <label htmlFor="ap-total" className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-wider uppercase text-muted">Order total</span>
          <input id="ap-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="$0.00" required
            className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg tnum focus:outline-2 focus:outline-accent-hi" />
        </label>
        <label htmlFor="ap-date" className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-wider uppercase text-muted">Order date</span>
          <input id="ap-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required
            className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg focus:outline-2 focus:outline-accent-hi" />
        </label>
        <SourceSelect id="ap-src" value={src} options={payFrom} onChange={setSrc} label="Afterpay charges" />
      </div>
      {preview && <p className="m-0 rounded-xl bg-accent-soft px-3 py-2 text-sm"><b>4 payments:</b> {preview}. The first is paid at checkout.</p>}
      <button type="submit" className="self-start h-11 px-5 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">Add order</button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

function SubRow({ sub: s, payFrom, run }: { sub: Subscription; payFrom: { value: string; label: string }[]; run: Run }) {
  const save = (patch: Partial<Subscription>) => run(() => updateRow('subscriptions', s.id, patch))
  const src = s.account_id ? `a:${s.account_id}` : s.card_id ? `c:${s.card_id}` : ''
  const pre = `sub-${s.id}`
  return (
    <tr className="border-t border-line align-middle">
      <td className="px-3 py-2 min-w-48"><Field hideLabel id={`${pre}-name`} label={`${s.name} name`} value={s.name} onCommit={(v) => { if (v.trim()) void save({ name: v.trim() }) }} /></td>
      <td className="px-3 py-2 w-32"><Field hideLabel id={`${pre}-amt`} label={`${s.name} amount`} value={s.amount} money onCommit={(v) => { const n = parseMoney(v); if (n !== null) void save({ amount: n }) }} /></td>
      <td className="px-3 py-2 w-28">
        <span className="flex items-center gap-1.5">
          <Field hideLabel id={`${pre}-day`} label={`${s.name} charge day`} value={s.charge_day} kind="number" onCommit={(v) => { const n = parseInt(v, 10); if (n >= 1 && n <= 31) void save({ charge_day: n }) }} />
          <span className="text-xs text-muted">{ordinal(s.charge_day).replace(/^\d+/, '')}</span>
        </span>
      </td>
      <td className="px-3 py-2 w-40"><SourceSelect hideLabel id={`${pre}-src`} label={`${s.name} charges`} value={src} options={payFrom} onChange={(v) => void save(splitSource(v))} /></td>
      <td className="px-3 py-2 text-right"><ConfirmDelete label="Remove" onConfirm={() => void run(() => deleteRow('subscriptions', s.id))} /></td>
    </tr>
  )
}

function AddSub({ payFrom, run }: { payFrom: { value: string; label: string }[]; run: Run }) {
  const nfcu = payFrom.find((p) => p.label === 'NFCU')?.value ?? ''
  const [name, setName] = useState('')
  const [amt, setAmt] = useState('')
  const [day, setDay] = useState('')
  const [src, setSrc] = useState(nfcu)
  function submit(e: FormEvent) {
    e.preventDefault()
    const a = parseMoney(amt), d = parseInt(day, 10)
    if (!name.trim() || a === null || !(d >= 1 && d <= 31)) return
    void run(async () => {
      await insertRow('subscriptions', { name: name.trim(), amount: a, charge_day: d, cycle: 'monthly', ...splitSource(src) })
      setName(''); setAmt(''); setDay('')
    })
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2.5 items-end rounded-2xl border border-dashed border-muted p-4">
      <label htmlFor="ns-name" className="flex flex-col gap-1 col-span-2 sm:col-span-1">
        <span className="text-xs font-bold tracking-wider uppercase text-muted">New subscription</span>
        <input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spotify" required
          className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg focus:outline-2 focus:outline-accent-hi" />
      </label>
      <label htmlFor="ns-amt" className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-wider uppercase text-muted">Amount</span>
        <input id="ns-amt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="$0.00" required
          className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg tnum focus:outline-2 focus:outline-accent-hi" />
      </label>
      <label htmlFor="ns-day" className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-wider uppercase text-muted">Day of month</span>
        <input id="ns-day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} placeholder="1–31" required
          className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg tnum focus:outline-2 focus:outline-accent-hi" />
      </label>
      <SourceSelect id="ns-src" value={src} options={payFrom} onChange={setSrc} />
      <button type="submit" className="h-10 px-4 rounded-lg border-0 bg-accent text-accent-ink font-bold cursor-pointer">Add</button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Other monthly bills
// ---------------------------------------------------------------------------

function BillEditor({ bill: b, m, run }: { bill: Bill; m: MoneyData; run: Run }) {
  const save = (patch: Partial<Bill>) => run(() => updateRow('bills', b.id, patch))
  const accounts = m.accounts.filter((a) => a.kind === 'checking').map((a) => ({ value: `a:${a.id}`, label: a.institution ?? a.name }))
  const pre = `bill-${b.id}`
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="size-4 rounded-full shrink-0" style={{ background: b.color }} />
        <div className="flex-1"><Field id={`${pre}-name`} label="Name" value={b.name} onCommit={(v) => { if (v.trim()) void save({ name: v.trim() }) }} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Field id={`${pre}-day`} label="Due day" value={b.due_day} kind="number" onCommit={(v) => { const n = parseInt(v, 10); if (n >= 1 && n <= 31) void save({ due_day: n }) }} />
        <Field id={`${pre}-amt`} label="Amount" value={b.amount} money onCommit={(v) => void save({ amount: parseMoney(v) })} />
        <SourceSelect id={`${pre}-src`} label="Paid from" value={b.account_id ? `a:${b.account_id}` : ''} options={accounts} onChange={(v) => void save({ account_id: splitSource(v).account_id })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={b.autopay} onChange={(e) => void save({ autopay: e.target.checked })} className="size-[18px] accent-[var(--accent)]" />
          Autopay is on
        </label>
        <Swatches value={b.color} onPick={(hex) => void save({ color: hex })} />
        <ConfirmDelete label="Delete bill" onConfirm={() => void run(() => deleteRow('bills', b.id))} />
      </div>
    </div>
  )
}

function AddBill({ accounts, run }: { accounts: { value: string; label: string }[]; run: Run }) {
  const nfcu = accounts.find((p) => p.label === 'NFCU')?.value ?? ''
  const [name, setName] = useState('')
  const [day, setDay] = useState('')
  const [amt, setAmt] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    const d = parseInt(day, 10)
    if (!name.trim() || !(d >= 1 && d <= 31)) return
    void run(async () => {
      await insertRow('bills', { name: name.trim(), due_day: d, amount: parseMoney(amt), ...{ account_id: splitSource(nfcu).account_id } })
      setName(''); setDay(''); setAmt('')
    })
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2.5 items-end rounded-2xl border border-dashed border-muted p-4">
      <label htmlFor="nb-name" className="flex flex-col gap-1 col-span-2 sm:col-span-1">
        <span className="text-xs font-bold tracking-wider uppercase text-muted">New monthly bill</span>
        <input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Phone, Rent, Car note" required
          className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg focus:outline-2 focus:outline-accent-hi" />
      </label>
      <label htmlFor="nb-day" className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-wider uppercase text-muted">Due day</span>
        <input id="nb-day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} placeholder="1–31" required
          className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg tnum focus:outline-2 focus:outline-accent-hi" />
      </label>
      <label htmlFor="nb-amt" className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-wider uppercase text-muted">Amount</span>
        <input id="nb-amt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="$0.00"
          className="h-10 rounded-lg border border-line bg-surface-2 px-2.5 text-fg tnum focus:outline-2 focus:outline-accent-hi" />
      </label>
      <button type="submit" className="h-10 px-4 rounded-lg border-0 bg-accent text-accent-ink font-bold cursor-pointer">Add bill</button>
    </form>
  )
}
