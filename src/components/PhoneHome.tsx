import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { DAYS, addDays, dateOf, money, shortDate } from '../lib/dates'
import { loadEntries, loadTags } from '../lib/journal'
import {
  challengeGoal, challengeSteps, hasMoneyIn, currentSavingsStep, estimateBalance, isPayday, nextPayday, obligationsOn, saveDeposit, savingsOn,
  setHideBalances, type MoneyData,
} from '../lib/money'
import { MOOD_EMOJI, type JournalEntry, type Tag } from '../lib/types'
import DayBills from './DayBills'
import { eventsOn, todosOn, type Plans } from '../lib/plans'
import { Eye, EyeOff } from './icons'
import { itemsOn, tripsOn, type TripsData } from '../lib/trips'
import JournalEditor from './JournalEditor'
import { packagesOn, type Order } from '../lib/inbox'
import { datesOn, type SpecialDate } from '../lib/specialDates'

interface Props {
  userId: string
  today: string
  money: MoneyData
  moneyLoaded: boolean
  reloadMoney: () => Promise<void>
  extra?: ReactNode        // to-dos card
  top?: ReactNode          // trip mode while you're away
  bottom?: ReactNode       // travel plans card
  plans: Plans
  trips: TripsData
  orders?: Order[]
  dates?: SpecialDate[]
  datesRow?: ReactNode     // slim birthdays row (when nothing is this week)
  afford?: ReactNode       // Can I afford it?
  dayExtra?: (date: string, showAdd?: boolean) => ReactNode
}

