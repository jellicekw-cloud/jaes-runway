import { useState, type ReactNode } from 'react'
import { DAYS, dateOf, money, shortDate, weekStart } from '../lib/dates'
import {
  challengeGoal, challengeSteps, currentSavingsStep, deleteTransaction, estimateBalance, nextPayday, parseMoney, paycheckTotal,
  saveDeposit, setAccountBalance, setHideBalances, setPaySplit, undoDeposit, type MoneyData, type SavingsStep,
} from '../lib/money'
import type { Account, Transaction } from '../lib/types'

interface Props {
  today: string
  money: MoneyData
  loaded: boolean
  reloadMoney: () => Promise<void>
  onLog: () => void
}

/** Money tab: checking balances, savings challenge, paycheck split, spending log. */
export default function MoneyView({ today, money: m, loaded, reloadMoney, onLog }: Props) {
  const [error, setError] = useState('')

  async function run(change: () => Promise<unknown>) {
    setError('')
    try { await change(); await reloadMoney() } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
  }

  if (!loaded) return <main className="flex-1 safe-x py-5 text-muted">Loading…</main>

  const hide = m.settings?.hide_balances ?? false
  const show = (n: number | null) => (hide ? '$ • • • •' : n === null ? '—' : money(n))
  const checking = m.accounts.filter((a) => a.kind === 'checking')
  const vault = m.accounts.find((a) => a.kind === 'vault')
  const estimates = checking.map((a) => estimateBalance(m, a, today))
  const total = estimates.every((e) => e.estimate === null) ? null : estimates.reduce((t, e) => t + (e.estimate ?? 0), 0)

  const steps = challengeSteps(m)
  const goal = challengeGoal(m)
  const saved = steps.reduce((t, s) => t + (s.deposit ? s.amount : 0), 0)
  const current = currentSavingsStep(m)
  const vaultEst = vault ? estimateBalance(m, vault, today).estimate : null

  const np = nextPayday(m, today)
  const wkStart = weekStart(today, 1)
  const monthStart = today.slice(0, 8) + '01'
  const spent = (from: string) => m.transactions.filter((t) => t.occurred_on >= from && t.occurred_on <= today).reduce((s, t) => s + t.amount, 0)

  return (
    <main className="flex-1 safe-x py-5 flex flex-col gap-7 w-full max-w-[1240px] mx-auto">
      {error && <p role="alert" className="m-0 rounded-xl border border-bad bg-bad/10 px-4 py-3 font-bold text-bad">Couldn't save that change: {error}</p>}

      {/* Balances */}
      <section aria-label="Checking balances" className="rounded-3xl p-5 text-white flex flex-col gap-4"
        style={{ background: 'linear-gradient(160deg, var(--accent) 0%, var(--header-2) 100%)' }}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-sm font-bold tracking-widest uppercase text-white/85">Checking · {checking.length} banks</h2>
          <button type="button" onClick={() => void run(() => setHideBalances(!hide))} aria-pressed={hide} aria-label={hide ? 'Show balances' : 'Hide balances'}
            className="size-11 rounded-full border-0 bg-white/20 text-white grid place-items-center cursor-pointer">
            {hide ? <EyeOff /> : <Eye />}
          </button>
        </div>
        <div className="text-5xl font-bold tnum">{total === null ? 'Add your balances below' : show(total)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {checking.map((a, i) => <BalanceCard key={a.id} account={a} est={estimates[i]} hide={hide} run={run} />)}
        </div>
        <p className="m-0 text-sm text-white/85">
          Estimated from the balance you last entered, plus paychecks, minus auto-pay, purchases, bills and savings since. Enter the real number from your bank app anytime and it resets.
        </p>
      </section>

      {/* Savings challenge */}
      {m.challenge && (
        <Section title="Savings challenge" right={<span className="font-bold text-pay-ink tnum">{hide ? '••••' : money(saved)} of {money(goal)}</span>}>
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="h-3 rounded-full bg-pay-soft overflow-hidden">
              <span className="block h-full rounded-full bg-pay" style={{ width: `${Math.min((saved / goal) * 100, 100)}%`, minWidth: saved ? 6 : 0 }} />
            </span>
            {current ? (
              <CurrentDeposit step={current} today={today} total={steps.length} m={m} run={run} />
            ) : (
              <p className="m-0 font-bold text-pay-ink">All {steps.length} deposits saved. You did it! 🎉</p>
            )}
            <p className="m-0 text-sm text-muted">
              52-week challenge in reverse, two weeks per payday, from SoFi checking into your SoFi Vault.
              {vault ? <> Vault: <b className="text-fg tnum">{hide ? '••••' : money(vaultEst)}</b>.</> : null} Tap a deposit to mark it saved or undo it.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-1.5">
              {steps.map((s) => {
                const isCurrent = s.no === current?.no
                return (
                  <button key={s.no} type="button" aria-pressed={Boolean(s.deposit)}
                    aria-label={`Deposit ${s.no}, ${shortDate(s.date)}, ${money(s.amount)}${s.deposit ? ', saved. Tap to undo' : ''}`}
                    onClick={() => void run(() => (s.deposit ? undoDeposit(s) : saveDeposit(m, s, today)))}
                    className={`h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer tnum ${s.deposit ? 'bg-pay text-white border border-pay' : isCurrent ? 'bg-surface border-2 border-accent-hi' : 'bg-surface-2 border border-line'}`}>
                    <span className={`text-[11px] font-bold ${s.deposit ? 'text-white/85' : 'text-muted'}`}>{shortDate(s.date)}</span>
                    <b className="text-sm">${s.amount}</b>
                  </button>
                )
              })}
            </div>
          </div>
        </Section>
      )}

      {/* Paycheck */}
      <Section title="Paycheck" right={<span className="font-bold text-pay-ink tnum">{money(paycheckTotal(m))}</span>}>
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <p className="m-0 text-sm text-muted">
            Every {m.settings?.pay_every_days ?? 14} days{np ? `. Next: ${DAYS[dateOf(np.date).getDay()]}, ${shortDate(np.date)}` : ''}. Update the NFCU amount when goal payouts change your check.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {m.splits.map((s) => {
              const a = m.accounts.find((x) => x.id === s.account_id)
              return (
                <MoneyInput key={s.id} id={`split-${s.id}`} label={`Deposits to ${a?.institution ?? a?.name ?? 'account'}`} value={s.amount}
                  onCommit={(v) => { const n = parseMoney(v); if (n !== null && n >= 0) void run(() => setPaySplit(s.id, n)) }} />
              )
            })}
          </div>
        </div>
      </Section>

      {/* Spending */}
      <Section title="Spending" right={
        <button type="button" onClick={onLog} className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">+ Log a purchase</button>
      }>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="This week" value={money(spent(wkStart))} />
          <Stat label="This month" value={money(spent(monthStart))} />
        </div>
        <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
          {m.transactions.length === 0 && <p className="m-0 p-4 text-muted">Nothing logged yet. Use + Log a purchase, and subscriptions will show up here on their charge days.</p>}
          {m.transactions.slice(0, 40).map((t) => <TxRow key={t.id} t={t} m={m} run={run} />)}
        </div>
      </Section>
    </main>
  )
}

// ---------------------------------------------------------------------------

type Run = (change: () => Promise<unknown>) => Promise<void>

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-2xl font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <span className="text-xs font-bold tracking-widest uppercase text-muted">{label}</span>
      <span className="text-3xl font-bold tnum">{value}</span>
    </div>
  )
}

