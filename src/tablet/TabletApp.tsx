import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { money, todayKey } from '../lib/dates'
import { monthName, prevMonth, type BudgetCat } from '../lib/budget'
import { CATEGORIES } from '../lib/types'
import { parseMoney, type PayWith } from '../lib/money'
import BudgetView, { BudgetActionsContext, type BudgetActions } from '../components/Budget'
import Login from '../components/Login'
import {
  EMPTY_TABLET, STANDALONE_KEY, applyLocal, backupBlob, enqueue, loadTablet, newLocalId, readBackup, saveTablet, sync, type Op, type TabletData,
} from './store'
import { seedStandalone } from './standalone'

const MODE = 'runway-tablet-mode'
type Mode = 'runway' | 'standalone'
const readMode = (): Mode => { try { return localStorage.getItem(MODE) === 'standalone' ? 'standalone' : 'runway' } catch { return 'runway' } }
const keyFor = (mode: Mode) => (mode === 'standalone' ? STANDALONE_KEY : undefined)

// Runway Budget for the tablet: the budget lives here (works with no internet), and changes go to Runway when it can.

const ORANGE = '#E8562A'
const NAVY = '#22405F'
type Status = 'idle' | 'syncing' | 'offline' | 'signed-out' | 'standalone'

interface InstallEvent extends Event { prompt: () => Promise<void> }