/** Phone Home: balances, savings challenge, next 3 days, 3-day journal. */
export default function PhoneHome({ userId, today, money: m, moneyLoaded, reloadMoney, extra, top, bottom, plans, trips, orders = [], dates = [], datesRow, afford, dayExtra }: Props) {
  const days = [0, 1, 2].map((i) => addDays(today, i))
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [open, setOpen] = useState<string | null>(today)
  const [error, setError] = useState('')
  const [journalLoaded, setJournalLoaded] = useState(false)   // editors wait for this so they never open empty over a saved entry

  useEffect(() => {
    Promise.all([loadEntries(days[0], days[2]), loadTags()])
      .then(([e, t]) => { setJournal(e); setTags(t); setJournalLoaded(true) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Couldn\'t load your journal'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const onSaved = useCallback((date: string, entry: JournalEntry | null) => {
    setJournal((list) => [...list.filter((e) => e.entry_date !== date), ...(entry ? [entry] : [])])
  }, [])
  const onTagCreated = useCallback((tag: Tag) => setTags((l) => [...l, tag]), [])

  const hide = m.settings?.hide_balances ?? false
  const checking = m.accounts.filter((a) => a.kind === 'checking')
  const ests = checking.map((a) => estimateBalance(m, a, today))
  const total = ests.every((e) => e.estimate === null) ? null : ests.reduce((t, e) => t + (e.estimate ?? 0), 0)
  const np = nextPayday(m, today)
  const step = currentSavingsStep(m)
  const saved = challengeSteps(m).reduce((t, s) => t + (s.deposit ? s.amount : 0), 0)
  const goal = challengeGoal(m)
  const label = (i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYS[dateOf(days[i]).getDay()])

  // Home's 3-day list shows plans without the per-day add box (the + button and To-do card cover adding)
  const dayExtraNoAdd = (k: string) => (dayExtra ? dayExtra(k, false) : null)

  if (!moneyLoaded) return <p className="m-0 text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-3.5">
      {top}

      {/* Balances */}
      <section aria-label="Checking balances" className="rounded-3xl p-4 text-white flex flex-col gap-3"
        style={{ background: 'linear-gradient(160deg, var(--accent) 0%, var(--header-2) 100%)' }}>
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-white/85">Checking · {checking.length} banks</h2>
          <button type="button" aria-pressed={hide} aria-label={hide ? 'Show balances' : 'Hide balances'}
            onClick={() => void setHideBalances(!hide).then(reloadMoney)}
            className="size-10 rounded-full border-0 bg-white/20 text-white grid place-items-center cursor-pointer">
            {hide ? <EyeOff /> : <Eye />}
          </button>
        </div>
        <div className="text-4xl font-bold tnum">{hide ? '$ • • • •' : total === null ? 'Add balances on Money' : money(total)}</div>
        <div className="grid grid-cols-2 gap-2">
          {checking.map((a, i) => (
            <div key={a.id} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,.14)' }}>
              <span className="block text-sm text-white/85">{a.institution ?? a.name}</span>
              <b className="block text-xl tnum">{hide ? '••••' : ests[i].estimate === null ? '—' : money(ests[i].estimate)}</b>
              <span className="block text-xs text-white/80">{a.role_note}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-sm text-white/85">
          <span>Estimated</span>
          <span>{np ? `Next payday ${shortDate(np.date)}` : ''}</span>
        </div>
      </section>

      {afford}

      {/* Savings */}
      {m.challenge && (
        <section aria-label="Savings challenge" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-muted">Savings challenge</h2>
            <span className="text-sm font-bold text-pay-ink tnum">{hide ? '••••' : money(saved)} of {money(goal)}</span>
          </div>
          <span className="h-2.5 rounded-full bg-pay-soft overflow-hidden">
            <span className="block h-full rounded-full bg-pay" style={{ width: `${Math.min((saved / goal) * 100, 100)}%`, minWidth: saved ? 6 : 0 }} />
          </span>
          {step ? (
            <div className="flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <b className="block">Deposit {step.no} of {m.challenge.deposit_count}</b>
                <span className="text-sm text-muted">Move {money(step.amount)} SoFi → Vault {step.date > today ? `on ${shortDate(step.date)}` : 'this payday'}</span>
              </span>
              <button type="button" onClick={() => void saveDeposit(m, step, today).then(reloadMoney)}
                className="h-11 px-4 rounded-xl border-0 bg-pay text-white font-bold cursor-pointer">Saved it</button>
            </div>
          ) : <b className="text-pay-ink">All deposits saved 🎉</b>}
        </section>
      )}

      {/* Next 3 days */}
      <section aria-label="Next 3 days" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
        <h2 className="m-0 text-xs font-bold tracking-widest uppercase text-muted">Next 3 days</h2>
        {days.map((k, i) => {
          const d = dateOf(k)
          const busy = isPayday(m, k) || hasMoneyIn(m, k, today) || Boolean(savingsOn(m, k)) || obligationsOn(m, k, today).length > 0
          const hasPlans = eventsOn(plans, k).length > 0 || todosOn(plans, k, today).length > 0 || itemsOn(trips, k).length > 0 || tripsOn(trips, k).length > 0 || (k !== today && packagesOn(orders, k, today).length > 0) || datesOn(dates, k).length > 0
          return (
            <div key={k} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2.5">
              <div className="flex flex-col items-center pt-1">
                <span className="text-[11px] font-bold tracking-wider uppercase text-muted">{DAYS[d.getDay()].slice(0, 3)}</span>
                <b className={`text-2xl leading-tight tnum ${i === 0 ? 'text-accent' : ''}`}>{d.getDate()}</b>
              </div>
              <div className="min-w-0">
                {busy && <DayBills date={k} today={today} money={m} reloadMoney={reloadMoney} />}
                {hasPlans && <div className={busy ? 'mt-2' : ''}>{dayExtraNoAdd(k)}</div>}
                {!busy && !hasPlans && <p className="m-0 py-2.5 text-sm text-muted">Nothing scheduled{i === 0 ? ' today' : ''}</p>}
              </div>
            </div>
          )
        })}
      </section>

      {extra}

      {datesRow}

      {/* Journal */}
      <section aria-label="Journal" className="rounded-2xl border border-line bg-surface p-3 flex flex-col gap-2">
        <h2 className="m-0 px-1 pt-1 text-xs font-bold tracking-widest uppercase text-muted">Journal</h2>
        {error && <p role="alert" className="m-0 px-1 text-sm font-bold text-bad">{error}</p>}
        {days.map((k, i) => {
          const e = journal.find((x) => x.entry_date === k)
          const isOpen = open === k
          return (
            <div key={k} className="rounded-xl border border-line overflow-hidden">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)}
                className="w-full min-h-13 flex items-center gap-2.5 px-3 py-2 border-0 bg-surface-2 text-left text-fg cursor-pointer">
                <b className="w-20 shrink-0">{label(i)}</b>
                <span className="flex-1 min-w-0 truncate text-sm text-muted">{e?.body ? e.body.split('\n')[0] : 'Tap to write'}</span>
                <span className="text-xl">{e?.mood ? MOOD_EMOJI[e.mood] : ''}</span>
                <svg className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {isOpen && !journalLoaded && <p className="m-0 p-3 text-sm text-muted">Loading…</p>}
              {isOpen && journalLoaded && (
                <div className="p-1">
                  <JournalEditor key={k} userId={userId} date={k} today={today} entry={e} allTags={tags} onSaved={onSaved} onTagCreated={onTagCreated} compact />
                </div>
              )}
            </div>
          )
        })}
      </section>

      {bottom}
    </div>
  )
}
