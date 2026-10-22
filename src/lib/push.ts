import { supabase } from './supabase'

// Phone notifications (Web Push). The phone gets a subscription from the browser; the email reader
// (Supabase function) keeps it and sends the alerts.

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on'

export interface AlertPrefs {
  alert_morning: boolean
  alert_morning_at: string
  alert_inbox: boolean
  alert_bills: boolean
  alert_side_work: boolean
  quiet_from: string
  quiet_until: string
}

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('runway-inbox', { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) msg = j.error === 'Unknown action' ? 'Update the email reader in Supabase to turn on notifications (see the setup notes).' : j.error
    } catch { /* keep generic */ }
    throw new Error(msg)
  }
  return data as T
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  return existing ?? navigator.serviceWorker.register('/sw.js')
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  try {
    const reg = await registration()
    const sub = await reg.pushManager.getSubscription()
    return sub && Notification.permission === 'granted' ? 'on' : 'off'
  } catch { return 'off' }
}

function keyBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const deviceName = () => {
  const ua = navigator.userAgent
  const m = ua.match(/Android [\d.]+; ([^;)]+)/)
  return m ? m[1].trim() : /iPhone/.test(ua) ? 'iPhone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'This device'
}

/** Asks for permission (must come from a tap), subscribes this phone and saves it. */
export async function turnOnPush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser can\'t do notifications. On Android, open Runway in Chrome.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied'
    ? 'Notifications are blocked for Runway. Allow them in your phone\'s settings for Chrome (Site settings → Notifications), then try again.'
    : 'Tap Allow when your phone asks.')
  const { publicKey } = await call<{ publicKey: string }>({ action: 'push_key' })
  const reg = await registration()
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource })
  await call({ action: 'push_subscribe', subscription: sub.toJSON(), device: deviceName() })
}

export async function turnOffPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await call({ action: 'push_unsubscribe', endpoint: sub.endpoint }).catch(() => null)
    await sub.unsubscribe()
  }
}

export const sendTestPush = () => call<{ sent: number }>({ action: 'push_test' })

export async function loadAlertPrefs(): Promise<AlertPrefs | null> {
  const { data, error } = await supabase.from('settings')
    .select('alert_morning, alert_morning_at, alert_inbox, alert_bills, alert_side_work, quiet_from, quiet_until').maybeSingle()
  if (error) return null   // 07_alerts.sql not run yet
  if (!data) return null
  const t = (v: string) => String(v).slice(0, 5)
  return { ...(data as AlertPrefs), alert_morning_at: t(data.alert_morning_at), quiet_from: t(data.quiet_from), quiet_until: t(data.quiet_until) }
}

export async function saveAlertPrefs(patch: Partial<AlertPrefs>): Promise<void> {
  const { data: u } = await supabase.auth.getSession()
  const { error } = await supabase.from('settings').update(patch).eq('user_id', u.session?.user.id ?? '')
  if (error) throw error
}
