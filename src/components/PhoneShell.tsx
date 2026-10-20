import { useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { DAYS, MONTHS, dateOf } from '../lib/dates'
import type { MoneyData } from '../lib/money'
import PhoneHome from './PhoneHome'
import MonthView from './MonthView'
import BillsView from './BillsView'
import MoneyView from './MoneyView'
import JournalSearch from './JournalSearch'
import { CalendarIcon, CardIcon, HomeIcon, Plus, Search, SignOut, WalletIcon } from './icons'

export type PhoneTab = 'home' | 'calendar' | 'bills' | 'money'

interface Props {
  userId: string
  today: string
  money: MoneyData
  moneyLoaded: boolean
  moneyError: string
  reloadMoney: () => Promise<void>
  onLog: () => void
  homeExtra?: ReactNode
  dayExtra?: (date: string) => ReactNode
}

/** Phone layout: greeting bar on top, one screen at a time, tab bar with the + button at the bottom. */
export default function PhoneShell({ userId, today, money, moneyLoaded, moneyError, reloadMoney, onLog, homeExtra, dayExtra }: Props) {
  const [tab, setTab] = useState<PhoneTab>('home')
  const [selected, setSelected] = useState(today)
  const [searching, setSearching] = useState(false)

  const t = dateOf(today)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  function go(next: PhoneTab) {
    setTab(next)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="sticky top-0 z-10 bg-header text-white safe-x pb-3"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <span className="block text-[11px] font-bold tracking-[0.14em] uppercase text-header-muted">Jae's Runway</span>
            <b className="block text-2xl leading-tight truncate">{greeting}, Jae</b>
            <span className="block text-sm text-header-muted">{DAYS[t.getDay()]}, {MONTHS[t.getMonth()]} {t.getDate()}</span>
          </div>
          <button type="button" aria-label={searching ? 'Close search' : 'Search journal'} aria-pressed={searching} onClick={() => setSearching(!searching)}
            className="size-11 rounded-full border-0 bg-header-2 text-white grid place-items-center cursor-pointer"><Search /></button>
          <button type="button" aria-label="Sign out" onClick={() => supabase.auth.signOut()}
            className="size-11 rounded-full border-0 bg-header-2 text-header-muted grid place-items-center cursor-pointer"><SignOut /></button>
        </div>
        {searching && (
          <div className="mt-3 flex">
            <JournalSearch onPick={(d) => { setSelected(d); setSearching(false); go('calendar') }} />
          </div>
        )}
      </header>

      {moneyError && (
        <div role="alert" className="safe-x py-2 bg-bad text-white text-sm font-bold">
          Couldn't load bills and money: {moneyError}{' '}
          <button type="button" onClick={() => void reloadMoney()} className="underline bg-transparent border-0 text-white font-bold">Try again</button>
        </div>
      )}

      <main className="flex-1 safe-x pt-3.5 flex flex-col" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        {tab === 'home' && <PhoneHome userId={userId} today={today} money={money} moneyLoaded={moneyLoaded} reloadMoney={reloadMoney} extra={homeExtra} />}
        {tab === 'calendar' && <MonthView userId={userId} today={today} selected={selected} onSelect={setSelected} money={money} reloadMoney={reloadMoney} dayExtra={dayExtra} />}
        {tab === 'bills' && <div className="-mx-4"><BillsView today={today} money={money} loaded={moneyLoaded} reloadMoney={reloadMoney} onOpenDay={(d) => { setSelected(d); go('calendar') }} /></div>}
        {tab === 'money' && <div className="-mx-4"><MoneyView today={today} money={money} loaded={moneyLoaded} reloadMoney={reloadMoney} onLog={onLog} /></div>}
      </main>

      <nav aria-label="Screens" className="fixed left-0 right-0 bottom-0 z-20 grid grid-cols-[1fr_1fr_76px_1fr_1fr] items-center border-t border-line bg-surface px-1.5 pt-1.5"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
        <TabButton label="Home" active={tab === 'home'} onClick={() => go('home')}><HomeIcon /></TabButton>
        <TabButton label="Calendar" active={tab === 'calendar'} onClick={() => go('calendar')}><CalendarIcon /></TabButton>
        <button type="button" aria-label="Log a purchase" onClick={onLog}
          className="justify-self-center -mt-7 size-[62px] rounded-full border-4 border-surface bg-accent-hi text-white grid place-items-center cursor-pointer shadow-[0_8px_18px_rgba(109,40,217,.4)]">
          <Plus />
        </button>
        <TabButton label="Bills" active={tab === 'bills'} onClick={() => go('bills')}><CardIcon /></TabButton>
        <TabButton label="Money" active={tab === 'money'} onClick={() => go('money')}><WalletIcon /></TabButton>
      </nav>
    </div>
  )
}

function TabButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
      className={`min-h-13 flex flex-col items-center justify-center gap-0.5 border-0 bg-transparent text-xs font-bold cursor-pointer ${active ? 'text-accent' : 'text-muted'}`}>
      {children}
      {label}
    </button>
  )
}
