import { useState } from 'react'
import { DAYS, dateOf, money, shortDate } from '../lib/dates'
import { deleteTransfer, parseMoney, type MoneyData } from '../lib/money'
import { recountCash, walletStatus, withdrawCash } from '../lib/wallet'

/** 💵 Wallet: cash on hand, the $40-per-payday cash budget, take out cash, count my cash. */
export function WalletCard({ m, today, hide, reloadMoney, onToast }: { m: MoneyData; today: string; hide?: boolean; reloadMoney: () => Promise<void>; onToast?: (s: string) => void }) {
  const st = walletStatus(m, today)
  const [mode, setMode] = useState<null | 'out' | 'count'>(null)
  const [amt, setAmt] = useState('')
  const checking = m.accounts.filter((a) => a.kind === 'checking')
  const [from, setFrom] = useState(checking.find((a) => a.institution === 'NFCU')?.id ?? checking[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!st) return null
  const pct = st.budget ? Math.min(100, (st.spent / st.budget) * 100) : 0
  const over = st.spent > st.budget
  const moves = m.transfers.filter((x) => x.to_account_id === st.wallet.id).slice(0, 2)
  const show = (n: number | null) => (hide ? '••••' : n === null ? '—' : money(n))
  const payWhen = st.payday ? `${DAYS[dateOf(st.payday).getDay()].slice(0, 3)} ${shortDate(st.payday)}` : 'payday'

  async function save() {
    const n = parseMoney(amt)
    if (n === null || n < 0 || (mode === 'out' && n === 0)) { setErr('Enter the amount.'); return }
    setBusy(true); setErr('')
    try {
      if (mode === 'out') { await withdrawCash(m, from, n, today); onToast?.(`${money(n)} cash in your Wallet`) }
      else {
        const spent = await recountCash(m, n, today)
        onToast?.(spent > 0 ? `Counted ${money(n)} · ${money(spent)} cash spent` : `Wallet set to ${money(n)}`)
      }
      await reloadMoney(); setMode(null); setAmt('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn\'t save') }
    setBusy(false)
  }

  return (
    <section aria-label="Wallet" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-muted">💵 Wallet</h2>
        <b className="text-2xl tnum">{st.counted ? show(st.cash) : 'Count it once'}</b>
      </div>
      <div className="flex flex-col gap-1">
        <span className="h-2.5 rounded-full bg-pay-soft overflow-hidden">
          <span className={`block h-full rounded-full ${over ? 'bg-bad' : 'bg-pay'}`} style={{ width: `${pct}%`, minWidth: st.spent ? 6 : 0 }} />
        </span>
        <span className="text-sm">
          {over
            ? <b className="text-bad">{money(st.spent - st.budget)} over your {money(st.budget)} cash until {payWhen}</b>
            : <><b className="text-pay-ink">{money(st.left)} of {money(st.budget)} left</b> <span className="text-muted">until {payWhen}</span></>}
        </span>
        <span className="text-xs text-muted">This week {money(st.weekSpent)} of {money(st.weekBudget)} · spending comes from your recounts</span>
      </div>

      {mode ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-2.5" role="group" aria-label={mode === 'out' ? 'Took out cash' : 'Count my cash'}>
          <b className="text-sm">{mode === 'out' ? 'Took out cash' : 'How much cash is in your wallet right now?'}</b>
          <div className="flex flex-wrap gap-2">
            <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="$0.00" aria-label={mode === 'out' ? 'Cash taken out' : 'Cash counted'} autoFocus
              className="h-10 w-28 rounded-xl border border-line bg-surface px-3 text-fg tnum focus:outline-2 focus:outline-accent-hi" />
            {mode === 'out' && (
              <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Taken out of" className="h-10 rounded-xl border border-line bg-surface px-2 text-fg">
                {checking.map((a) => <option key={a.id} value={a.id}>from {a.institution ?? a.name}</option>)}
              </select>
            )}
          </div>
          {err && <span role="alert" className="text-sm font-bold text-bad">{err}</span>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="h-10 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => { setMode(null); setErr('') }} className="h-10 px-4 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode('count')} className="h-10 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">Count my cash</button>
          <button type="button" onClick={() => setMode('out')} className="h-10 px-4 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer">Took out cash</button>
        </div>
      )}
      {moves.length > 0 && (
        <ul className="m-0 p-0 list-none text-xs text-muted">
          {moves.map((x) => (
            <li key={x.id} className="flex items-center gap-2 py-1">
              <span className="flex-1">{shortDate(x.moved_on)} · took out {money(x.amount)} from {m.accounts.find((a) => a.id === x.from_account_id)?.institution ?? 'bank'}</span>
              <button type="button" onClick={() => void deleteTransfer(x.id).then(reloadMoney)} className="bg-transparent border-0 text-accent font-bold cursor-pointer">Undo</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