export default function TabletApp() {
  const [mode, setModeRaw] = useState<Mode>(readMode)
  const modeRef = useRef(mode)
  const [data, setDataRaw] = useState<TabletData>(() => loadTablet(keyFor(readMode())) ?? EMPTY_TABLET)
  const dataRef = useRef(data)
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [showOutbox, setShowOutbox] = useState(false)
  const [install, setInstall] = useState<InstallEvent | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [today, setToday] = useState(todayKey)
  const busy = useRef(false)
  const pushTimer = useRef<number | undefined>(undefined)

  const setData = useCallback((d: TabletData) => {
    dataRef.current = d
    setDataRaw(d)
    if (!saveTablet(d, keyFor(modeRef.current))) setNote('This tablet is out of storage space. Use Back up, then free some space.')
  }, [])

  // Signed in? (Runway and this page share the sign-in on this tablet)
  useEffect(() => {
    const giveUp = window.setTimeout(() => setChecked(true), 8000)
    supabase.auth.getSession().then(({ data: s }) => setSession(s.session)).catch(() => { /* offline */ }).finally(() => { window.clearTimeout(giveUp); setChecked(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (s) setSigningIn(false) })
    try { void navigator.storage?.persist?.() } catch { /* ask the browser to keep this data */ }
    const onInstall = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent) }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('beforeinstallprompt', onInstall) }
  }, [])

  /** Switch between the Runway-synced budget and the stand-alone one (each keeps its own data). */
  const switchMode = useCallback((next: Mode) => {
    try { localStorage.setItem(MODE, next) } catch { /* fine */ }
    modeRef.current = next
    setModeRaw(next)
    const d = loadTablet(keyFor(next)) ?? (next === 'standalone' ? seedStandalone(todayKey()) : EMPTY_TABLET)
    dataRef.current = d
    setDataRaw(d)
    saveTablet(d, keyFor(next))
    setStatus(next === 'standalone' ? 'standalone' : 'idle')
    setNote('')
  }, [])

  const runSync = useCallback(async (pull: boolean) => {
    if (modeRef.current === 'standalone') { setStatus('standalone'); return }
    if (busy.current) return
    const t = todayKey()
    setToday(t)
    const { data: s } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
    if (!s.session) { setStatus('signed-out'); return }
    if (!navigator.onLine) { setStatus('offline'); return }
    busy.current = true
    setStatus('syncing')
    try {
      let start = dataRef.current
      if (start.userId && start.userId !== s.session.user.id) start = EMPTY_TABLET   // someone else signed in on this tablet
      const res = await sync({ ...start, userId: s.session.user.id }, t, pull || !start.m)
      // anything added while we were sending stays waiting
      const latest = dataRef.current
      const extra = latest.outbox.filter((q) => !start.outbox.some((o) => o.id === q.id))
      let merged = { ...res.data, outbox: [...res.data.outbox, ...extra] }
      for (const q of extra) merged = applyLocal(merged, q.op, t)
      setData(merged)
      setStatus(res.down ? 'offline' : 'idle')
      setNote(res.error && !res.down ? res.error : '')
    } finally { busy.current = false }
  }, [setData])

  // Pull when opened (if it's been a while), when the internet comes back, and every 30 minutes on screen
  useEffect(() => {
    if (!checked) return
    const stale = !dataRef.current.pulledAt || Date.now() - new Date(dataRef.current.pulledAt).getTime() > 10 * 60_000
    void runSync(stale)
    const online = () => void runSync(true)
    const vis = () => { if (document.visibilityState === 'visible') void runSync(false) }
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', vis)
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void runSync(true) }, 30 * 60_000)
    return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', vis); window.clearInterval(t) }
  }, [checked, session?.user.id, runSync, mode])

  /** A change: apply here now; send to Runway shortly. */
  const change = useCallback(async (op: Op, label: string) => {
    if (modeRef.current === 'standalone') { setData(applyLocal(dataRef.current, op, todayKey())); return }   // stays on the tablet
    setData(enqueue(dataRef.current, op, label, todayKey()))
    window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => void runSync(false), 800)
  }, [setData, runSync])

  const actions = useMemo<BudgetActions>(() => ({
    setBudget: (month, key, amount) => change({ t: 'budget', month, key, amount }, amount === null ? 'Budget back to usual' : `Budget ${money(amount)}`),
    setCat: (key, cat) => change({ t: 'cat', key, cat }, cat ? `Moved to ${cat}` : 'Back to its usual category'),
    setNote: (month, n) => change({ t: 'note', month, note: n }, `Note for ${monthName(month)}`),
    copyLast: async (x, month) => {
      const last = x.amounts.filter((a) => a.month === prevMonth(month))
      for (const a of last) await change({ t: 'budget', month, key: a.line_key, amount: a.amount }, `Budget ${money(a.amount)} (copied)`)
      return last.length
    },
    markPaid: (_m, o, amount) => change({ t: 'paid', key: o.key, date: o.date, amount, localId: newLocalId() }, `Paid: ${o.name} ${money(amount)}`),
    undoPaid: (_m, o) => change({ t: 'unpaid', key: o.key, date: o.date }, `Not paid: ${o.name}`),
    deposit: (_m, step, t) => change({ t: 'deposit', challengeId: step.ch.id, no: step.no, amount: step.amount, date: t, localId: newLocalId() }, `Saved ${money(step.amount)} (${step.ch.name})`),
    undeposit: (step) => change({ t: 'undeposit', challengeId: step.ch.id, no: step.no }, `Undo deposit ${step.no} (${step.ch.name})`),
    setBalance: (accountId, balance) => change({ t: 'balance', accountId, balance }, `Balance ${balance === null ? 'cleared' : money(balance)}`),
  }), [change])

  if (!checked && !data.m) return <div className="min-h-screen bg-header" />
  if (!session && !data.m && mode === 'runway') return <Login onViewSaved={() => switchMode('standalone')} savedLabel="📒 Use the stand-alone budget (no sign-in)" />

  const m = data.m
  const waiting = data.outbox.length
  const errors = data.outbox.filter((q) => q.error).length
  const pulled = data.pulledAt ? new Date(data.pulledAt) : null
  const pulledLabel = pulled ? `${pulled.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${pulled.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'never'

  const pill = mode === 'standalone' ? { t: '📒 Stand-alone · saved on this tablet only', c: '#0F766E' }
    : status === 'syncing' ? { t: 'Syncing with Runway…', c: NAVY }
    : status === 'signed-out' ? { t: 'Not signed in · changes stay on this tablet', c: '#B45309' }
    : status === 'offline' ? { t: `📴 Offline · changes saved on this tablet${waiting ? ` (${waiting} to send)` : ''}`, c: '#B45309' }
    : errors ? { t: `⚠️ ${errors} change${errors === 1 ? '' : 's'} couldn't be sent`, c: '#DC2626' }
    : waiting ? { t: `⏳ ${waiting} change${waiting === 1 ? '' : 's'} waiting to send`, c: NAVY }
    : { t: '✓ Up to date with Runway', c: '#15803D' }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="sticky top-0 z-20 bg-header text-white safe-x py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="tablet-bar">
        <b className="text-lg">Runway · Budget</b>
        <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: pill.c }} data-testid="tablet-status">{pill.t}</span>
        {mode === 'runway' && <span className="text-xs text-header-muted">Pulled {pulledLabel}</span>}
        <span className="flex-1" />
        {session && mode === 'runway' && <button type="button" onClick={() => void runSync(true)} disabled={status === 'syncing'} className="h-10 px-3 rounded-xl border border-header-2 bg-transparent text-white font-bold cursor-pointer disabled:opacity-50">↻ Pull from Runway</button>}
        {waiting > 0 && <button type="button" aria-expanded={showOutbox} onClick={() => setShowOutbox(!showOutbox)} className="h-10 px-3 rounded-xl border border-header-2 bg-transparent text-white font-bold cursor-pointer">Waiting · {waiting}</button>}
        <BackupButtons data={data} onRestore={(d) => { setData(d); setNote('Restored from your backup.') }} />
        {install && <button type="button" onClick={() => void install.prompt().then(() => setInstall(null))} className="h-10 px-3 rounded-xl border-0 font-bold cursor-pointer text-white" style={{ background: ORANGE }}>Install on this tablet</button>}
        <button type="button" onClick={() => switchMode(mode === 'standalone' ? 'runway' : 'standalone')} className="h-10 px-3 rounded-xl border border-header-2 bg-transparent text-white font-bold cursor-pointer">
          {mode === 'standalone' ? 'Switch to Runway budget' : 'Stand-alone budget'}
        </button>
        {!session && mode === 'runway' && <button type="button" onClick={() => setSigningIn(true)} className="h-10 px-3 rounded-xl border-0 bg-accent-hi text-white font-bold cursor-pointer">Sign in to sync</button>}
      </div>
      {signingIn && !session && (
        <div className="fixed inset-0 z-50">
          <Login />
          <button type="button" onClick={() => setSigningIn(false)} className="fixed top-4 right-4 h-10 px-3 rounded-xl border border-header-2 bg-transparent text-white font-bold cursor-pointer">Back to my budget</button>
        </div>
      )}

      {note && <p role="status" className="m-0 mx-4 mt-3 rounded-xl border border-warn bg-warn-soft px-4 py-2 text-sm font-bold">{note}</p>}
      {showOutbox && waiting > 0 && (
        <section aria-label="Waiting to send" className="mx-4 mt-3 rounded-2xl border border-line bg-surface p-3 flex flex-col gap-1.5 text-sm">
          <b>Waiting to send to Runway</b>
          {data.outbox.map((q) => (
            <span key={q.id} className="flex items-center gap-2">
              <span className="flex-1">{q.label}</span>
              {q.error ? <span className="text-bad text-xs font-bold">{q.error}</span> : <span className="text-muted text-xs">{new Date(q.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
              {q.error && <button type="button" onClick={() => setData({ ...data, outbox: data.outbox.filter((o) => o.id !== q.id) })} className="h-8 px-2 rounded-lg border border-line bg-transparent text-xs font-bold cursor-pointer">Drop it</button>}
            </span>
          ))}
          <span className="text-xs text-muted">These are already in your budget here. They go to Runway automatically when it can be reached.</span>
        </section>
      )}

      {m ? (
        <BudgetActionsContext.Provider value={actions}>
          <BudgetView m={m} today={today} loaded reloadMoney={async () => {}} extras={data.x} reloadExtras={async () => {}}
            toolbar={<button type="button" onClick={() => setAdding(true)} className="h-11 px-4 rounded-xl border-0 font-bold text-white cursor-pointer" style={{ background: ORANGE }}>+ Add spending</button>} />
        </BudgetActionsContext.Provider>
      ) : (
        <p className="m-6 text-muted">{status === 'syncing' ? 'Getting your budget from Runway…' : 'Connect to the internet once to get your budget from Runway.'}</p>
      )}

      {adding && m && <AddSpending m={m} today={today} onClose={() => setAdding(false)}
        onSave={(s) => change({ t: 'spend', localId: newLocalId(), ...s }, `Spent ${money(s.amount)} · ${s.description}`)} />}
    </div>
  )
}

function BackupButtons({ data, onRestore }: { data: TabletData; onRestore: (d: TabletData) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  return (
    <>
      <button type="button" onClick={() => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(backupBlob(data))
        a.download = `Runway tablet backup ${todayKey()}.json`
        document.body.appendChild(a); a.click(); a.remove()
      }} className="h-10 px-3 rounded-xl border border-header-2 bg-transparent text-white font-bold cursor-pointer">Back up</button>
      <button type="button" onClick={() => file.current?.click()} className="h-10 px-3 rounded-xl border border-header-2 bg-transparent text-white font-bold cursor-pointer">Restore</button>
      <input ref={file} type="file" accept="application/json,.json" aria-label="Restore from a backup file" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f) return
        try {
          const d = await readBackup(f)
          if (window.confirm('Replace the budget on this tablet with this backup? Changes waiting to send in the backup will be sent.')) onRestore(d)
        } catch (x) { setErr(x instanceof Error ? x.message : 'Couldn\'t read that file') }
      }} />
      {err && <span role="alert" className="text-sm text-white bg-bad rounded-lg px-2 py-1">{err}</span>}
    </>
  )
}

