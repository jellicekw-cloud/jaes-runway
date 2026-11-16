import { useEffect, useRef, useState, type ReactNode } from 'react'
import { money, shortDate } from '../lib/dates'
import {
  BUDGET_CATS, CAT_COLOR, CAT_SHORT, EMPTY_EXTRAS, bankColor, budgetMonth, budgetYear, copyLastMonth, lineCat, lineNameFromKey, loadBudgetExtras,
  monthName, planStatus, setBudgetAmount, setLineCategory, setMonthNote, shiftMonth, spendKeys,
  type BudgetCat, type BudgetCatRow, type BudgetExtras, type BudgetLine, type BudgetMonth, type YearMonth,
} from '../lib/budget'
import {
  challengeSteps, estimateBalance, markPaid, parseMoney, saveDeposit, setAccountBalance, undoDeposit, undoPayment, type MoneyData,
} from '../lib/money'

// Your Clover Brook budget sheet, on the computer: Budget vs Actual for each category,
// the pie chart, income vs expenses by month, and every line folded under its category.

const ORANGE = '#E8562A'
const NAVY = '#22405F'
const remember = (k: string, v?: string) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch { /* fine */ } return null }

/** Your budget amounts, moved lines and notes, loaded once and reloaded after a change. */
export function useBudgetExtras(): [BudgetExtras, () => Promise<void>] {
  const [x, setX] = useState<BudgetExtras>(EMPTY_EXTRAS)
  const reload = async () => { try { setX(await loadBudgetExtras()) } catch { /* not set up yet */ } }
  useEffect(() => { void reload() }, [])
  return [x, reload]
}

interface Props { m: MoneyData; today: string; loaded: boolean; reloadMoney: () => Promise<void> }

