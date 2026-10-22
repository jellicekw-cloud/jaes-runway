import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DAYS, MONTHS, addDays, dateOf, money, shortDate, todayKey, weekStart } from '../lib/dates'
import { EMPTY_MONEY, dueBeforePayday, loadMoney, logSubscriptionCharges, nextPayday, overdue, type MoneyData } from '../lib/money'
import JournalSearch from './JournalSearch'
import WeekView from './WeekView'
import BillsView from './BillsView'
import MoneyView from './MoneyView'
import LogPurchase, { type AddMode } from './LogPurchase'
import { AnytimeTodos, DayPlans } from './Plans'
import { EMPTY_PLANS, loadPlans, type Plans } from '../lib/plans'
import PhoneShell from './PhoneShell'
import { useIsPhone } from '../lib/useIsPhone'
import { EMPTY_TRIPS, loadTrips, tripCostsDue, type TripsData } from '../lib/trips'
import TripsView, { DayTrips, TravelCard, TripModeCard } from './Trips'
import type { PhoneTab } from './PhoneShell'
import { EMPTY_INBOX, arrivingToday, loadInbox, stillReading, waitingCount, type CardKind, type InboxData } from '../lib/inbox'
import { ArrivingToday, DayPackages, InboxHomeCard, InboxPanel } from './Inbox'
import { comingUp, loadSpecialDates, type SpecialDate } from '../lib/specialDates'
import { DatesHomeCard, DatesPanel, DatesPill, DayDates } from './Dates'
import { BirthdayCelebration } from './Confetti'
import { BellButton, NotificationsPanel } from './Notifications'
import AffordCheck from './AffordCheck'

type Tab = 'week' | 'bills' | 'money' | 'trips'
const TAB_LABEL: Record<Tab, string> = { week: 'Week', bills: 'Bills', money: 'Money', trips: 'Trips' }