function AddSpending({ m, today, onClose, onSave }: {
  m: NonNullable<TabletData['m']>; today: string; onClose: () => void
  onSave: (s: { date: string; amount: number; description: string; category: string; with: PayWith }) => Promise<void>
}) {
  const banks = m.accounts.filter((a) => a.kind === 'checking' || a.kind === 'cash')
  const [amt, setAmt] = useState('')
  const [what, setWhat] = useState('')
  const [cat, setCat] = useState<string>('Food')
  const [paid, setPaid] = useState(banks.find((a) => a.institution === 'NFCU')?.id ? `account:${banks.find((a) => a.institution === 'NFCU')!.id}` : banks[0] ? `account:${banks[0].id}` : '')
  const [date, setDate] = useState(today)
  const n = parseMoney(amt)
  const [kind, id] = paid.split(':')
  const isCard = kind === 'card'
  return (
    <div role="dialog" aria-label="Add spending" className="fixed inset-0 z-40 bg-black/50 grid place-items-center p-4">
      <form className="w-full max-w-lg rounded-2xl bg-surface border border-line p-5 flex flex-col gap-3"
        onSubmit={(e) => { e.preventDefault(); if (!n || n <= 0 || !what.trim() || !id) return; void onSave({ date, amount: n, description: what.trim(), category: cat, with: { kind: kind as 'account' | 'card', id } }).then(onClose) }}>
        <h2 className="m-0 text-xl font-bold">Add spending</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">Amount
            <input autoFocus inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="$0.00" aria-label="Amount" className="h-12 rounded-xl border border-line bg-surface-2 px-3 text-lg text-fg tnum" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl border border-line bg-surface-2 px-3 text-fg" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">What was it?
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Kroger, Chick-fil-A…" aria-label="What was it" className="h-12 rounded-xl border border-line bg-surface-2 px-3 text-fg" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">Category
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="h-12 rounded-xl border border-line bg-surface-2 px-2 text-fg">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">Paid with
            <select value={paid} onChange={(e) => setPaid(e.target.value)} aria-label="Paid with" className="h-12 rounded-xl border border-line bg-surface-2 px-2 text-fg">
              {banks.map((a) => <option key={a.id} value={`account:${a.id}`}>{a.kind === 'cash' ? 'Cash (Wallet)' : `${a.institution ?? a.name} debit`}</option>)}
              {m.cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}
            </select>
          </label>
        </div>
        {isCard && <span className="text-xs text-muted">Card purchases show in the Budget when you pay the card (Credit Cards), so they aren't counted twice.</span>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-11 px-4 rounded-xl border border-line bg-transparent text-fg font-bold cursor-pointer">Cancel</button>
          <button type="submit" disabled={!n || n <= 0 || !what.trim()} className="h-11 px-5 rounded-xl border-0 text-white font-bold cursor-pointer disabled:opacity-50" style={{ background: ORANGE }}>Save</button>
        </div>
      </form>
    </div>
  )
}

export type { BudgetCat }