export default function BudgetView({ m, today, loaded, reloadMoney }: Props) {
  const [x, reloadExtras] = useBudgetExtras()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [view, setView] = useState<'month' | 'year'>('month')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<Set<BudgetCat>>(() => new Set((remember('runway-budget-open') ?? 'House').split('|').filter(Boolean) as BudgetCat[]))
  const pieRef = useRef<SVGSVGElement>(null)
  const barsRef = useRef<SVGSVGElement>(null)

  async function run(change: () => Promise<unknown>) {
    setError('')
    try { await change(); await Promise.all([reloadMoney(), reloadExtras()]) } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
  }
  const toggle = (c: BudgetCat, force?: boolean) => {
    const next = new Set(open)
    if (force ?? !next.has(c)) next.add(c); else next.delete(c)
    setOpen(next); remember('runway-budget-open', [...next].join('|'))
  }

  if (!loaded) return <main className="flex-1 safe-x py-5 text-muted">Loading…</main>

  const b = budgetMonth(m, x, month, today)
  const year = Number(month.slice(0, 4))
  const yearRows = budgetYear(m, x, year, today)
  const hide = m.settings?.hide_balances ?? false
  const name = m.settings?.display_name || 'Jae'

  async function download() {
    setBusy('excel'); setError('')
    try {
      const { downloadBudgetExcel } = await import('../lib/budgetExcel')
      await downloadBudgetExcel({ m, b, year: yearRows, title: `${name}'s ${year} Budget`, pie: pieRef.current, bars: barsRef.current })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy('')
  }
  async function copy() {
    setBusy('copy')
    await run(async () => {
      const n = await copyLastMonth(x, month)
      if (!n) throw new Error(`Nothing typed in ${monthName(shiftMonth(month, -1))} to copy. Bills, minimums and auto-pay already fill in by themselves.`)
    })
    setBusy('')
  }

  return (
    <main className="flex-1 safe-x py-5 flex flex-col gap-6 w-full max-w-[1440px] mx-auto" data-testid="budget">
      <header className="rounded-2xl border border-line bg-surface px-5 py-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-col flex-[1_1_240px]">
          <span className="text-xs font-bold tracking-widest uppercase text-muted">Clover Brook Budget</span>
          <h1 className="m-0 text-3xl font-extrabold" style={{ color: ORANGE }}>{name}'s {year} Budget</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={view === 'month' ? 'Previous month' : 'Previous year'} onClick={() => setMonth(shiftMonth(month, view === 'month' ? -1 : -12))}
            className="size-11 rounded-xl border border-line bg-surface text-fg text-xl cursor-pointer">‹</button>
          <b className="text-xl min-w-[180px] text-center">{view === 'month' ? monthName(month) : year}</b>
          <button type="button" aria-label={view === 'month' ? 'Next month' : 'Next year'} onClick={() => setMonth(shiftMonth(month, view === 'month' ? 1 : 12))}
            className="size-11 rounded-xl border border-line bg-surface text-fg text-xl cursor-pointer">›</button>
          {month !== today.slice(0, 7) && <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="h-11 px-3 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer">This month</button>}
        </div>
        <div role="tablist" aria-label="Budget view" className="flex rounded-xl bg-surface-2 border border-line p-1">
          {(['month', 'year'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className="h-9 px-4 rounded-lg border-0 font-bold cursor-pointer" style={view === v ? { background: NAVY, color: '#fff' } : { background: 'transparent', color: 'var(--muted)' }}>
              {v === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
        {view === 'month' && (
          <button type="button" disabled={busy === 'copy' || !x.ready} onClick={() => void copy()} className="h-11 px-4 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer disabled:opacity-50">
            Copy last month's budget
          </button>
        )}
        <button type="button" disabled={busy === 'excel'} onClick={() => void download()} className="h-11 px-4 rounded-xl border-0 text-white font-bold cursor-pointer disabled:opacity-60" style={{ background: NAVY }}>
          {busy === 'excel' ? 'Making the file…' : 'Download Excel'}
        </button>
      </header>

      {!x.ready && (
        <p role="status" className="m-0 rounded-xl border border-warn bg-warn-soft px-4 py-3 text-sm font-bold">
          To save budget amounts, run <code>supabase/20_budget.sql</code> once in Supabase → SQL Editor. Until then the page shows the usual amounts (bills, minimums, auto-pay) and what really went out.
        </p>
      )}
      {error && <p role="alert" className="m-0 rounded-xl border border-bad bg-bad/10 px-4 py-3 font-bold text-bad">{error}</p>}

      {view === 'month'
        ? <MonthPage m={m} x={x} b={b} today={today} hide={hide} open={open} toggle={toggle} run={run} yearRows={yearRows} setMonth={setMonth} pieRef={pieRef} barsRef={barsRef} />
        : <YearPage rows={yearRows} barsRef={barsRef} onMonth={(mo) => { setMonth(mo); setView('month') }} pieRef={pieRef} />}
    </main>
  )
}

// ---------------------------------------------------------------------------

type Run = (change: () => Promise<unknown>) => Promise<void>

function Pill({ children }: { children: ReactNode }) {
  return <h2 className="m-0 self-center rounded-full px-12 py-2 text-xl font-bold text-white" style={{ background: ORANGE }}>{children}</h2>
}

function MonthPage({ m, x, b, today, hide, open, toggle, run, yearRows, setMonth, pieRef, barsRef }: {
  m: MoneyData; x: BudgetExtras; b: BudgetMonth; today: string; hide: boolean; open: Set<BudgetCat>; toggle: (c: BudgetCat, force?: boolean) => void
  run: Run; yearRows: YearMonth[]; setMonth: (mo: string) => void; pieRef: React.RefObject<SVGSVGElement>; barsRef: React.RefObject<SVGSVGElement>
}) {
  const current = b.from <= today && today <= b.to
  const over = b.actualTotal - b.budgetTotal
  const openCat = (c: BudgetCat) => {
    toggle(c, true)
    setTimeout(() => document.getElementById(`cat-${c.replace(/\s/g, '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  return (
    <>
      <MonthNote x={x} month={b.month} run={run} />

      <Pill>Monthly Income</Pill>
      <section aria-label="Monthly income" className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {b.panels.map((p) => <BankPanel key={p.account.id} p={p} m={m} today={today} hide={hide} />)}
        <SavingsPanel m={m} today={today} hide={hide} run={run} />
      </section>

      <Pill>Monthly Budget</Pill>
      <section aria-label="Budget summary" className="flex flex-wrap gap-4 items-stretch">
        <div className="flex-[999_1_620px] min-w-0 rounded-2xl border border-line bg-surface overflow-hidden">
          <div className="grid grid-cols-[2.2fr_1fr_1fr_0.8fr_1.6fr] gap-2 px-4 py-2.5 text-xs font-bold tracking-wider text-white" style={{ background: NAVY }}>
            <span>CATEGORY</span><span className="text-right">BUDGET</span><span className="text-right">ACTUAL</span><span className="text-right">% OF SPENDING</span><span>USED</span>
          </div>
          {b.cats.map((c, i) => <SummaryRow key={c.cat} c={c} total={b.actualTotal} odd={i % 2 === 1} onOpen={() => openCat(c.cat)} />)}
          <div className="grid grid-cols-[2.2fr_1fr_1fr_0.8fr_1.6fr] gap-2 px-4 py-3 font-extrabold tnum">
            <span>Total</span><span className="text-right">{money(b.budgetTotal)}</span><span className="text-right">{money(b.actualTotal)}</span><span />
            <span className={over > 0.005 ? 'text-warn' : 'text-pay-ink'}>{over > 0.005 ? `${money(over)} over` : `${money(-over)} left`}</span>
          </div>
        </div>

        <div className="flex-[1_1_260px] rounded-2xl border border-line bg-surface overflow-hidden text-center flex flex-col" data-testid="budget-totals">
          <Big label="Income" value={money(b.incomeTotal)} color={ORANGE} />
          <Big label="Expense total" value={money(b.actualTotal)} color={ORANGE} />
          <Big label="Difference" value={`${b.difference >= 0 ? '+' : '−'}${money(Math.abs(b.difference))}`} color={b.difference >= 0 ? '#15803D' : '#DC2626'} />
          {current && b.through < b.to && (
            <p className="m-0 px-3 py-2 text-xs text-muted">So far, through {shortDate(b.through)}. By {shortDate(b.to)} with what's scheduled: in {money(b.incomeEnd)} · out {money(b.outEnd)}</p>
          )}
        </div>

        <Donut b={b} onOpen={openCat} svgRef={pieRef} />
      </section>

      <Bars rows={yearRows} month={b.month} onMonth={setMonth} svgRef={barsRef} />

      <section aria-label="Category details" className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="grid grid-cols-[44px_2fr_1fr_1fr_1fr_2fr] gap-2 px-4 py-2.5 text-xs font-bold tracking-wider text-white" style={{ background: NAVY }}>
          <span className="sr-only">Paid</span><span aria-hidden="true" /><span>CATEGORY</span><span className="text-right">BUDGET</span><span className="text-right">ACTUAL</span><span className="pl-2">PAID FROM</span><span>COMMENTS</span>
        </div>
        {b.cats.map((c, i) => <CategoryBlock key={c.cat} c={c} i={i} b={b} m={m} x={x} today={today} open={open.has(c.cat)} toggle={() => toggle(c.cat)} run={run} />)}
        <p className="m-0 px-4 py-3 text-xs text-muted border-t border-line">
          Actual is money that left NFCU or SoFi, counted the same way as In vs out: bills and card minimums count on their due day (☑ when you mark them paid), auto-pay by itself, card purchases when you pay the card. Click a budget amount to change it for this month.
          {b.noAmount.length > 0 && <b className="text-warn"> No amount set: {b.noAmount.join(', ')} (add it on the Bills tab).</b>}
        </p>
      </section>
    </>
  )
}

function Big({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <>
      <div className="py-1.5 font-bold text-white" style={{ background: color }}>{label}</div>
      <b className="block py-2 text-3xl tnum" style={{ color }}>{value}</b>
    </>
  )
}

function SummaryRow({ c, total, odd, onOpen }: { c: BudgetCatRow; total: number; odd: boolean; onOpen: () => void }) {
  const over = c.actual - c.budget > 0.005
  const used = c.budget > 0 ? Math.min(100, (c.actual / c.budget) * 100) : c.actual > 0 ? 100 : 0
  const pct = total > 0 ? Math.round((c.actual / total) * 100) : 0
  return (
    <button type="button" onClick={onOpen} className={`w-full grid grid-cols-[2.2fr_1fr_1fr_0.8fr_1.6fr] gap-2 items-center px-4 py-2.5 border-0 border-b border-line text-left text-fg cursor-pointer text-sm ${odd ? 'bg-surface-2' : 'bg-surface'}`}>
      <span className="flex items-center gap-2 font-bold"><span aria-hidden="true" className="size-2.5 rounded-sm shrink-0" style={{ background: CAT_COLOR[c.cat] }} />{c.cat}</span>
      <span className="text-right text-muted tnum">{money(c.budget)}</span>
      <b className={`text-right tnum ${over ? 'text-warn' : ''}`}>{money(c.actual)}</b>
      <span className="text-right text-muted">{pct}%</span>
      <span className="flex items-center gap-2">
        <span className="flex-1 h-2 rounded-full bg-line overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${used}%`, background: over ? '#C2410C' : NAVY }} /></span>
        <span className={`text-xs font-bold min-w-[78px] ${over ? 'text-warn' : 'text-muted'}`}>{over ? `${money(c.actual - c.budget)} over` : c.budget ? `${Math.round(used)}% used` : ''}</span>
      </span>
    </button>
  )
}

function Donut({ b, onOpen, svgRef }: { b: BudgetMonth; onOpen: (c: BudgetCat) => void; svgRef: React.RefObject<SVGSVGElement> }) {
  const [hover, setHover] = useState<BudgetCat | null>(null)
  const r = 76, C = 2 * Math.PI * r
  const parts = b.cats.filter((c) => c.actual > 0)
  const total = parts.reduce((t, c) => t + c.actual, 0)
  let at = 0
  const shown = hover ? b.cats.find((c) => c.cat === hover) : null
  return (
    <figure className="flex-[1_1_300px] m-0 rounded-2xl border border-line bg-surface p-4 flex flex-col items-center gap-3" aria-label="Where the money went">
      <svg ref={svgRef} width="220" height="220" viewBox="0 0 220 220" role="img" aria-label="Pie chart of spending by category">
        <circle cx="110" cy="110" r={r} fill="none" stroke="#E2E8F0" strokeWidth="36" />
        <g transform="rotate(-90 110 110)">
          {parts.map((c) => {
            const len = (c.actual / total) * C
            const el = (
              <circle key={c.cat} cx="110" cy="110" r={r} fill="none" stroke={CAT_COLOR[c.cat]} strokeWidth={hover === c.cat ? 44 : 36}
                strokeDasharray={`${len} ${C}`} strokeDashoffset={-at} style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(c.cat)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(c.cat)}>
                <title>{`${c.cat}: ${money(c.actual)} (${Math.round((c.actual / total) * 100)}%)`}</title>
              </circle>
            )
            at += len
            return el
          })}
        </g>
        <text x="110" y="104" textAnchor="middle" fontSize="13" fill="#64748B" fontFamily="Inter, sans-serif">{shown ? CAT_SHORT[shown.cat] : 'Spent'}</text>
        <text x="110" y="126" textAnchor="middle" fontSize="19" fontWeight="800" fill={shown ? CAT_COLOR[shown.cat] : NAVY} fontFamily="Inter, sans-serif">
          {'$' + Math.round(shown ? shown.actual : total).toLocaleString('en-US')}
        </text>
      </svg>
      <figcaption className="w-full grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {b.cats.map((c) => (
          <button key={c.cat} type="button" onClick={() => onOpen(c.cat)} onMouseEnter={() => setHover(c.cat)} onMouseLeave={() => setHover(null)}
            className="flex items-center gap-1.5 bg-transparent border-0 p-0 text-left text-fg cursor-pointer">
            <span aria-hidden="true" className="size-2.5 rounded-sm shrink-0" style={{ background: CAT_COLOR[c.cat] }} />
            <span className="truncate">{CAT_SHORT[c.cat]}</span>
            <span className="ml-auto text-muted tnum">{total ? Math.round((c.actual / total) * 100) : 0}%</span>
          </button>
        ))}
      </figcaption>
    </figure>
  )
}

/** Income vs expenses for each month of the year (months Runway hasn't tracked stay empty). */
function Bars({ rows, month, onMonth, svgRef }: { rows: YearMonth[]; month?: string; onMonth: (m: string) => void; svgRef: React.RefObject<SVGSVGElement> }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.b?.incomeTotal ?? 0, r.b?.actualTotal ?? 0)))
  const W = 1200, H = 210, top = 18, base = 176, colW = W / 12
  const h = (v: number) => (v / max) * (base - top)
  const year = rows[0]?.month.slice(0, 4)
  return (
    <section aria-label="Income vs expenses by month" className="rounded-2xl border border-line bg-surface px-5 py-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-4">
        <h3 className="m-0 text-base font-bold">Income vs expenses · {year}</h3>
        <Legend color="#15803D" label="Income" /><Legend color={ORANGE} label="Expenses" />
        <span className="text-xs text-muted">Months fill in as Runway tracks them. Click a month to open it.</span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Income and expenses for each month of ${year}`} style={{ maxHeight: 240 }}>
        <rect x="0" y="0" width={W} height={H} fill="#FFFFFF" opacity="0" />
        <line x1="0" x2={W} y1={base} y2={base} stroke="#CBD5E1" />
        {rows.map((r, i) => {
          const x0 = i * colW + colW / 2
          const inc = r.b?.incomeTotal ?? 0, out = r.b?.actualTotal ?? 0
          const bold = r.month === month
          return (
            <g key={r.month} style={{ cursor: r.tracked ? 'pointer' : 'default' }} onClick={() => r.tracked && onMonth(r.month)}>
              <rect x={i * colW} y="0" width={colW} height={H} fill={bold ? '#F1F5F9' : 'transparent'} />
              {r.tracked ? (
                <>
                  <rect x={x0 - 22} y={base - h(inc)} width="20" height={h(inc)} rx="4" fill="#15803D"><title>{`${r.label}: in ${money(inc)}`}</title></rect>
                  <rect x={x0 + 2} y={base - h(out)} width="20" height={h(out)} rx="4" fill={ORANGE}><title>{`${r.label}: out ${money(out)}`}</title></rect>
                </>
              ) : <text x={x0} y={base - 8} textAnchor="middle" fontSize="14" fill="#94A3B8">—</text>}
              <text x={x0} y={base + 22} textAnchor="middle" fontSize="14" fontWeight={bold ? 800 : 500} fill="#475569" fontFamily="Inter, sans-serif">{r.label}</text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}
const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5 text-sm text-muted"><span aria-hidden="true" className="size-3 rounded-sm" style={{ background: color }} />{label}</span>
)

// ---------------------------------------------------------------------------
// Income panels
// ---------------------------------------------------------------------------

function BankPanel({ p, m, today, hide }: { p: BudgetMonth['panels'][number]; m: MoneyData; today: string; hide: boolean }) {
  const col = bankColor(p.label)
  const est = estimateBalance(m, p.account, today).estimate
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden" data-testid={`panel-${p.label}`}>
      <div className="py-2.5 text-center font-extrabold text-white" style={{ background: col.solid }}>{p.label === 'NFCU' ? 'Navy Federal CU' : p.label}</div>
      <div className="px-4 pt-1 pb-3 flex flex-col text-sm">
        {p.rows.length === 0 && <span className="py-2 text-muted">Nothing came in yet this month.</span>}
        {p.rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-line last:border-b-0">
            <span className="flex-1">{r.label}</span>
            {r.tag && <span className={`text-[11px] font-bold ${r.tag === 'REAL' ? 'text-pay-ink' : 'text-muted'}`}>{r.tag === 'REAL' ? 'REAL ✓' : r.tag}</span>}
            <b className={`tnum ${r.tag === 'EXPECTED' ? 'text-muted font-normal' : ''}`}>{money(r.amount)}</b>
          </div>
        ))}
        <div className="flex justify-between pt-2.5 font-bold"><span>Came in so far</span><span className="tnum" style={{ color: col.solid }}>{money(p.total)}</span></div>
        {est !== null && <div className="flex justify-between pt-1 text-muted"><span>Balance now (estimated)</span><span className="tnum">{hide ? '••••' : money(est)}</span></div>}
      </div>
    </div>
  )
}

function SavingsPanel({ m, today, hide, run }: { m: MoneyData; today: string; hide: boolean; run: Run }) {
  const accts = m.accounts.filter((a) => ['savings', 'vault', 'stash', 'invest'].includes(a.kind)).sort((a, b) => a.sort - b.sort)
  const plan = planStatus(m, today)
  const [editing, setEditing] = useState<string | null>(null)
  const [val, setVal] = useState('')
  const show = (n: number | null) => (n === null ? '—' : hide ? '••••' : money(n))
  const counted = accts.filter((a) => a.kind !== 'invest').reduce((t, a) => t + (estimateBalance(m, a, today).estimate ?? 0), 0)
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden" data-testid="panel-savings">
      <div className="py-2.5 text-center font-extrabold text-white" style={{ background: '#0F766E' }}>Savings</div>
      <div className="px-4 pt-1 pb-3 flex flex-col text-sm">
        {accts.map((a) => {
          const est = estimateBalance(m, a, today).estimate
          const isPlan = a.kind === 'vault' && plan
          return (
            <div key={a.id} className="py-1.5 border-b border-line last:border-b-0 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="flex-1">{a.kind === 'invest' ? `${a.name} (tracking only)` : a.kind === 'vault' ? 'SoFi Vault · 52-week plan' : a.kind === 'stash' ? 'Emergency stash' : a.institution ?? a.name}</span>
                {a.kind === 'invest' && editing !== a.id && (
                  <button type="button" onClick={() => { setEditing(a.id); setVal(a.balance === null ? '' : String(a.balance)) }} className="bg-transparent border-0 p-0 text-accent text-xs font-bold cursor-pointer">
                    {a.balance === null ? 'Add balance' : 'Update'}
                  </button>
                )}
                {editing === a.id ? (
                  <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const n = parseMoney(val); void run(() => setAccountBalance(a.id, n)).then(() => setEditing(null)) }}>
                    <input autoFocus aria-label={`${a.name} balance`} value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" className="w-24 h-8 rounded-lg border border-line bg-surface px-2 text-right tnum" />
                    <button type="submit" className="h-8 px-2 rounded-lg border-0 bg-accent text-accent-ink text-xs font-bold cursor-pointer">Save</button>
                    <button type="button" onClick={() => setEditing(null)} className="h-8 px-1 bg-transparent border-0 text-muted text-xs cursor-pointer">Cancel</button>
                  </form>
                ) : <b className={`tnum ${a.kind === 'invest' ? 'text-muted' : ''}`}>{show(est)}</b>}
              </div>
              {isPlan && plan && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="plan-status">
                  <span>{plan.doneCount} of {plan.total} paydays · {hide ? '••••' : money(plan.saved)} of {money(plan.goal)}</span>
                  {plan.next && !plan.due && <span className="font-bold text-fg">Next {money(plan.next.amount).replace('.00', '')} · {shortDate(plan.next.date)}</span>}
                  {plan.behind > 0 && <span className="font-bold text-warn">{money(plan.behind)} behind</span>}
                  {plan.next && plan.due && (
                    <button type="button" onClick={() => void run(() => saveDeposit(m, plan.next!, today))}
                      className="h-8 px-3 rounded-lg border-0 bg-pay text-white text-xs font-bold cursor-pointer">Added {money(plan.next.amount).replace('.00', '')} ✓</button>
                  )}
                  {!plan.next && <span className="font-bold text-pay-ink">All {plan.total} done 🎉</span>}
                </div>
              )}
            </div>
          )
        })}
        <div className="flex justify-between pt-2.5 font-bold"><span>Total saved</span><span className="tnum" style={{ color: '#0F766E' }}>{hide ? '••••' : money(counted)}</span></div>
        <span className="text-xs text-muted">Fidelity isn't counted in the total, Can I afford it? or anywhere else.</span>
      </div>
    </div>
  )
}

function MonthNote({ x, month, run }: { x: BudgetExtras; month: string; run: Run }) {
  const saved = x.notes.find((n) => n.month === month)?.note ?? ''
  const [v, setV] = useState(saved)
  useEffect(() => setV(saved), [saved, month])
  if (!x.ready) return null
  return (
    <label className="rounded-2xl border border-line bg-surface px-4 py-3 flex items-center gap-3">
      <span className="text-xs font-bold tracking-widest uppercase text-muted shrink-0">Notes for {monthName(month)}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== saved) void run(() => setMonthNote(month, v)) }}
        placeholder="Extra income, what's different this month…" className="flex-1 min-w-0 h-9 rounded-lg border border-line bg-surface-2 px-3 text-fg" />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Category details
// ---------------------------------------------------------------------------

function CategoryBlock({ c, i, b, m, x, today, open, toggle, run }: {
  c: BudgetCatRow; i: number; b: BudgetMonth; m: MoneyData; x: BudgetExtras; today: string; open: boolean; toggle: () => void; run: Run
}) {
  const over = c.actual - c.budget > 0.005
  const [adding, setAdding] = useState('')
  const present = new Set(b.cats.flatMap((y) => y.lines.map((l) => l.key)))
  const canAdd = spendKeys().filter((k) => !present.has(k) && lineCat(m, x, k) === c.cat)
  return (
    <div id={`cat-${c.cat.replace(/\s/g, '-')}`} data-testid={`cat-${c.cat}`}>
      <button type="button" aria-expanded={open} onClick={toggle}
        className="w-full flex items-center gap-3 border-0 border-t border-line px-4 py-2.5 text-left font-bold cursor-pointer"
        style={open ? { background: CAT_COLOR[c.cat], color: '#fff' } : { background: i % 2 ? 'var(--surface-2)' : 'var(--surface)', color: 'var(--fg)' }}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {!open && <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: CAT_COLOR[c.cat] }} />}
        <span className="flex-1">{c.cat} <span className={`font-normal text-sm ${open ? 'text-white/80' : 'text-muted'}`}>· {c.lines.length} line{c.lines.length === 1 ? '' : 's'}</span></span>
        <span className="tnum text-sm">{money(c.budget)} budget · {money(c.actual)} actual{over ? <span className={open ? '' : 'text-warn'}> · {money(c.actual - c.budget)} over</span> : null}</span>
      </button>
      {open && (
        <div>
          {c.lines.length === 0 && <p className="m-0 px-4 py-3 text-sm text-muted">Nothing here this month.</p>}
          {c.lines.map((l) => <LineRow key={l.key} l={l} b={b} m={m} today={today} run={run} />)}
          {canAdd.length > 0 && x.ready && (
            <div className="px-4 py-2 flex items-center gap-2 text-sm border-t border-line">
              <select aria-label={`Add a budget line to ${c.cat}`} value={adding} onChange={(e) => setAdding(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-fg">
                <option value="">+ Budget for…</option>
                {canAdd.map((k) => <option key={k} value={k}>{lineNameFromKey(m, k)}</option>)}
              </select>
              {adding && <AmountForm initial="" label={lineNameFromKey(m, adding)} onSave={(n) => run(() => setBudgetAmount(b.month, adding, n ?? 0)).then(() => setAdding(''))} onCancel={() => setAdding('')} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LineRow({ l, b, m, today, run }: { l: BudgetLine; b: BudgetMonth; m: MoneyData; today: string; run: Run }) {
  const [edit, setEdit] = useState(false)
  const chip = bankColor(l.from)
  const over = l.actual - l.budget > 0.005 && l.budget > 0
  const isPlan = l.key === 'save:challenge'
  const steps = isPlan ? challengeSteps(m).filter((s) => s.date >= b.from && s.date <= b.to) : []

  let box: ReactNode = null
  if (l.auto) box = <span className="text-[11px] font-bold text-muted" title="Comes out by itself">AUTO</span>
  else if (isPlan && steps.length) {
    const next = steps.find((s) => !s.deposit)
    const last = [...steps].reverse().find((s) => s.deposit)
    box = <input type="checkbox" checked={!next} aria-label={`Saved: ${l.name}`} className="size-[18px] cursor-pointer"
      onChange={() => void run(() => (next ? saveDeposit(m, next, today) : undoDeposit(last!)))} />
  } else if (l.dueCount > 0) {
    const nextO = l.open[0]
    const lastPaid = l.paid[l.paid.length - 1]
    box = <input type="checkbox" checked={l.open.length === 0} aria-label={`Paid: ${l.name}`} className="size-[18px] cursor-pointer" disabled={Boolean(nextO && !nextO.amount)}
      title={nextO && !nextO.amount ? 'Add the amount on the Bills tab first' : undefined}
      onChange={() => void run(() => (nextO ? markPaid(m, nextO, nextO.amount ?? 0) : undoPayment(m, lastPaid)))} />
  }

  const notes: string[] = []
  if (l.auto && l.nextDue) notes.push(`Auto-pay · next ${shortDate(l.nextDue)}`)
  else if (l.auto) notes.push('Auto-pay')
  if (!l.auto && l.dueCount > 1) notes.push(`${l.paidCount} of ${l.dueCount} paid`)
  if (l.unmarked > 0) notes.push(`${money(l.unmarked)} due, not marked paid`)
  if (!l.auto && !isPlan && l.nextDue && l.nextDue > b.through) notes.push(`Due ${shortDate(l.nextDue)}`)
  if (isPlan && steps.length) { const n = steps.find((s) => !s.deposit); if (n) notes.push(`${n.date <= today ? 'Add' : 'Next'} ${money(n.amount).replace('.00', '')} · ${shortDate(n.date)}`) }
  if (l.noAmount) notes.push('No amount set')
  if (l.note) notes.push(l.note)
  if (l.key === 'spend:fastfood' && l.actual) notes.push('From your NFCU purchase alerts')
  if (l.movedCat) notes.push('Moved here')

  return (
    <div className="border-t border-line" data-testid={`line-${l.key}`}>
      <div className="grid grid-cols-[44px_2fr_1fr_1fr_1fr_2fr] gap-2 items-center px-4 py-2 text-sm">
        <span className="flex items-center">{box}</span>
        <span className="min-w-0 truncate">{l.name}</span>
        <button type="button" onClick={() => setEdit(!edit)} title="Change the budget for this month"
          className={`justify-self-end bg-transparent border-0 border-b border-dashed border-line p-0 tnum cursor-pointer ${l.typedBudget ? 'text-fg font-bold' : 'text-muted'}`}>
          {money(l.budget)}
        </button>
        <b className={`text-right tnum ${over ? 'text-warn' : ''} ${!l.actual ? 'text-muted font-normal' : ''}`}>{l.actual ? money(l.actual) : '—'}</b>
        <span className="pl-2">{l.from && <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: chip.bg, color: chip.fg }}>{l.from}</span>}</span>
        <span className="text-xs text-muted">{notes.join(' · ')}</span>
      </div>
      {edit && <LineEditor l={l} b={b} run={run} done={() => setEdit(false)} />}
    </div>
  )
}

function LineEditor({ l, b, run, done }: { l: BudgetLine; b: BudgetMonth; run: Run; done: () => void }) {
  const [cat, setCat] = useState<BudgetCat>(l.cat)
  return (
    <div className="px-4 pb-3 pl-[60px] flex flex-wrap items-center gap-3 text-sm bg-surface-2 pt-2">
      <AmountForm initial={String(l.budget)} label={l.name}
        onSave={(n) => run(async () => {
          if (l.typedBudget || Math.abs((n ?? 0) - l.budget) > 0.004) await setBudgetAmount(b.month, l.key, n)   // only a real change becomes this month's budget
          if (cat !== l.cat) await setLineCategory(l.key, cat)
        }).then(done)} onCancel={done} />
      <label className="flex items-center gap-1.5">
        <span className="text-muted">Category</span>
        <select value={cat} onChange={(e) => setCat(e.target.value as BudgetCat)} className="h-9 rounded-lg border border-line bg-surface px-2 text-fg">
          {BUDGET_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {l.typedBudget && l.usualBudget > 0 && (
        <button type="button" onClick={() => void run(() => setBudgetAmount(b.month, l.key, null)).then(done)} className="bg-transparent border-0 p-0 text-accent font-bold cursor-pointer">
          Use the usual {money(l.usualBudget)}
        </button>
      )}
      {l.movedCat && (
        <button type="button" onClick={() => void run(() => setLineCategory(l.key, null)).then(done)} className="bg-transparent border-0 p-0 text-accent font-bold cursor-pointer">Put back in its usual category</button>
      )}
      <span className="text-xs text-muted basis-full">The budget is for {monthName(b.month)} (Copy last month's budget carries it forward). A new category applies to every month.</span>
    </div>
  )
}

function AmountForm({ initial, label, onSave, onCancel }: { initial: string; label: string; onSave: (n: number | null) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  return (
    <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const n = parseMoney(v); void onSave(n === null ? 0 : Math.max(0, n)) }}>
      <span className="text-muted">Budget</span>
      <input autoFocus aria-label={`Budget for ${label}`} value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" placeholder="$0"
        className="w-28 h-9 rounded-lg border border-line bg-surface px-2 text-right tnum text-fg" />
      <button type="submit" className="h-9 px-3 rounded-lg border-0 bg-accent text-accent-ink font-bold cursor-pointer">Save</button>
      <button type="button" onClick={onCancel} className="h-9 px-2 bg-transparent border-0 text-muted cursor-pointer">Cancel</button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Year
// ---------------------------------------------------------------------------

function YearPage({ rows, barsRef, pieRef, onMonth }: { rows: YearMonth[]; barsRef: React.RefObject<SVGSVGElement>; pieRef: React.RefObject<SVGSVGElement>; onMonth: (m: string) => void }) {
  const tracked = rows.filter((r) => r.b)
  const sum = (f: (b: BudgetMonth) => number) => tracked.reduce((t, r) => t + f(r.b!), 0)
  void pieRef
  return (
    <>
      <Bars rows={rows} onMonth={onMonth} svgRef={barsRef} />
      <section aria-label="The year by month" className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="grid grid-cols-[1.2fr_repeat(4,1fr)] gap-2 px-4 py-2.5 text-xs font-bold tracking-wider text-white" style={{ background: NAVY }}>
          <span>MONTH</span><span className="text-right">INCOME</span><span className="text-right">BUDGET</span><span className="text-right">ACTUAL</span><span className="text-right">DIFFERENCE</span>
        </div>
        {rows.map((r, i) => (
          <button key={r.month} type="button" disabled={!r.b} onClick={() => onMonth(r.month)}
            className={`w-full grid grid-cols-[1.2fr_repeat(4,1fr)] gap-2 px-4 py-2.5 border-0 border-b border-line text-left text-sm text-fg tnum ${r.b ? 'cursor-pointer' : 'cursor-default'} ${i % 2 ? 'bg-surface-2' : 'bg-surface'}`}>
            <b>{monthName(r.month).split(' ')[0]}</b>
            {r.b ? (
              <>
                <span className="text-right">{money(r.b.incomeTotal)}</span>
                <span className="text-right text-muted">{money(r.b.budgetTotal)}</span>
                <span className={`text-right font-bold ${r.b.actualTotal > r.b.budgetTotal + 0.005 ? 'text-warn' : ''}`}>{money(r.b.actualTotal)}</span>
                <span className={`text-right font-bold ${r.b.difference >= 0 ? 'text-pay-ink' : 'text-bad'}`}>{r.b.difference >= 0 ? '+' : '−'}{money(Math.abs(r.b.difference))}</span>
              </>
            ) : <span className="col-span-4 text-right text-muted">—</span>}
          </button>
        ))}
        {tracked.length > 0 && (
          <div className="grid grid-cols-[1.2fr_repeat(4,1fr)] gap-2 px-4 py-3 font-extrabold tnum text-sm">
            <span>Year so far</span>
            <span className="text-right">{money(sum((b) => b.incomeTotal))}</span>
            <span className="text-right">{money(sum((b) => b.budgetTotal))}</span>
            <span className="text-right">{money(sum((b) => b.actualTotal))}</span>
            <span className="text-right">{money(sum((b) => b.difference))}</span>
          </div>
        )}
      </section>
      <section aria-label="Categories this year" className="rounded-2xl border border-line bg-surface px-5 py-4 flex flex-col gap-2">
        <h3 className="m-0 text-base font-bold">Each category, month by month (actual)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum border-collapse">
            <thead><tr><th className="text-left py-1.5 pr-2">Category</th>{tracked.map((r) => <th key={r.month} className="text-right py-1.5 px-2">{r.label}</th>)}<th className="text-right py-1.5 pl-2">Total</th></tr></thead>
            <tbody>
              {BUDGET_CATS.map((c) => {
                const vals = tracked.map((r) => r.b!.cats.find((y) => y.cat === c)!.actual)
                return (
                  <tr key={c} className="border-t border-line">
                    <td className="py-1.5 pr-2"><span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: CAT_COLOR[c] }} />{CAT_SHORT[c]}</span></td>
                    {vals.map((v, i) => <td key={i} className="text-right py-1.5 px-2">{v ? money(v) : '—'}</td>)}
                    <td className="text-right py-1.5 pl-2 font-bold">{money(vals.reduce((t, v) => t + v, 0))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Phone: the Budget card on the Money tab
// ---------------------------------------------------------------------------

export function BudgetCard({ m, today, hide, onOpen }: { m: MoneyData; today: string; hide?: boolean; onOpen?: () => void }) {
  const [x] = useBudgetExtras()
  const [openCat, setOpenCat] = useState<BudgetCat | null>(null)
  const b = budgetMonth(m, x, today.slice(0, 7), today)
  const show = (n: number) => (hide ? '••••' : money(n))
  const over = b.actualTotal - b.budgetTotal
  const used = b.budgetTotal > 0 ? Math.min(100, (b.actualTotal / b.budgetTotal) * 100) : 0
  return (
    <section aria-label="Budget" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3" data-testid="budget-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-muted">Budget · {monthName(b.month).split(' ')[0]}</h2>
        <span className={`text-sm font-bold ${over > 0.005 ? 'text-warn' : 'text-pay-ink'}`}>{over > 0.005 ? `${show(over)} over` : `${show(-over)} left`}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-sm text-muted"><span>Spent {show(b.actualTotal)}</span><span>of {show(b.budgetTotal)}</span></div>
        <span className="h-2.5 rounded-full bg-line overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${over > 0.005 ? 100 : used}%`, background: over > 0.005 ? ORANGE : NAVY }} /></span>
      </div>
      <div className="flex flex-col">
        {b.cats.filter((c) => c.budget || c.actual).map((c) => {
          const cOver = c.actual - c.budget > 0.005
          const isOpen = openCat === c.cat
          return (
            <div key={c.cat} className="border-t border-line">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpenCat(isOpen ? null : c.cat)}
                className="w-full bg-transparent border-0 px-0 py-2 flex flex-col gap-1 text-left text-fg cursor-pointer">
                <span className="w-full flex justify-between text-sm">
                  <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-sm" style={{ background: CAT_COLOR[c.cat] }} />{CAT_SHORT[c.cat]}</span>
                  <b className={cOver ? 'text-warn' : ''}>{show(c.actual)} <span className="font-normal text-muted">/ {show(c.budget)}</span></b>
                </span>
                <span className="w-full h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${c.budget ? Math.min(100, (c.actual / c.budget) * 100) : 100}%`, background: cOver ? '#C2410C' : NAVY }} /></span>
              </button>
              {isOpen && (
                <div className="pb-2 flex flex-col gap-1 text-xs">
                  {c.lines.map((l) => (
                    <span key={l.key} className="flex justify-between gap-2 pl-3.5">
                      <span className="truncate text-muted">{l.name}</span>
                      <span className="tnum shrink-0">{l.actual ? show(l.actual) : '—'} <span className="text-muted">/ {show(l.budget)}</span></span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {b.fastFood > 0 && <span className="text-xs text-muted">🍟 {show(b.fastFood)} of Food was fast food and delivery.</span>}
      {onOpen
        ? <button type="button" onClick={onOpen} className="h-11 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer">Open the full budget</button>
        : <span className="text-xs text-muted">Change budget amounts, charts and Download Excel: Budget tab on your computer.</span>}
    </section>
  )
}
