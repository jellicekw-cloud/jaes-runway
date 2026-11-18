import { useEffect, useState } from 'react'
import { fmtBytes, usageSummary } from '../lib/offline'

// When Supabase can't be reached: what you're looking at is the saved copy from this device.
export function OfflineBanner({ at, isPhone, savedOnly, onRetry }: { at: string; isPhone: boolean; savedOnly: boolean; onRetry: () => void }) {
  const when = new Date(at)
  const label = `${when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return (
    <div role="status" data-testid="offline-banner"
      className="fixed left-3 right-3 z-30 rounded-xl bg-warn text-white px-4 py-2.5 text-sm shadow-xl flex flex-wrap items-center gap-x-3 gap-y-1 md:left-auto md:max-w-xl"
      style={{ bottom: isPhone ? 'calc(104px + env(safe-area-inset-bottom, 0px))' : '16px' }}>
      <span className="flex-1 min-w-[220px]">
        <b>📴 Saved copy from {label}.</b>{' '}
        {savedOnly ? 'You opened it without signing in.' : "Runway's server can't be reached right now."} You can look around, but changes won't save until it's back.
      </span>
      <button type="button" onClick={onRetry} className="h-9 px-3 rounded-lg border border-white/70 bg-transparent text-white font-bold cursor-pointer">Try again</button>
    </div>
  )
}

const DISMISS = 'runway-usage-dismissed'

/** A heads-up when this device is downloading a lot (on pace for over half the free 5 GB a month). Once a day at most. */
export function UsageWarning({ isPhone }: { isPhone: boolean }) {
  const [s, setS] = useState(usageSummary)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS) === new Date().toDateString() } catch { return false } })
  useEffect(() => { const t = window.setInterval(() => setS(usageSummary()), 60_000); return () => window.clearInterval(t) }, [])
  if (s.level === 'ok' || hidden) return null
  const danger = s.level === 'danger'
  return (
    <div role="alert" data-testid="usage-warning"
      className={`fixed left-3 right-3 md:left-auto md:max-w-xl z-30 rounded-xl px-4 py-2.5 text-sm shadow-xl flex flex-wrap items-center gap-x-3 gap-y-1 text-white ${danger ? 'bg-bad' : 'bg-warn'}`}
      style={{ bottom: isPhone ? 'calc(104px + env(safe-area-inset-bottom, 0px))' : '16px' }}>
      <span className="flex-1 min-w-[220px]">
        <b>{danger ? '⚠️ Runway is using a lot of data' : 'Heads-up: Runway is using more data than usual'}</b>{' '}
        · this device: {fmtBytes(s.today)} today, about {fmtBytes(s.perDay)} a day. The free plan allows 5 GB a month. Tell Claude so it can find out why.
      </span>
      <button type="button" onClick={() => { try { localStorage.setItem(DISMISS, new Date().toDateString()) } catch { /* fine */ } setHidden(true) }}
        className="h-9 px-3 rounded-lg border border-white/70 bg-transparent text-white font-bold cursor-pointer">OK</button>
    </div>
  )
}

/** Settings: how much this device has downloaded. */
export function UsageCard() {
  const s = usageSummary()
  const pct = Math.min(100, (s.perDay * 30) / (5 * 1024 ** 3) * 100)
  return (
    <section aria-label="Data used" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2" data-testid="usage-card">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-base font-bold">Data used (this device)</h3>
        <span className={`text-sm font-bold ${s.level === 'ok' ? 'text-pay-ink' : s.level === 'high' ? 'text-warn' : 'text-bad'}`}>
          {s.level === 'ok' ? 'All good' : s.level === 'high' ? 'Higher than usual' : 'Too high'}
        </span>
      </div>
      <span className="h-2.5 rounded-full bg-line overflow-hidden"><span className={`block h-full rounded-full ${s.level === 'ok' ? 'bg-pay' : s.level === 'high' ? 'bg-warn' : 'bg-bad'}`} style={{ width: `${Math.max(pct, 1)}%` }} /></span>
      <span className="text-sm text-muted">
        Today {fmtBytes(s.today)} · last 7 days {fmtBytes(s.last7)} · last 30 days {fmtBytes(s.last30)}.
        At this pace, about {fmtBytes(s.perDay * 30)} a month on this device (the free plan allows 5 GB for all devices together).
      </span>
    </section>
  )
}