/** Header, tabs and the money data every screen shares. */
export default function AppShell({ email, userId }: { email: string; userId: string }) {
  const today = todayKey()
  const isPhone = useIsPhone()
  const [tab, setTab] = useState<Tab>('week')
  const [selected, setSelected] = useState(today)
  const [moneyData, setMoneyData] = useState<MoneyData>(EMPTY_MONEY)
  const [moneyError, setMoneyError] = useState('')
  const [moneyLoaded, setMoneyLoaded] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('buy')
  const [plans, setPlans] = useState<Plans>(EMPTY_PLANS)
  const [plansError, setPlansError] = useState('')
  const [trips, setTrips] = useState<TripsData>(EMPTY_TRIPS)
  const [tripsLoaded, setTripsLoaded] = useState(false)
  const [tripsError, setTripsError] = useState('')
  const [openTripId, setOpenTripId] = useState<string | null>(null)
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('home')
  const [inbox, setInbox] = useState<InboxData>(EMPTY_INBOX)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxPaste, setInboxPaste] = useState(false)
  const [dates, setDates] = useState<SpecialDate[]>([])
  const [datesOpen, setDatesOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // Tapping a notification opens Runway at the right place (?open=inbox | bills | home)
  useEffect(() => {
    const go = (where: string | null) => {
      if (where === 'inbox') { setInboxPaste(false); setInboxOpen(true) }
      else if (where === 'bills') { if (window.matchMedia('(max-width: 767px)').matches) setPhoneTab('money'); else setTab('bills') }
      else if (where === 'home') setPhoneTab('home')
    }
    const params = new URLSearchParams(window.location.search)
    if (params.get('open')) { go(params.get('open')); window.history.replaceState(null, '', window.location.pathname) }
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open' && typeof e.data.url === 'string') go(new URL(e.data.url).searchParams.get('open'))
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [])
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  const subsLogged = useRef(false)

  const reloadMoney = useCallback(async () => {
    try {
      let data = await loadMoney(today)
      // Once per visit: put any auto-pay charges that have happened into the spending log
      if (!subsLogged.current) {
        subsLogged.current = true
        if (await logSubscriptionCharges(data, today)) data = await loadMoney(today)
      }
      setMoneyData(data)
      setMoneyError('')
    } catch (e) {
      setMoneyError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
    setMoneyLoaded(true)
  }, [today])

  useEffect(() => { void reloadMoney() }, [reloadMoney])

  const reloadPlans = useCallback(async () => {
    try { setPlans(await loadPlans(today)); setPlansError('') } catch (e) {
      setPlansError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
  }, [today])

  useEffect(() => { void reloadPlans() }, [reloadPlans])

  const reloadTrips = useCallback(async () => {
    try { setTrips(await loadTrips()); setTripsError('') } catch (e) {
      setTripsError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
    setTripsLoaded(true)
  }, [])

  useEffect(() => { void reloadTrips() }, [reloadTrips])

  const reloadInbox = useCallback(async () => {
    try { setInbox(await loadInbox(today)) } catch { /* Inbox tables not set up yet, or offline: keep what we have */ }
  }, [today])

  // Inbox: on open, when you come back to the app, every 2 minutes, and every few seconds while an email is being read
  useEffect(() => {
    void reloadInbox()
    const onFocus = () => { if (document.visibilityState === 'visible') void reloadInbox() }
    document.addEventListener('visibilitychange', onFocus)
    const t = window.setInterval(() => void reloadInbox(), 120_000)
    return () => { document.removeEventListener('visibilitychange', onFocus); window.clearInterval(t) }
  }, [reloadInbox])
  const readingNow = stillReading(inbox).length > 0
  useEffect(() => {
    if (!readingNow) return
    const t = window.setInterval(() => void reloadInbox(), 4000)
    return () => window.clearInterval(t)
  }, [readingNow, reloadInbox])

  const reloadDates = useCallback(async () => {
    try { setDates(await loadSpecialDates()) } catch { /* table not set up yet: no dates */ }
  }, [])
  useEffect(() => { void reloadDates() }, [reloadDates])

  const openInbox = (paste = false) => { setInboxPaste(paste); setInboxOpen(true) }
  async function onInboxAdded(line: string, kind: CardKind) {
    showToast(line)
    await Promise.all([
      reloadInbox(),
      kind === 'order' || kind === 'afterpay' || kind === 'money_in' ? reloadMoney() : Promise.resolve(),
      kind === 'appointment' ? reloadPlans() : Promise.resolve(),
      kind === 'trip' ? reloadTrips() : Promise.resolve(),
    ])
  }

  const [tripPhotosFocus, setTripPhotosFocus] = useState(false)
  function openTrip(id: string | null, section?: 'photos') {
    setTripPhotosFocus(section === 'photos')
    setOpenTripId(id)
    if (isPhone) setPhoneTab('trips')
    else setTab('trips')
    window.scrollTo({ top: 0 })
  }

  const openAdd = (mode: AddMode = 'buy') => { setAddMode(mode); setLogOpen(true) }
  const dayPlans = (date: string, showAdd = true) => (
    <>
      {/* Home's own Arriving today box already shows today's packages */}
      <DayDates date={date} list={dates} />
      {(showAdd || date !== today) && <DayPackages date={date} today={today} orders={inbox.orders} reload={reloadInbox} />}
      <DayTrips date={date} data={trips} reload={reloadTrips} onOpenTrip={openTrip} />
      <DayPlans date={date} today={today} plans={plans} reload={reloadPlans} showAdd={showAdd} />
    </>
  )
  const tripsView = <TripsView today={today} data={trips} loaded={tripsLoaded} error={tripsError} reload={reloadTrips} openId={openTripId} onOpen={(id) => { setTripPhotosFocus(false); setOpenTripId(id); window.scrollTo({ top: 0 }) }} focusPhotos={tripPhotosFocus} />

  function showToast(message: string) {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }

  const np = nextPayday(moneyData, today)
  const tripCosts = tripCostsDue(trips)
  const due = dueBeforePayday(moneyData, today, tripCosts)
  const late = overdue(moneyData, today)
  const waiting = waitingCount(inbox)
  const arriving = arrivingToday(inbox.orders, today)
  const comingSoon = comingUp(dates, today).length > 0
  const selfName = trips.people.find((p) => p.is_self)?.name

  const start = weekStart(selected, 1)
  const end = addDays(start, 6)
  const a = dateOf(start), b = dateOf(end)
  const range = `${MONTHS[a.getMonth()].slice(0, 3)} ${a.getDate()} – ${a.getMonth() === b.getMonth() ? '' : MONTHS[b.getMonth()].slice(0, 3) + ' '}${b.getDate()}`

  function openDay(date: string) {
    setSelected(date)
    setTab('week')
  }

  const shared = (
    <>
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} isPhone={isPhone} />
      <DatesPanel open={datesOpen} onClose={() => setDatesOpen(false)} isPhone={isPhone} today={today} list={dates} reload={reloadDates}
        reloadPlans={reloadPlans} peopleNames={trips.people.map((p) => p.name)} onToast={showToast} />
      <InboxPanel open={inboxOpen} onClose={() => setInboxOpen(false)} isPhone={isPhone} focusPaste={inboxPaste} today={today}
        data={inbox} reload={reloadInbox} money={moneyData} trips={trips} onAdded={onInboxAdded} />
      <LogPurchase open={logOpen} onClose={() => setLogOpen(false)} mode={addMode} onMode={setAddMode} reloadPlans={reloadPlans}
        onPasteEmail={() => { setLogOpen(false); openInbox(true) }}
        today={today} money={moneyData} reloadMoney={reloadMoney} onLogged={showToast} />
      {plansError && (
        <div role="alert" className="fixed left-3 right-3 top-3 z-40 rounded-xl bg-bad text-white px-4 py-2.5 text-sm font-bold">
          Couldn't load to-dos and events: {plansError}{' '}
          <button type="button" onClick={() => void reloadPlans()} className="underline bg-transparent border-0 text-white font-bold">Try again</button>
        </div>
      )}
      {toast && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 z-30 rounded-full bg-header text-white px-5 py-2.5 font-bold shadow-2xl whitespace-nowrap"
          style={{ bottom: isPhone ? 'calc(104px + env(safe-area-inset-bottom, 0px))' : '24px' }}>
          {toast}
        </div>
      )}
    </>
  )

  if (isPhone) {
    return (
      <>
        <PhoneShell userId={userId} today={today} tab={phoneTab} onTab={(t) => { setPhoneTab(t); if (t === 'trips') setOpenTripId(null) }}
          money={moneyData} moneyLoaded={moneyLoaded} moneyError={moneyError}
          reloadMoney={reloadMoney} onLog={() => openAdd('buy')} onMoneyIn={() => openAdd('in')}
          homeExtra={<AnytimeTodos today={today} plans={plans} reload={reloadPlans} />}
          homeTop={<>
            <BirthdayCelebration list={dates} today={today} selfName={selfName} compact />
            <InboxHomeCard data={inbox} today={today} onOpen={() => openInbox()} />
            {comingSoon && <DatesHomeCard list={dates} today={today} onOpen={() => setDatesOpen(true)} />}
            <TripModeCard today={today} data={trips} reload={reloadTrips} onOpenTrip={openTrip} />
            <ArrivingToday orders={inbox.orders} today={today} reload={reloadInbox} onOpen={() => openInbox()} />
          </>}
          orders={inbox.orders} dates={dates} onBell={() => setNotifOpen(true)}
          homeAfford={moneyLoaded ? <AffordCheck m={moneyData} today={today} tripCosts={tripCosts} compact /> : null}
          homeDates={comingSoon ? null : <DatesHomeCard list={dates} today={today} onOpen={() => setDatesOpen(true)} />}
          homeBottom={tripsLoaded ? <TravelCard today={today} data={trips} onOpenTrip={openTrip} onPlan={() => openTrip(null)} /> : null}
          plans={plans} trips={trips} tripsView={tripsView} dayExtra={dayPlans} />
        {shared}
      </>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-header text-white border-b-[3px] border-accent-hi safe-x py-3 flex flex-wrap items-center gap-x-4 gap-y-3"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}>
        <div className="text-2xl font-bold">Jae's Runway</div>

        <div role="tablist" aria-label="Screens" className="inline-flex gap-1 rounded-xl bg-header-2 p-1">
          {(['week', 'bills', 'money', 'trips'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); if (t === 'trips') setOpenTripId(null) }}
              className={`h-9 px-4 rounded-lg border-0 font-bold cursor-pointer ${tab === t ? 'bg-accent-hi text-white' : 'bg-transparent text-header-muted hover:text-white'}`}>
              {TAB_LABEL[t]}
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
              {due.billCount + due.subCount + due.tripCount === 0
                ? 'Nothing due before payday'
                : `Due before payday · ${money(due.total)}${due.missingAmounts ? '+' : ''} (${due.billCount} bill${due.billCount === 1 ? '' : 's'}, ${due.subCount} auto-pay${due.tripCount ? `, ${due.tripCount} trip` : ''})`}
            </span>
          )}
          <button type="button" onClick={() => openInbox()} aria-label={`Inbox, ${waiting} to review`}
            className={`inline-flex items-center gap-1.5 rounded-full py-1.5 px-3 font-bold text-sm border-0 cursor-pointer ${waiting ? 'bg-white text-header ring-2 ring-accent-hi' : 'bg-header-2 text-header-muted hover:text-white'}`}>
            <span aria-hidden="true">✉</span> Inbox{waiting ? ` · ${waiting}` : ''}
          </button>
          <DatesPill list={dates} today={today} onOpen={() => setDatesOpen(true)} />
          {arriving.length > 0 && (
            <button type="button" onClick={() => openInbox()}
              className="inline-flex items-center gap-1.5 rounded-full bg-pkg-soft text-pkg-ink py-1.5 px-3 font-bold text-sm border-0 cursor-pointer">
              <span aria-hidden="true">📦</span> {arriving.length} arriving today
            </button>
          )}
          {late.length > 0 && (
            <button type="button" onClick={() => openDay(late[0].date)}
              className="inline-flex items-center rounded-full bg-bad text-white py-1.5 px-3 font-bold text-sm border-0 cursor-pointer">
              {late.length} overdue · {late[0].short} {shortDate(late[0].date)}
            </button>
          )}
        </div>

        <div className="flex-1" />
        <button type="button" onClick={() => openAdd('buy')} aria-label="Add a purchase, to-do or event"
          className="h-11 pl-3 pr-4 inline-flex items-center gap-1.5 rounded-xl border-0 bg-accent-hi text-white font-bold cursor-pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add
        </button>
        <JournalSearch onPick={openDay} />
        <BellButton onClick={() => setNotifOpen(true)} />
        <button type="button" onClick={() => supabase.auth.signOut()}
          className="h-10 px-3 rounded-xl border border-header-2 bg-transparent text-header-muted text-sm font-bold cursor-pointer hover:bg-header-2">
          Sign out
        </button>
      </header>

      <BirthdayCelebration list={dates} today={today} selfName={selfName} />

      {moneyError && (
        <div role="alert" className="safe-x py-2 bg-bad text-white text-sm font-bold">
          Couldn't load bills and money: {moneyError}{' '}
          <button type="button" onClick={() => void reloadMoney()} className="underline bg-transparent border-0 text-white font-bold cursor-pointer">Try again</button>
        </div>
      )}

      {tab === 'week' && (
        <WeekView email={email} userId={userId} today={today} selected={selected} onSelect={setSelected}
          money={moneyData} moneyLoaded={moneyLoaded} reloadMoney={reloadMoney}
          plans={plans} trips={trips} orders={inbox.orders} dates={dates} dayExtra={dayPlans} anytime={<AnytimeTodos today={today} plans={plans} reload={reloadPlans} />} />
      )}
      {tab === 'bills' && <BillsView tripCosts={tripCosts} today={today} money={moneyData} loaded={moneyLoaded} reloadMoney={reloadMoney} onOpenDay={openDay} />}
      {tab === 'trips' && tripsView}
      {tab === 'money' && <MoneyView today={today} money={moneyData} loaded={moneyLoaded} reloadMoney={reloadMoney} onLog={() => openAdd('buy')} onMoneyIn={() => openAdd('in')} afford={<AffordCheck m={moneyData} today={today} tripCosts={tripCosts} />} />}

      {shared}
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
