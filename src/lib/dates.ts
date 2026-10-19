// Calendar days are handled as 'YYYY-MM-DD' strings in your local time,
// never as UTC timestamps, so an 11 PM entry never lands on the next day.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad = (n: number) => (n < 10 ? '0' + n : String(n))

export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dateOf(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(): string {
  return keyOf(new Date())
}

export function addDays(key: string, n: number): string {
  const d = dateOf(key)
  d.setDate(d.getDate() + n)
  return keyOf(d)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** Start of the week containing `key`. weekStartsOn: 0 = Sunday, 1 = Monday. */
export function weekStart(key: string, weekStartsOn = 1): string {
  const dow = dateOf(key).getDay()
  return addDays(key, -((dow - weekStartsOn + 7) % 7))
}

export function lastDayOfMonth(key: string): number {
  const d = dateOf(key)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** A due day of 29–31 falls on the last day in shorter months. */
export function isMonthlyDueOn(dueDay: number, key: string): boolean {
  return dateOf(key).getDate() === Math.min(dueDay, lastDayOfMonth(key))
}

export function shortDate(key: string): string {
  const d = dateOf(key)
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
}

export function isRepeatingOn(start: string | null, everyDays: number, key: string): boolean {
  if (!start) return false
  const diff = daysBetween(start, key)
  return diff >= 0 && diff % everyDays === 0
}

export function money(n: number | string | null | undefined): string {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
