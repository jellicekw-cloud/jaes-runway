import { useEffect, useRef, useState } from 'react'
import {
  loadAlertPrefs, pushState, pushSupported, saveAlertPrefs, sendTestPush, turnOffPush, turnOnPush, type AlertPrefs, type PushState,
} from '../lib/push'

const label = 'text-xs font-bold tracking-widest uppercase text-muted'

/** 🔔 in the header: opens the notification settings. */
export function BellButton({ onClick, dark = true }: { onClick: () => void; dark?: boolean }) {
  return (
    <button type="button" aria-label="Notifications" onClick={onClick}
      className={`size-11 rounded-full border-0 grid place-items-center cursor-pointer ${dark ? 'bg-header-2 text-white' : 'bg-surface-2 text-fg'}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    </button>
  )
}

function Toggle({ on, onChange, title, note }: { on: boolean; onChange: (v: boolean) => void; title: string; note: string }) {
  return (
    <label className="flex items-start gap-3 py-2.5 border-t border-line first:border-t-0 cursor-pointer">
      <span className="flex-1 min-w-0">
        <b className="block">{title}</b>
        <span className="block text-sm text-muted">{note}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-6 accent-[var(--accent)] shrink-0" />
    </label>
  )
}

export function NotificationsPanel({ open, onClose, isPhone }: { open: boolean; onClose: () => void; isPhone: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [state, setState] = useState<PushState>('off')
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      el.showModal(); setMsg(null)
      void Promise.all([pushState(), loadAlertPrefs()]).then(([s, p]) => { setState(s); setPrefs(p); setLoaded(true) })
    }
    if (!open && el.open) el.close()
  }, [open])

  async function act(f: () => Promise<unknown>, ok?: string) {
    setBusy(true); setMsg(null)
    try { await f(); setState(await pushState()); if (ok) setMsg({ ok: true, text: ok }) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' }) }
    setBusy(false)
  }
  async function set(patch: Partial<AlertPrefs>) {
    if (!prefs) return
    setPrefs({ ...prefs, ...patch })
    try { await saveAlertPrefs(patch) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Couldn\'t save' }) }
  }

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="notif-title"
      className={`p-0 text-fg bg-bg border-line backdrop:bg-black/50 ${isPhone ? 'm-0 w-full max-w-full h-dvh max-h-dvh border-0' : 'm-0 ms-auto h-dvh max-h-dvh w-[440px] max-w-full border-l'}`}>
      <div className="sticky top-0 z-10 bg-header text-white px-4 py-3 flex items-center gap-3" style={{ paddingTop: isPhone ? 'max(12px, env(safe-area-inset-top, 0px))' : undefined }}>
        <h2 id="notif-title" className="m-0 flex-1 text-2xl font-bold">Notifications</h2>
        <button type="button" onClick={onClose} aria-label="Close notifications" className="size-10 rounded-full border border-header-2 bg-transparent text-white cursor-pointer">✕</button>
      </div>
      <div className="p-4 flex flex-col gap-5">
        {!loaded ? <p className="m-0 text-muted">Loading…</p> : (
          <>
            <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
              <span className={label}>This phone</span>
              {state === 'unsupported' && <p className="m-0">This browser can't show notifications. On your Android phone, open Runway in Chrome (or from its Home screen icon).</p>}
              {state === 'blocked' && <p className="m-0">Notifications are blocked for Runway. In Chrome: ⋮ → Settings → Site settings → Notifications, allow Runway, then come back.</p>}
              {state === 'off' && (
                <>
                  <p className="m-0">Get your morning summary and a heads-up when something needs you, even when Runway is closed.</p>
                  <button type="button" disabled={busy || !prefs} onClick={() => void act(turnOnPush, 'Notifications are on for this phone.')}
                    className="h-12 rounded-2xl border-0 bg-accent text-accent-ink text-lg font-bold cursor-pointer disabled:opacity-60">
                    {busy ? 'Turning on…' : 'Turn on notifications'}
                  </button>
                </>
              )}
              {state === 'on' && (
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-pay-ink flex-1">✓ On for this phone</b>
                  <button type="button" disabled={busy} onClick={() => void act(async () => { const r = await sendTestPush(); if (!r.sent) throw new Error('Nothing was delivered. Try turning notifications off and on again.') }, 'Sent. It should pop up in a few seconds.')}
                    className="h-10 px-3 rounded-xl border border-line bg-surface text-fg font-bold cursor-pointer">Send a test</button>
                  <button type="button" disabled={busy} onClick={() => void act(turnOffPush, 'Notifications are off for this phone.')}
                    className="h-10 px-3 rounded-xl border border-line bg-transparent text-muted font-bold cursor-pointer">Turn off</button>
                </div>
              )}
              {!prefs && state !== 'unsupported' && <p role="alert" className="m-0 text-sm font-bold text-bad">Run 07_alerts.sql in Supabase first (see the setup notes).</p>}
              {msg && <p role={msg.ok ? 'status' : 'alert'} className={`m-0 text-sm font-bold ${msg.ok ? 'text-pay-ink' : 'text-bad'}`}>{msg.text}</p>}
            </section>

            {prefs && (
              <>
                <section className="rounded-2xl border border-line bg-surface px-4 py-1.5">
                  <Toggle on={prefs.alert_morning} onChange={(v) => void set({ alert_morning: v })} title="☀️ Morning summary"
                    note="Bills due today, packages, birthdays this week, payday, trips and your Inbox, in one notification. Skipped if there's nothing to say." />
                  {prefs.alert_morning && (
                    <label className="flex items-center justify-between gap-3 pb-2.5">
                      <span className="text-sm text-muted">Send it at</span>
                      <input type="time" value={prefs.alert_morning_at} onChange={(e) => e.target.value && void set({ alert_morning_at: e.target.value })}
                        className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-fg" />
                    </label>
                  )}
                  <Toggle on={prefs.alert_inbox} onChange={(v) => void set({ alert_inbox: v })} title="✉ Inbox" note="Right away when a forwarded email is waiting for you to review." />
                  <Toggle on={prefs.alert_bills} onChange={(v) => void set({ alert_bills: v })} title="💳 Bills" note="The evening before a card, bill or Afterpay payment is due and not marked paid." />
                  <Toggle on={prefs.alert_side_work} onChange={(v) => void set({ alert_side_work: v })} title="💵 Side work" note="Late afternoon on the 15th and 30th if you haven't confirmed it landed." />
                </section>

                <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2">
                  <span className={label}>Quiet hours</span>
                  <p className="m-0 text-sm text-muted">Nothing pings in this window. Anything that comes in waits until it ends.</p>
                  <div className="flex items-center gap-2">
                    <input type="time" aria-label="Quiet from" value={prefs.quiet_from} onChange={(e) => e.target.value && void set({ quiet_from: e.target.value })}
                      className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-fg" />
                    <span className="text-muted">to</span>
                    <input type="time" aria-label="Quiet until" value={prefs.quiet_until} onChange={(e) => e.target.value && void set({ quiet_until: e.target.value })}
                      className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-fg" />
                  </div>
                </section>
                <p className="m-0 text-sm text-muted">Packages, trips and birthdays show up in the morning summary.</p>
              </>
            )}
          </>
        )}
      </div>
    </dialog>
  )
}

export { pushSupported }