function MoneyInput({ id, label, value, onCommit, dark }: { id: string; label: string; value: number | null; onCommit: (v: string) => void; dark?: boolean }) {
  const initial = value === null ? '' : value.toFixed(2)
  const [v, setV] = useState(initial)
  const [last, setLast] = useState(initial)
  if (initial !== last) { setLast(initial); setV(initial) }
  return (
    <label htmlFor={id} className="flex flex-col gap-1 min-w-0">
      <span className={`text-xs font-bold tracking-wider uppercase ${dark ? 'text-white/80' : 'text-muted'}`}>{label}</span>
      <span className={`flex items-center h-11 rounded-xl px-3 ${dark ? 'bg-white/15 focus-within:bg-white/25' : 'border border-line bg-surface-2 focus-within:border-accent-hi'}`}>
        <span className={dark ? 'text-white/80' : 'text-muted'}>$</span>
        <input id={id} inputMode="decimal" value={v} placeholder="0.00" onChange={(e) => setV(e.target.value)}
          onBlur={() => { if (v !== initial) onCommit(v) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={`w-full min-w-0 border-0 bg-transparent tnum focus:outline-none ${dark ? 'text-white placeholder:text-white/60' : 'text-fg'}`} />
      </span>
    </label>
  )
}

function BalanceCard({ account: a, est, hide, run }: { account: Account; est: ReturnType<typeof estimateBalance>; hide: boolean; run: Run }) {
  const asOf = est.asOf ? new Date(est.asOf) : null
  const asOfText = asOf ? `${asOf.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${asOf.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : null
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-white/12 p-4" style={{ background: 'rgba(255,255,255,.13)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold">{a.name}</span>
        <span className="text-xs text-white/80">{a.role_note}</span>
      </div>
      <div className="text-3xl font-bold tnum">{hide ? '••••' : est.estimate === null ? 'Not entered' : money(est.estimate)}</div>
      {!hide && est.estimate !== null && (
        <div className="text-sm text-white/85 flex flex-col gap-0.5">
          <span>{asOfText ? `You entered ${money(est.entered)} on ${asOfText}` : 'Not entered yet'}</span>
          {est.changes.map((c) => (
            <span key={c.label} className="flex justify-between tnum"><span>{c.label} since</span><span>{c.amount > 0 ? '+' : '−'}{money(Math.abs(c.amount))}</span></span>
          ))}
        </div>
      )}
      <MoneyInput id={`bal-${a.id}`} label="Update from your bank app" value={null} dark
        onCommit={(v) => { const n = parseMoney(v); if (n !== null) void run(() => setAccountBalance(a.id, n)) }} />
    </div>
  )
}

function CurrentDeposit({ step, today, total, m, run }: { step: SavingsStep; today: string; total: number; m: MoneyData; run: Run }) {
  const days = Math.round((Date.parse(step.date) - Date.parse(today)) / 86400000)
  const when = days > 0 ? `on ${DAYS[dateOf(step.date).getDay()].slice(0, 3)}, ${shortDate(step.date)}` : days === 0 ? 'today' : `since ${shortDate(step.date)}`
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 border border-line px-3.5 py-3">
      <span className="size-3 rounded-full bg-pay shrink-0" />
      <span className="flex-1 min-w-0">
        <b className="block">Deposit {step.no} of {total}</b>
        <span className="text-sm text-muted">Move {money(step.amount)} from SoFi to your Vault {when}</span>
      </span>
      <button type="button" onClick={() => void run(() => saveDeposit(m, step, today))}
        className="h-11 px-4 rounded-xl border-0 bg-pay text-white font-bold cursor-pointer">Saved it</button>
    </div>
  )
}

function TxRow({ t, m, run }: { t: Transaction; m: MoneyData; run: Run }) {
  const [armed, setArmed] = useState(false)
  const from = t.account_id ? m.accounts.find((a) => a.id === t.account_id)?.institution : t.card_id ? m.cards.find((c) => c.id === t.card_id)?.name : t.source === 'afterpay' ? 'Afterpay' : ''
  const auto = t.source === 'subscription'
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className={`size-10 rounded-xl grid place-items-center text-sm font-extrabold shrink-0 ${auto ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent'}`} aria-hidden="true">
        {auto ? '↻' : t.category.slice(0, 2).toUpperCase()}
      </span>
      <span className="flex-1 min-w-0">
        <b className="block truncate">{t.description}</b>
        <span className="text-sm text-muted">{shortDate(t.occurred_on)}{from ? ` · ${from}` : ''}{auto ? ' · logged automatically' : ` · ${t.category}`}</span>
      </span>
      <b className="tnum">{money(t.amount)}</b>
      {t.source === 'manual' && (
        <button type="button" onBlur={() => setArmed(false)}
          onClick={() => { if (armed) void run(() => deleteTransaction(m, t)); else setArmed(true) }}
          aria-label={armed ? `Confirm delete ${t.description}` : `Delete ${t.description}`}
          className={`h-9 px-2.5 rounded-lg text-sm font-bold cursor-pointer ${armed ? 'bg-bad text-white border border-bad' : 'bg-transparent border border-line text-muted'}`}>
          {armed ? 'Delete?' : '✕'}
        </button>
      )}
    </div>
  )
}

function Eye() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
}
function EyeOff() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
}
