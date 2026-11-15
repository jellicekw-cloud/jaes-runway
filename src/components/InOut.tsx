import { useState } from 'react'
import { money, shortDate } from '../lib/dates'
import { IN_GROUPS, OUT_GROUPS, monthFlow, paycheckFlow, type Flow } from '../lib/flow'
import { cashIdeas } from '../lib/insights'
import type { MoneyData } from '../lib/money'

const remember = (k: string, v?: string) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch { /* fine */ } return null }

/** In vs out for NFCU + SoFi, by month or by paycheck. Saving shows on its own line (it isn't spending). */
export function InOutCard({ m, today, hide }: { m: MoneyData; today: string; hide?: boolean }) {
  const [by, setBy] = useState<'month' | 'paycheck'>(() => (remember('runway-inout-by') === 'paycheck' ? 'paycheck' : 'month'))
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState(false)
  const f: Flow | null = by === 'month' ? monthFlow(m, today, offset) : paycheckFlow(m, today, offset)
  const show = (n: number) => (hide ? '••••' : money(n))
  const pick = (v: 'month' | 'paycheck') => { setBy(v); setOffset(0); remember('runway-inout-by', v) }

  return (
    <section aria-label="In vs out" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-muted">In vs out</h2>
        <div role="tablist" aria-label="In vs out by" className="flex rounded-lg bg-surface-2 border border-line p-0.5">
          {(['month', 'paycheck'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={by === v} onClick={() => pick(v)}
              className={`h-7 px-2.5 rounded-md border-0 text-xs font-bold cursor-pointer ${by === v ? 'bg-accent text-accent-ink' : 'bg-transparent text-muted'}`}>{v === 'month' ? 'Month' : 'Paycheck'}</button>
          ))}
        </div>
      </div>
      {!f ? <p className="m-0 text-sm text-muted">Set your payday on the Money tab to see this by paycheck.</p> : <FlowBody f={f} offset={offset} setOffset={setOffset} open={open} setOpen={setOpen} show={show} today={today} />}
      <Ideas m={m} today={today} />
    </section>
  )
}

function FlowBody({ f, offset, setOffset, open, setOpen, show, today }: {
  f: Flow; offset: number; setOffset: (n: number) => void; open: boolean; setOpen: (b: boolean) => void; show: (n: number) => string; today: string
}) {
  const current = f.from <= today && today <= f.to
  const net = Math.round((f.inSoFar - f.outSoFar - f.savedSoFar) * 100) / 100
  const netEnd = Math.round((f.inEnd - f.outEnd - f.savedEnd) * 100) / 100
  const top = Math.max(f.inSoFar, f.outSoFar + f.savedSoFar, 1)
  const bar = (n: number) => `${Math.min(100, (n / top) * 100)}%`
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Earlier" onClick={() => setOffset(offset - 1)} className="size-8 rounded-lg border border-line bg-surface text-fg cursor-pointer">‹</button>
        <b className="flex-1 text-center">{f.label}{current ? ' · so far' : ''}</b>
        <button type="button" aria-label="Later" disabled={offset >= 0} onClick={() => setOffset(offset + 1)} className="size-8 rounded-lg border border-line bg-surface text-fg cursor-pointer disabled:opacity-30">›</button>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <Row label="In" amount={show(f.inSoFar)} width={bar(f.inSoFar)} color="var(--pay)" />
        <Row label="Out" amount={show(f.outSoFar)} width={bar(f.outSoFar)} color="var(--bad)" />
        <Row label="Saved" amount={show(f.savedSoFar)} width={bar(f.savedSoFar)} color="var(--accent-hi)" />
      </div>

      <b className={net >= 0 ? 'text-pay-ink' : 'text-bad'}>
        {net >= 0 ? `+${show(net)} more came in than went out` : `${show(-net)} more went out than came in`}
        {f.savedSoFar > 0 ? <span className="font-normal text-muted"> (after saving {show(f.savedSoFar)})</span> : null}
      </b>
      {current && f.through < f.to && (
        <span className="text-xs text-muted">
          By {shortDate(f.to)}, with what's scheduled: in {show(f.inEnd)} · out {show(f.outEnd)} · saved {show(f.savedEnd)} →{' '}
          <b className={netEnd >= 0 ? 'text-pay-ink' : 'text-bad'}>{netEnd >= 0 ? `+${show(netEnd)}` : `−${show(-netEnd)}`}</b>
        </span>
      )}

      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="self-start bg-transparent border-0 p-0 text-accent text-sm font-bold cursor-pointer">
        {open ? 'Hide breakdown' : 'See breakdown'}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" data-testid="inout-breakdown">
          <span className="text-xs font-bold uppercase tracking-wider text-muted col-span-2 mt-1">In</span>
          {IN_GROUPS.filter((g) => f.ins[g]).map((g) => <Line key={g} label={g === 'Paychecks' && f.payEstimated ? 'Paychecks (usual amount)' : g} v={show(f.ins[g])} />)}
          <span className="text-xs font-bold uppercase tracking-wider text-muted col-span-2 mt-1">Out</span>
          {OUT_GROUPS.filter((g) => f.outs[g]).map((g) => <Line key={g} label={g} v={show(f.outs[g])} />)}
          {f.unmarked > 0 && <p className="col-span-2 m-0 mt-1 text-xs text-muted">Includes {show(f.unmarked)} due but not marked paid yet. Bills count on their due day; mark them paid and the real amount is used.</p>}
          {f.noAmount.length > 0 && <p className="col-span-2 m-0 mt-1 text-xs font-bold text-warn">No amount set, so not counted: {f.noAmount.join(', ')}. Add the amount on Bills.</p>}
          {f.payEstimated > 0 && <p className="col-span-2 m-0 mt-1 text-xs text-muted">Tap a payday on the calendar and "Enter real amount" to use what actually landed.</p>}
          <p className="col-span-2 m-0 mt-1 text-xs text-muted">Only money that left NFCU or SoFi. Card purchases count when you pay the card. Cash = cash you took out.</p>
        </div>
      )}
    </>
  )
}

function Row({ label, amount, width, color }: { label: string; amount: string; width: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-muted font-bold">{label}</span>
      <span className="flex-1 h-3 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width, background: color }} /></span>
      <b className="w-24 text-right tnum">{amount}</b>
    </div>
  )
}
const Line = ({ label, v }: { label: string; v: string }) => <><span>{label}</span><span className="text-right tnum">{v}</span></>

/** 💡 The top 3 ideas to free up cash; the rest stay folded. */
function Ideas({ m, today }: { m: MoneyData; today: string }) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const ideas = cashIdeas(m, today)
  if (!ideas.length) return null
  const shown = all ? ideas : ideas.slice(0, 3)
  return (
    <div className="border-t border-line pt-3 flex flex-col gap-2" data-testid="ideas">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="self-start bg-transparent border-0 p-0 text-sm font-bold text-fg cursor-pointer">
        💡 {ideas.length} idea{ideas.length === 1 ? '' : 's'} to free up cash <span className="text-accent">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          {shown.map((i) => (
            <div key={i.key} className="rounded-xl bg-surface-2 px-3 py-2.5 flex gap-2.5">
              <span aria-hidden="true">{i.icon}</span>
              <span className="flex-1 min-w-0 text-sm"><b className="block">{i.title}</b><span className="text-muted">{i.detail}</span></span>
            </div>
          ))}
          {ideas.length > 3 && !all && <button type="button" onClick={() => setAll(true)} className="self-start bg-transparent border-0 p-0 text-accent text-sm font-bold cursor-pointer">{ideas.length - 3} more</button>}
        </>
      )}
    </div>
  )
}
