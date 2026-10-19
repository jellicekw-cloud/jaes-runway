import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DAYS, MONTHS, addDays, dateOf, money, shortDate, todayKey, weekStart } from '../lib/dates'
import { EMPTY_MONEY, dueBeforePayday, loadMoney, nextPayday, overdue, type MoneyData } from '../lib/money'
import JournalSearch from './JournalSearch'
import WeekView from './WeekView'
import BillsView from './BillsView'

type Tab = 'week' | 'bills'

/** Header, tabs and the money data every screen shares. */
export default function AppShell({ email, userId }: { email: string; userId: string }) {
  const today = todayKey()
  const [tab, setTab] = useState<Tab>('week')
  const [selected, setSelected] = useState(today)
  const [moneyData, setMoneyData] = useState<MoneyData>(EMPTY_MONEY)
  const [moneyError, setMoneyError] = useState('')
  const [moneyLoaded, setMoneyLoaded] = useState(false)

  const reloadMoney = useCallback(async () => {
    try {
      setMoneyData(await loadMoney())
      setMoneyError('')
    } catch (e) {
      setMoneyError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
    setMoneyLoaded(true)
  }, [])

  useEffect(() => { void reloadMoney() }, [reloadMoney])

  const np = nextPayday(moneyData, today)
  const due = dueBeforePayday(moneyData, today)
  const late = overdue(moneyData, today)

  const start = weekStart(selected, 1)
  const end = addDays(start, 6)
  const a = dateOf(start), b = dateOf(end)
  const range = `${MONTHS[a.getMonth()].slice(0, 3)} ${a.getDate()} – ${a.getMonth() === b.getMonth() ? '' : MONTHS[b.getMonth()].slice(0, 3) + ' '}${b.getDate()}`

  function openDay(date: string) {
    setSelected(date)
    setTab('week')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-header text-white border-b-[3px] border-accent-hi safe-x py-3 flex flex-wrap items-center gap-x-4 gap-y-3"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}>
        <div className="text-2xl font-bold">Jae's Runway</div>

        <div role="tablist" aria-label="Screens" className="inline-flex gap-1 rounded-xl bg-header-2 p-1">
          {(['week', 'bills'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`h-9 px-4 rounded-lg border-0 font-bold cursor-pointer ${tab === t ? 'bg-accent-hi text-white' : 'bg-transparent text-header-muted hover:text-white'}`}>
              {t === 'week' ? 'Week' : 'Bills'}
            </button>
          ))}
        </div>

        {tab === 'week' && (
          <nav className="flex items-center gap-2" aria-label="Week">
            <button type="button" aria-label="Previous week" onClick={() => setSelected(addDays(selected, -7))}
              className="size-11 rounded-xl border border-header-2 bg-transparent text-white grid place-items-center cursor-pointer hover:bg-header-2">
              <Chevron dir="left" />
            </button>
            <div className="min-w-32 text-center text-lg font-bold tnum" aria-live="polite">{range}</div>
            <button type="button" aria-label="Next week" onClick={() => setSelected(addDays(selected, 7))}
              className="size-11 rounded-xl border border-header-2 bg-transparent text-white grid place-items-center cursor-pointer hover:bg-header-2">
              <Chevron dir="right" />
            </button>
            <button type="button" onClick={() => setSelected(today)}
              className="h-11 px-4 rounded-xl border-0 bg-white text-header font-bold cursor-pointer">Today</button>
          </nav>
        )}

        <div className="flex flex-wrap gap-2">
          {np && (
            <span className="inline-flex items-center gap-2 rounded-full bg-pay-soft text-pay-ink py-1.5 pl-1.5 pr-3 font-bold text-sm">
              <span className="size-6 rounded-full bg-pay text-white grid place-items-center">$</span>
              Next payday · {DAYS[dateOf(np.date).getDay()].slice(0, 3)}, {shortDate(np.date)} · {np.days === 0 ? 'today' : np.days === 1 ? 'tomorrow' : `in ${np.days} days`}
            </span>
          )}
          {due && (
            <span className="inline-flex items-center rounded-full bg-header-2 text-white py-1.5 px-3 font-bold text-sm tnum"
              title={due.missingAmounts ? `${due.missingAmounts} bill(s) have no amount yet. Add minimums on the Bills tab.` : undefined}>
              {due.billCount + due.subCount === 0
                ? 'Nothing due before payday'
                : `Due before payday · ${money(due.total)}${due.missingAmounts ? '+' : ''} (${due.billCount} bill${due.billCount === 1 ? '' : 's'}, ${due.subCount} auto-pay)`}
            </span>
          )}
          {late.length > 0 && (
            <button type="button" onClick={() => openDay(late[0].date)}
              className="inline-flex items-center rounded-full bg-bad text-white py-1.5 px-3 font-bold text-sm border-0 cursor-pointer">
              {late.length} overdue · {late[0].short} {shortDate(late[0].date)}
            </button>
          )}
        </div>

        <div className="flex-1" />
        <JournalSearch onPick={openDay} />
        <button type="button" onClick={() => supabase.auth.signOut()}
          className="h-10 px-3 rounded-xl border border-header-2 bg-transparent text-header-muted text-sm font-bold cursor-pointer hover:bg-header-2">
          Sign out
        </button>
      </header>

      {moneyError && (
        <div role="alert" className="safe-x py-2 bg-bad text-white text-sm font-bold">
          Couldn't load bills and money: {moneyError}{' '}
          <button type="button" onClick={() => void reloadMoney()} className="underline bg-transparent border-0 text-white font-bold cursor-pointer">Try again</button>
        </div>
      )}

      {tab === 'week' ? (
        <WeekView email={email} userId={userId} today={today} selected={selected} onSelect={setSelected}
          money={moneyData} moneyLoaded={moneyLoaded} reloadMoney={reloadMoney} />
      ) : (
        <BillsView today={today} money={moneyData} loaded={moneyLoaded} reloadMoney={reloadMoney} onOpenDay={openDay} />
      )}
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  )
}
