// Runway keeps a copy of the last data it loaded on this device, so if Supabase is ever
// unreachable (down, offline, or paused for going over the free limit) you can still look
// at your bills, budget, balances and plans. It's read-only until the server is back.
//
// It also counts how much this device downloads from Supabase each day, so you get a heads-up
// long before the free plan's 5 GB a month runs out.

const SNAP = 'runway-snap-'
const META = 'runway-snap-meta'
const USAGE = 'runway-usage'

export interface SnapMeta { userId: string; email: string; at: string }

const read = <T>(k: string): T | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null } catch { return null }
}
const write = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true } catch { return false }
}

/** Save what just loaded (money, plans, trips, inbox, budget). */
export function saveSnapshot(key: string, data: unknown, who?: { userId: string; email: string }) {
  if (!write(SNAP + key, { at: new Date().toISOString(), data })) {
    // Out of room on this device: drop the biggest copy (inbox) and try once more
    try { localStorage.removeItem(SNAP + 'inbox') } catch { /* fine */ }
    write(SNAP + key, { at: new Date().toISOString(), data })
  }
  if (who) write(META, { ...who, at: new Date().toISOString() } satisfies SnapMeta)
}

export function loadSnapshot<T>(key: string): { at: string; data: T } | null {
  return read<{ at: string; data: T }>(SNAP + key)
}

export const snapshotMeta = () => read<SnapMeta>(META)

/** Sign-out clears the saved copy (so nobody else on this device sees it). */
export function clearSnapshots() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(SNAP)) localStorage.removeItem(k)
  } catch { /* fine */ }
}

/** Is this error "Supabase can't be reached / is paused" (as opposed to a normal problem)? */
export function isServerDown(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase()
  const code = String((e as { code?: string | number })?.code ?? '')
  return /exceed_|quota|restricted|failed to fetch|network|load failed|fetch failed|timed? ?out|402|503|502|504/.test(msg) || ['402', '502', '503', '504', 'PGRST000', 'PGRST001', 'PGRST002'].includes(code)
}

// ---------------------------------------------------------------------------
// How much this device downloads from Supabase
// ---------------------------------------------------------------------------

type Usage = Record<string, number>   // { '2026-11-24': bytes }
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

let pending = 0
let timer: number | undefined
function addBytes(n: number) {
  pending += n
  if (timer !== undefined) return
  timer = window.setTimeout(() => {
    timer = undefined
    const u = read<Usage>(USAGE) ?? {}
    const day = localDay()
    u[day] = (u[day] ?? 0) + pending
    pending = 0
    // keep about a month
    const keep = Object.keys(u).sort().slice(-35)
    write(USAGE, Object.fromEntries(keep.map((k) => [k, u[k]])))
  }, 1000)
}

/** fetch for the Supabase client: same as normal, but counts the bytes that come back. */
export const countingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  try {
    const len = Number(res.headers.get('content-length'))
    if (len > 0) addBytes(len)
    else void res.clone().arrayBuffer().then((b) => addBytes(b.byteLength)).catch(() => { /* fine */ })
  } catch { /* never get in the way of the real request */ }
  return res
}

export interface UsageSummary { today: number; last7: number; last30: number; perDay: number; level: 'ok' | 'high' | 'danger' }

/** This device's downloads. "high" ≈ on pace for over half the free 5 GB a month; "danger" ≈ on pace to go over. */
export function usageSummary(): UsageSummary {
  const u = read<Usage>(USAGE) ?? {}
  const days = Object.keys(u).sort()
  const now = new Date()
  const back = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const sum = (n: number) => days.filter((d) => d > back(n)).reduce((t, d) => t + u[d], 0)
  const today = u[localDay()] ?? 0
  const last7 = sum(7), last30 = sum(30)
  const counted = Math.max(1, Math.min(7, days.filter((d) => d > back(7)).length))
  const perDay = last7 / counted
  const month = Math.max(perDay * 30, today * 30)
  const GB = 1024 ** 3
  return { today, last7, last30, perDay, level: month > 4 * GB ? 'danger' : month > 2.5 * GB ? 'high' : 'ok' }
}

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(0, Math.round(n / 1024))} KB`
}
