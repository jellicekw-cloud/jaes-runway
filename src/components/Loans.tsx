import { useState } from 'react'
import { MONTHS, dateOf, money, shortDate } from '../lib/dates'
import { addLoanExtra, deleteLoanExtra, loanBill, loanStatus, whatIf, type Loan } from '../lib/loans'
import { parseMoney, type MoneyData } from '../lib/money'

// Bills tab: each loan with what's left, when it's paid off, and what extra payments do.

type Run = (fn: () => Promise<unknown>) => Promise<void>
const monthYear = (k: string) => `${MONTHS[dateOf(k).getMonth()].slice(0, 3)} ${dateOf(k).getFullYear()}`

export function LoanCard({ loan, m, today, hide, run }: { loan: Loan; m: MoneyData; today: string; hide: boolean; run: Run }) {
  const s = loanStatus(loan, m.loanExtras, today)
  const bill = loanBill(m, loan)
  const from = m.accounts.find((a) => a.id === bill?.account_id)
  const pct = Math.min(100, (s.paidOff / loan.principal) * 100)
  const show = (n: number) => (hide ? '••••' : money(n))
  const [adding, setAdding] = useState(false)
  const [openIf, setOpenIf] = useState(false)
  const [openHist, setOpenHist] = useState(false)
  const mine = m.loanExtras.filter((x) => x.loan_id === loan.id)
  const sooner = Math.max(0, monthsBetween(s.payoff, s.originalPayoff))
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" data-testid={`loan-${loan.name}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl leading-none">🚗</span>
        <span className="flex-1 min-w-0">
          <b className="block text-lg">{loan.name}</b>
          <span className="block text-sm text-muted">{money(loan.payment)} on the {ordinal(dateOf(loan.first_due).getDate())}{bill?.autopay ? ' · autopay' : ''}{from ? ` from ${from.institution ?? from.name}` : ''} · {loan.apr}% · {loan.term_months} months</span>
        </span>
        <span className="text-right">
          <b className="block text-xl tnum">{show(s.balance)}</b>
          <span className="block text-xs text-muted">left of {money(loan.principal)}</span>
        </span>
      </div>

      <span className="h-3 rounded-full bg-pay-soft overflow-hidden" role="img" aria-label={`${Math.round(pct)}% paid off`}>
        <span className="block h-full rounded-full bg-pay" style={{ width: `${pct}%`, minWidth: s.paidOff > 0 ? 6 : 0 }} />
      </span>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Fact label="Paid off" value={monthYear(s.payoff)} note={sooner > 0 ? `${sooner} month${sooner === 1 ? '' : 's'} early 🎉` : `${s.paymentsLeft} payments left`} good={sooner > 0} />
        <Fact label="Next payment" value={s.next ? shortDate(s.next) : 'Done'} note={s.next ? money(loan.payment) : ''} />
        <Fact label="Interest left" value={money(s.interestLeft)} note={s.originalInterest - s.interestPaid - s.interestLeft > 0.5 ? `${money(s.originalInterest - s.interestPaid - s.interestLeft)} saved` : 'if you pay the usual'} good={s.originalInterest - s.interestPaid - s.interestLeft > 0.5} />
        <Fact label="Extra paid" value={money(s.extraPaid)} note={`${s.paymentsMade} of ${loan.term_months} payments made`} />
      </div>

      {adding
        ? <ExtraForm loan={loan} m={m} today={today} run={run} done={() => setAdding(false)} />
        : <button type="button" onClick={() => setAdding(true)} className="self-start h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">+ Extra payment</button>}

      <div className="flex flex-col gap-1.5">
        <button type="button" aria-expanded={openIf} onClick={() => setOpenIf(!openIf)} className="self-start flex items-center gap-1.5 h-9 px-2 -ml-2 rounded-lg border-0 bg-transparent text-sm font-bold text-muted cursor-pointer">
          <span aria-hidden="true">{openIf ? '▾' : '▸'}</span> What paying extra every month would do
        </button>
        {openIf && (
          <div className="rounded-xl bg-surface-2 overflow-hidden text-sm" data-testid="loan-whatif">
            <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs font-bold text-muted"><span>Extra / month</span><span>Paid off</span><span>Sooner</span><span className="text-right">Interest saved</span></div>
            {whatIf(loan, m.loanExtras, today).map((w) => (
              <div key={w.extra} className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-line tnum">
                <b>+{money(w.extra).replace('.00', '')}</b><span>{monthYear(w.payoff)}</span><span>{w.sooner} mo</span><b className="text-right text-pay-ink">{money(w.saved)}</b>
              </div>
            ))}
            <p className="m-0 px-3 py-2 text-xs text-muted border-t border-line">Ask the lender to apply extra to <b>principal</b>, not next month's payment. Numbers are close estimates; your lender's can differ by a few dollars.</p>
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button type="button" aria-expanded={openHist} onClick={() => setOpenHist(!openHist)} className="self-start flex items-center gap-1.5 h-9 px-2 -ml-2 rounded-lg border-0 bg-transparent text-sm font-bold text-muted cursor-pointer">
            <span aria-hidden="true">{openHist ? '▾' : '▸'}</span> Extra payments · {mine.length}
          </button>
          {openHist && mine.map((x) => (
            <div key={x.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="flex-1">{shortDate(x.paid_on)} · {m.accounts.find((a) => a.id === x.account_id)?.institution ?? 'Bank'}</span>
              <b className="tnum">{money(x.amount)}</b>
              <button type="button" onClick={() => void run(() => deleteLoanExtra(x.id))} aria-label={`Remove extra payment of ${money(x.amount)} on ${shortDate(x.paid_on)}`}
                className="h-8 px-2 rounded-lg border border-line bg-transparent text-xs font-bold text-muted cursor-pointer">Undo</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Fact({ label, value, note, good }: { label: string; value: string; note: string; good?: boolean }) {
  return (
    <span className="rounded-xl bg-surface-2 px-3 py-2 flex flex-col">
      <span className="text-[11px] font-bold tracking-wider uppercase text-muted">{label}</span>
      <b className="tnum">{value}</b>
      <span className={`text-xs ${good ? 'text-pay-ink font-bold' : 'text-muted'}`}>{note}</span>
    </span>
  )
}

function ExtraForm({ loan, m, today, run, done }: { loan: Loan; m: MoneyData; today: string; run: Run; done: () => void }) {
  const bill = loanBill(m, loan)
  const checking = m.accounts.filter((a) => a.kind === 'checking')
  const [amt, setAmt] = useState('')
  const [on, setOn] = useState(today)
  const [acct, setAcct] = useState(bill?.account_id ?? checking[0]?.id ?? '')
  const n = parseMoney(amt)
  const preview = n && n > 0 ? loanStatus(loan, [...m.loanExtras, { id: 'x', loan_id: loan.id, amount: n, paid_on: on, account_id: acct, created_at: '' }], today) : null
  const now = loanStatus(loan, m.loanExtras, today)
  return (
    <form aria-label="Extra payment" className="flex flex-col gap-2 rounded-xl border border-dashed border-muted p-3"
      onSubmit={(e) => { e.preventDefault(); if (n && n > 0) void run(() => addLoanExtra(loan.id, n, on, acct || null)).then(done) }}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Amount
          <span className="flex items-center h-11 rounded-xl px-3 border border-line bg-surface"><span className="text-muted">$</span>
            <input autoFocus inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="100.00" aria-label="Extra payment amount" className="w-24 border-0 bg-transparent tnum text-fg text-base focus:outline-none" />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Paid on
          <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-2 text-fg" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">From
          <select value={acct} onChange={(e) => setAcct(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-2 text-fg">
            {checking.map((a) => <option key={a.id} value={a.id}>{a.institution ?? a.name}</option>)}
          </select>
        </label>
        <button type="submit" disabled={!n || n <= 0} className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer disabled:opacity-50">Save</button>
        <button type="button" onClick={done} className="h-11 px-3 bg-transparent border-0 text-muted cursor-pointer">Cancel</button>
      </div>
      {preview && (
        <span className="text-sm text-pay-ink font-bold">
          Paid off {monthYear(preview.payoff)}{preview.payoff < now.payoff ? ` (was ${monthYear(now.payoff)})` : ''} · saves about {money(Math.max(0, now.interestLeft - preview.interestLeft))} in interest
        </span>
      )}
    </form>
  )
}

function monthsBetween(a: string, b: string): number {
  const x = dateOf(a), y = dateOf(b)
  return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth())
}
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`
